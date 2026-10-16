package api

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Signing in with a code sent by email: the phone app asks for one, the person
// types the six digits, and the phone gets a sign-in of its own (devices.go).
// A server that cannot send email says so in its setup answer, and the app
// uses the password instead.

// deviceIn is what the app says about itself when it signs in.
type deviceIn struct {
	Name     string `json:"name"`
	Platform string `json:"platform"`
}

const (
	codeAsks        = 10 // codes one address may ask for in codeWindow
	codeAsksEmail   = 5  // codes one inbox is sent in codeWindow, whoever asks
	codeWindow      = 10 * time.Minute
	codeSendTimeout = 30 * time.Second
)

// emailCodesOn says whether this server can send a code by email.
func (a *API) emailCodesOn() bool { return a.SendLoginMail != nil || alerts.Mail != nil }

func (a *API) sendLoginMail(ctx context.Context, to string, r alerts.Report) error {
	if a.SendLoginMail != nil {
		return a.SendLoginMail(ctx, to, r)
	}
	return alerts.SendReport(ctx, to, r)
}

// locate is the approximate place of an address, "Berlin, Germany", or empty.
func (a *API) locate(ip string) string {
	if a.Locate == nil {
		return ""
	}
	return a.Locate(ip)
}

// codeSource says where a code was asked from: the phone app names its device,
// anything else is the dashboard in a browser.
func codeSource(d *deviceIn, place string) alerts.CodeMail {
	c := alerts.CodeMail{Source: "the trckable dashboard", Requester: "a web browser", Place: place}
	if d != nil && (d.Name != "" || d.Platform != "") {
		c.Source = "the trckable mobile app"
		c.Requester = strings.TrimSpace(clip(d.Name, 60) + " " + platformLabel(d.Platform))
	}
	return c
}

func platformLabel(p string) string {
	switch strings.ToLower(strings.TrimSpace(p)) {
	case "android":
		return "(Android)"
	case "ios":
		return "(iOS)"
	case "":
		return ""
	}
	return "(" + clip(p, 20) + ")"
}

func clip(s string, n int) string {
	if r := []rune(strings.TrimSpace(s)); len(r) > n {
		return string(r[:n])
	}
	return strings.TrimSpace(s)
}

// sixDigits is a random code, "482913".
func sixDigits() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// loginCode sends a sign-in code to a person's email. The answer is the same
// whether or not the address belongs to anyone (or the server can send mail),
// and it does not wait for the mail to go: the answer says nothing about it.
func (a *API) loginCode(w http.ResponseWriter, r *http.Request) {
	if !jsonOnly(r) {
		fail(w, http.StatusUnsupportedMediaType, "send JSON")
		return
	}
	a.init()
	var in struct {
		Email  string
		Device *deviceIn
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	email := normEmail(in.Email)
	if email == "" {
		fail(w, http.StatusBadRequest, "enter your email address")
		return
	}
	// Counted for every address, known or not, so the limit says nothing
	// about who has an account.
	now := a.Now()
	if !a.loginRate.allow("code-ip:"+a.ip(r), now, a.ipMax(r, codeAsks), codeWindow) ||
		!a.loginRate.allow("code-to:"+email, now, codeAsksEmail, codeWindow) {
		fail(w, http.StatusTooManyRequests, "too many tries, try again in a few minutes")
		return
	}
	if a.emailCodesOn() {
		// Everything that depends on who the address belongs to (the lookup,
		// the stored code, the mail) happens after the answer has gone, so
		// the answer's timing is the same for every address.
		src := codeSource(in.Device, a.locate(a.ip(r)))
		go a.issueCode(context.WithoutCancel(r.Context()), email, now, src)
	}
	writeJSON(w, http.StatusAccepted, map[string]bool{"ok": true})
}

func (a *API) issueCode(ctx context.Context, email string, now time.Time, src alerts.CodeMail) {
	ctx, cancel := context.WithTimeout(ctx, codeSendTimeout)
	defer cancel()
	u, err := a.Ctl.UserByEmail(ctx, email)
	if err != nil {
		if !errors.Is(err, auth.ErrNotFound) {
			slog.Warn("sign-in code: could not look the person up", "err", err)
		}
		return
	}
	code, err := sixDigits()
	if err != nil {
		slog.Warn("sign-in code: no random number", "err", err)
		return
	}
	if err := a.Ctl.PutLoginCode(ctx, u.ID, code, now); err != nil {
		slog.Warn("sign-in code: could not keep it", "err", err)
		return
	}
	spaced := code[:3] + " " + code[3:]
	src.Code, src.At = spaced, now
	rep := src.Report("Your trckable app sign-in code: " + spaced)
	if err := a.sendLoginMail(ctx, u.Email, rep); err != nil {
		slog.Warn("sign-in code: the email could not be sent", "user", u.ID, "err", err)
	}
}

const badCode = "that code is not right, or it has run out: ask for a new one"

// loginCodeVerify signs in with the emailed code. With a device it answers a
// token for the phone, without one a browser session. A person with two-step
// sign-in gives that code too, as second_code; the emailed code stays good
// until it has.
func (a *API) loginCodeVerify(w http.ResponseWriter, r *http.Request) {
	if !jsonOnly(r) {
		fail(w, http.StatusUnsupportedMediaType, "send JSON")
		return
	}
	a.init()
	var in struct {
		Email      string
		Code       string
		SecondCode string `json:"second_code"`
		Device     *deviceIn
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	lims := a.loginLimits(r, in.Email)
	now := a.Now()
	if !a.loginRate.reserve(now, lims...) {
		fail(w, http.StatusTooManyRequests, "too many attempts, try again in a few minutes")
		return
	}
	code := cleanCode(in.Code)
	u, err := a.Ctl.UserByEmail(r.Context(), in.Email)
	if errors.Is(err, auth.ErrNotFound) {
		// An unknown address does the same work a known one with a wrong
		// code does (a read and a write on a stand-in id), so the time taken
		// does not say whether the address has an account.
		err = a.Ctl.CheckLoginCode(r.Context(), "-", code, now)
	} else if err == nil {
		err = a.Ctl.CheckLoginCode(r.Context(), u.ID, code, now)
	}
	if err != nil {
		if !errors.Is(err, auth.ErrBadLogin) {
			a.loginRate.release(now, lims...)
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		fail(w, http.StatusUnauthorized, badCode)
		return
	}
	// The code was right: no guess.
	a.loginRate.release(now, lims...)
	// A second-step code is a guess too: held against the same limits as a
	// password login holds it.
	if in.SecondCode != "" {
		if !a.codeTries(w, &u) {
			return
		}
		if !a.loginRate.reserve(now, lims...) {
			fail(w, http.StatusTooManyRequests, "too many attempts, try again in a few minutes")
			return
		}
	}
	err = a.Ctl.CheckSecondStep(r.Context(), u.ID, cleanCode(in.SecondCode), a.unix)
	a.codeResult(&u, in.SecondCode, err)
	if in.SecondCode != "" && !errors.Is(err, auth.ErrBadLogin) {
		a.loginRate.release(now, lims...)
	}
	switch {
	case errors.Is(err, sqlite.ErrNeedsCode):
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"error":      "enter the six-digit code from your authenticator app",
			"needs_code": true,
		})
		return
	case errors.Is(err, auth.ErrBadLogin):
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"error":      "that code is not right — check your phone's clock, or use a recovery code",
			"needs_code": true,
		})
		return
	case err != nil:
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Used up only now, and only once, even when two requests race.
	if err := a.Ctl.SpendLoginCode(r.Context(), u.ID, code); err != nil {
		if errors.Is(err, auth.ErrBadLogin) {
			fail(w, http.StatusUnauthorized, badCode)
			return
		}
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.signedIn(w, r, u, in.Device)
}

// signedIn finishes a sign-in whose proof is done: a token for the app when it
// said which device it is, otherwise the browser's session cookie.
func (a *API) signedIn(w http.ResponseWriter, r *http.Request, u sqlite.User, d *deviceIn) {
	user := map[string]string{"email": u.Email}
	if d != nil {
		tok, dev, err := a.Ctl.CreateDevice(r.Context(), u.ID, d.Name, d.Platform)
		if err != nil {
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"user": user, "token": tok, "device": dev})
		return
	}
	tok, err := a.Ctl.CreateSession(r.Context(), u.ID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.setCookie(w, r, tok, int(sqlite.SessionTTL.Seconds()))
	a.rememberDevice(w, r, u.ID, u.Email)
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}
