package payments

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

// UserError is a failure whose message is already plain words for the owner:
// it is shown as it is, without the technical prefix other errors get.
type UserError struct {
	Msg string
	Err error // what the provider answered, for logs and errors.As
}

func (e *UserError) Error() string { return e.Msg }
func (e *UserError) Unwrap() error { return e.Err }

// CleanKey trims what a paste brings along: spaces, line breaks and the
// quotes around a key copied out of a config file.
func CleanKey(key string) string {
	const junk = " \t\r\n\"'`“”‘’"
	return strings.Trim(key, junk)
}

func statusOf(err error) int {
	var e *APIError
	if errors.As(err, &e) {
		return e.Status
	}
	return 0
}

// paddleProblem says in words what Paddle's answer means. perms are the
// permissions the failed call needs: Paddle answers 403 without naming them.
func paddleProblem(ctx context.Context, err error, perms ...string) error {
	switch st := statusOf(err); {
	case st == http.StatusUnauthorized:
		return &UserError{msgPaddleRejected, err}
	case st == http.StatusForbidden && len(perms) > 0:
		return missingPermissions(err, perms)
	case st >= 500, st == 0 && ctx.Err() == nil: // a client timeout is Paddle not answering
		return &UserError{msgPaddleUnreachable, err}
	}
	return err
}

func missingPermissions(err error, perms []string) error {
	msg := fmt.Sprintf(msgPaddleMissingOne, perms[0])
	if len(perms) > 1 {
		msg = fmt.Sprintf(msgPaddleMissingMany, strings.Join(perms, ", "))
	}
	return &UserError{msg, err}
}

// probe reads one row of a list: the cheapest call that shows the key works
// in this environment and holds the permission to read that list.
func (a *PaddleAPI) probe(ctx context.Context, key string, sandbox bool, list string) error {
	return callN(ctx, probeAttempts, "GET", a.baseURL(sandbox)+"/"+list+"?per_page=1", paddleHdr(key), nil, nil)
}

// probeAttempts: the owner is waiting on a probe, so a slow Paddle gets one
// more try instead of the four (and the minute of waiting) a background call has.
const probeAttempts = 2

// environment finds out which Paddle the key belongs to: the prefix says so;
// a key without one is tried against live and, when live doesn't know it
// (401) or won't let it in (403), once against the sandbox. When both refuse
// it (401, or 403 from both), live's answer is the one reported, unless the
// sandbox knew the key and refused something else. The transactions list is the probe.
func (a *PaddleAPI) environment(ctx context.Context, key string) (sandbox bool, err error) {
	switch {
	case strings.HasPrefix(key, "pdl_sdbx_"):
		return true, a.probe(ctx, key, true, "transactions")
	case strings.HasPrefix(key, "pdl_live_"):
		return false, a.probe(ctx, key, false, "transactions")
	}
	liveErr := a.probe(ctx, key, false, "transactions")
	if st := statusOf(liveErr); st != http.StatusUnauthorized && st != http.StatusForbidden {
		return false, liveErr
	}
	sandboxErr := a.probe(ctx, key, true, "transactions")
	if sandboxErr == nil {
		return true, nil
	}
	if st := statusOf(sandboxErr); st == http.StatusUnauthorized || (st == http.StatusForbidden && statusOf(liveErr) == http.StatusForbidden) {
		return false, liveErr
	}
	return true, sandboxErr
}

// Setup finds the key's environment, checks that the key can read what
// reconciliation reads, and creates the webhook endpoint there. Setup.Test
// says which environment answered, and the connection keeps it, so every
// later call goes to the same Paddle.
func (a *PaddleAPI) Setup(ctx context.Context, key string, _ bool, hookURL string) (Setup, error) {
	sandbox, err := a.environment(ctx, key)
	var missing []string
	if statusOf(err) == http.StatusForbidden {
		missing, err = append(missing, permTransactionRead), nil
	}
	if err != nil {
		return Setup{}, paddleProblem(ctx, err)
	}
	if err := a.probe(ctx, key, sandbox, "adjustments"); err != nil {
		if statusOf(err) != http.StatusForbidden {
			return Setup{}, paddleProblem(ctx, err)
		}
		missing = append(missing, permAdjustmentRead)
	}
	if len(missing) > 0 {
		return Setup{}, missingPermissions(nil, missing)
	}
	body := map[string]any{"description": "trckable revenue attribution", "type": "url", "destination": hookURL,
		"subscribed_events": PaddleEvents, "api_version": 1, "traffic_source": "all"}
	var out struct {
		Data struct {
			ID                string `json:"id"`
			EndpointSecretKey string `json:"endpoint_secret_key"`
		} `json:"data"`
	}
	if err := call(ctx, "POST", a.baseURL(sandbox)+"/notification-settings", paddleHdr(key), jsonBody(body), &out); err != nil {
		return Setup{}, paddleProblem(ctx, err, permNotificationWrite)
	}
	return Setup{RemoteID: out.Data.ID, Secret: out.Data.EndpointSecretKey, Label: "Paddle", Test: sandbox}, nil
}
