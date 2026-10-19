// Package channels reads the views of a team's own social accounts (YouTube,
// Instagram, Threads) through each platform's official API, with the owner's
// own sign-in, and keeps one number per account and day.
//
// It is read-only (one analytics scope per platform), asks for nothing it
// could change, stores the tokens sealed, and deletes an account's tokens and
// every day it holds when the account is disconnected: the platforms require
// it. Self-hosters bring their own app keys; without them the section only
// says how to set them up.
//
// No SDK. Each platform is an authorization-code flow and one or two JSON
// endpoints.
package channels

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/secrets"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The platforms, in the order the dashboard shows them.
const (
	YouTube   = "youtube"
	Instagram = "instagram"
	Threads   = "threads"
)

// Platforms is every platform, in display order.
var Platforms = []string{YouTube, Instagram, Threads}

// Day is one account's views on one day.
type Day = sqlite.SocialDay

// Token is what a sign-in gave: the access token, a refresh token where the
// platform has one, and when the access token stops working. Both are Secrets,
// so a log line or a JSON answer cannot print them.
type Token struct {
	Access, Refresh secrets.Secret
	Expires         time.Time
}

// Identity is who signed in: the platform's id (what its API is asked about)
// and the name to show.
type Identity struct{ ID, Handle string }

// Connector is one platform.
type Connector interface {
	// Platform is the name used in addresses and in the table.
	Platform() string
	// Configured says whether the app keys are set.
	Configured() bool
	// SignInURL is the platform's consent page.
	SignInURL(redirect, state, verifier string) string
	// Exchange trades the code for a token and says whose it is. The error
	// never carries the code or a token.
	Exchange(ctx context.Context, redirect, code, verifier string) (Token, Identity, error)
	// Refresh makes a new token from an old one; ErrDenied when it cannot.
	Refresh(ctx context.Context, t Token) (Token, error)
	// Daily returns the views of each day from..to (YYYY-MM-DD, inclusive).
	Daily(ctx context.Context, t Token, id Identity, from, to string) ([]Day, error)
	// Revoke tells the platform the access is over; best effort.
	Revoke(ctx context.Context, t Token)
	// Backfill is how many days back the first pull reaches.
	Backfill() int
	// MaxStale is how long stored data may go without being refreshed before
	// it must be deleted (the platform's rule); zero for none.
	MaxStale() time.Duration
	// RefreshBefore is how long before the token ends it is renewed.
	RefreshBefore() time.Duration
}

// Errors a pull tells apart.
var (
	// ErrDenied: the platform refused the token. The owner signs in again.
	ErrDenied = errors.New("channels: the platform refused the access")
	// ErrBadSignedRequest: a deauthorization call that is not the platform's.
	ErrBadSignedRequest = errors.New("channels: not a signed request from the platform")
)

// LimitError is the platform saying slow down; the pull is tried again at the
// next round.
type LimitError struct{ Wait time.Duration }

func (e *LimitError) Error() string { return "channels: the platform's rate limit is used up for now" }

// APIError is another refusal, with the platform's status (never its text:
// it is not ours to put in a page, and it may quote the request).
type APIError struct{ Status int }

func (e *APIError) Error() string { return "channels: the platform answered " + strconv.Itoa(e.Status) }

// Doer sends requests, tries a throttled one again with a growing wait, and
// turns every failure into one of the errors above. Nothing it returns holds
// the request's address: a Meta token travels in the query of some calls.
type Doer struct {
	HTTP *http.Client // nil: a client with a timeout
	// Sleep waits d or until ctx ends; nil is a timer.
	Sleep func(ctx context.Context, d time.Duration) error
	// Tries is how often a throttled or failing request is tried again
	// (zero: 2).
	Tries int
	// Pace is the least time before a request; zero is none, which is how
	// tests run. Instagram's per-day calls set it so a pull stays far under
	// the hourly limit.
	Pace time.Duration
}

func (d *Doer) client() *http.Client {
	if d.HTTP != nil {
		return d.HTTP
	}
	return &http.Client{Timeout: 30 * time.Second}
}

func (d *Doer) sleep(ctx context.Context, w time.Duration) error {
	if w <= 0 {
		return ctx.Err()
	}
	if d.Sleep != nil {
		return d.Sleep(ctx, w)
	}
	t := time.NewTimer(w)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// get is a GET with an optional bearer token; query goes in the address.
func (d *Doer) get(ctx context.Context, u string, q url.Values, bearer secrets.Secret, into any) error {
	return d.do(ctx, func() (*http.Request, error) {
		full := u
		if len(q) > 0 {
			full += "?" + q.Encode()
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, full, nil)
		if err == nil && !bearer.Empty() {
			req.Header.Set("Authorization", "Bearer "+bearer.Reveal())
		}
		return req, err
	}, into)
}

// post is a form POST.
func (d *Doer) post(ctx context.Context, u string, form url.Values, into any) error {
	return d.do(ctx, func() (*http.Request, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, strings.NewReader(form.Encode()))
		if err == nil {
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		}
		return req, err
	}, into)
}

func (d *Doer) do(ctx context.Context, build func() (*http.Request, error), into any) error {
	tries := d.Tries
	if tries == 0 {
		tries = 2
	}
	wait := 2 * time.Second
	for attempt := 0; ; attempt++ {
		if err := d.sleep(ctx, d.Pace); err != nil {
			return err
		}
		req, err := build()
		if err != nil {
			return errors.New("channels: bad request")
		}
		resp, err := d.client().Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			// The error holds the address, which may hold a token.
			return errors.New("channels: could not reach the platform")
		}
		data, rerr := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
		resp.Body.Close()
		if rerr != nil {
			return errors.New("channels: the platform's answer was cut off")
		}
		switch kind := classify(resp.StatusCode, data); kind {
		case kindOK:
			if into == nil {
				return nil
			}
			if err := json.Unmarshal(data, into); err != nil {
				return errors.New("channels: the platform's answer could not be read")
			}
			return nil
		case kindDenied:
			return ErrDenied
		case kindRetry:
			if s, err := strconv.Atoi(resp.Header.Get("Retry-After")); err == nil && s > 0 && s <= 60 {
				wait = time.Duration(s) * time.Second
			}
			if attempt >= tries {
				if resp.StatusCode >= 500 {
					return &APIError{Status: resp.StatusCode}
				}
				return &LimitError{Wait: time.Hour}
			}
			if err := d.sleep(ctx, wait); err != nil {
				return err
			}
			wait *= 2
		default:
			return &APIError{Status: resp.StatusCode}
		}
	}
}

type answerKind int

const (
	kindOK answerKind = iota
	kindDenied
	kindRetry
	kindFail
)

// classify reads a status and, for the refusals, the platform's error shape
// (Google: error.status/reason, Meta: error.code, OAuth: error=invalid_grant).
func classify(status int, body []byte) answerKind {
	if status/100 == 2 {
		return kindOK
	}
	var e struct {
		Error json.RawMessage `json:"error"`
	}
	_ = json.Unmarshal(body, &e)
	var meta struct {
		Code int `json:"code"`
	}
	_ = json.Unmarshal(e.Error, &meta)
	text := string(body)
	switch {
	case status == http.StatusTooManyRequests, status >= 500,
		metaThrottle[meta.Code],
		status == http.StatusForbidden && (strings.Contains(text, "rateLimitExceeded") || strings.Contains(text, "quotaExceeded") || strings.Contains(text, "RESOURCE_EXHAUSTED")):
		return kindRetry
	case status == http.StatusUnauthorized, status == http.StatusForbidden,
		meta.Code == 190, meta.Code == 10, meta.Code == 200,
		strings.Contains(text, "invalid_grant"), strings.Contains(text, "invalid_token"):
		return kindDenied
	}
	return kindFail
}

// metaThrottle are Meta's rate limit codes: application, user, page and
// business use cases.
var metaThrottle = map[int]bool{4: true, 17: true, 32: true, 613: true, 80001: true, 80002: true, 80006: true}

// day is a time's UTC date.
func day(t time.Time) string { return t.UTC().Format(time.DateOnly) }

func dayStart(s string) (time.Time, error) {
	t, err := time.ParseInLocation(time.DateOnly, s, time.UTC)
	if err != nil {
		return t, fmt.Errorf("channels: bad day %q", s)
	}
	return t, nil
}
