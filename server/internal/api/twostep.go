package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Two-step sign-in. The secret lives on this server and nowhere else: there is
// no SMS, no email, no third party — an authenticator app on the phone and a
// short list of one-time recovery codes.

// twoStepUser is the signed-in person, or nothing if an API key made the call.
// Keys never carry a second step: they are the second factor.
func (a *API) twoStepUser(w http.ResponseWriter, r *http.Request) *sqlite.User {
	u := r.Context().Value(ctxKey{}).(principal).user
	if u == nil {
		fail(w, http.StatusForbidden, "only a signed-in person can change two-step sign-in")
		return nil
	}
	return u
}

// twoStep reports the current state for Settings → Account.
func (a *API) twoStep(w http.ResponseWriter, r *http.Request) {
	u := a.twoStepUser(w, r)
	if u == nil {
		return
	}
	s, err := a.Ctl.TwoStepOf(r.Context(), u.ID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, s)
}

// secondStepFor asks for what the account already has, before its two-step
// setting changes: while two-step is on, the password alone (a borrowed
// session, a shoulder-read password) must not remove or replace the phone, so
// a current code or a recovery code is asked for too. It answers the request
// itself when that is missing or wrong.
func (a *API) secondStepFor(w http.ResponseWriter, r *http.Request, u *sqlite.User, code string) (wasOn, ok bool) {
	on, err := a.Ctl.TwoStepOf(r.Context(), u.ID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return false, false
	}
	if !on.Enabled {
		return false, true
	}
	if strings.TrimSpace(code) == "" {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "type a code from your app, or a recovery code", "needs_code": true})
		return true, false
	}
	if !a.codeTries(w, u) {
		return true, false
	}
	if err := a.Ctl.CheckSecondStep(r.Context(), u.ID, cleanCode(code), a.unix); err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "that code is not right: try the current one from your app, or a recovery code", "needs_code": true})
		return true, false
	}
	return true, true
}

// codeTries limits how many codes one person's account may be tried with,
// wherever they are typed (sign-in, turning on, off, a new phone), whatever
// address they come from: a limit per address alone lets many addresses
// guess six digits without end.
func (a *API) codeTries(w http.ResponseWriter, u *sqlite.User) bool {
	if a.loginRate.allow("code:"+u.ID, a.Now(), 10, 10*time.Minute) {
		return true
	}
	fail(w, http.StatusTooManyRequests, "too many codes tried for this account: wait a few minutes")
	return false
}

// startTwoStep hands back a fresh secret to scan or type. Nothing is turned on
// until a code from it comes back, so an abandoned setup changes nothing.
// The password is asked for again: a borrowed session must not be able to add
// a factor only the borrower holds.
func (a *API) startTwoStep(w http.ResponseWriter, r *http.Request) {
	// Each of these does real work (outside fetches, or a password hash):
	// limited, so a busy button or a stolen session cannot make it a flood.
	if !a.loginRate.allow("twostep:"+a.ip(r), a.Now(), 10, 10*time.Minute) {
		fail(w, http.StatusTooManyRequests, "too many tries: wait a few minutes")
		return
	}
	u := a.twoStepUser(w, r)
	if u == nil {
		return
	}
	var in struct {
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if _, err := a.Ctl.Login(r.Context(), u.Email, in.Password); err != nil {
		fail(w, http.StatusForbidden, "that is not your password")
		return
	}
	wasOn, ok := a.secondStepFor(w, r, u, in.Code)
	if !ok {
		return
	}
	secret, err := a.Ctl.StartTwoStep(r.Context(), u.ID, wasOn, a.unix)
	if errors.Is(err, sqlite.ErrChanged) {
		fail(w, http.StatusConflict, err.Error())
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"secret": secret,
		"uri":    auth.TOTPURI(secret, "trckable", u.Email),
	})
}

// enableTwoStep proves the app is set up, then returns the recovery codes.
// This is the only time they are readable: only their hashes are kept.
func (a *API) enableTwoStep(w http.ResponseWriter, r *http.Request) {
	u := a.twoStepUser(w, r)
	if u == nil {
		return
	}
	var in struct {
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	// A session alone must not be able to finish someone else's setup: the
	// password again, and few tries, so a pending code cannot be guessed.
	if !a.loginRate.allow("twostep:"+a.ip(r), a.Now(), 10, 10*time.Minute) {
		fail(w, http.StatusTooManyRequests, "too many tries: wait a few minutes")
		return
	}
	if !a.codeTries(w, u) {
		return
	}
	if _, err := a.Ctl.Login(r.Context(), u.Email, in.Password); err != nil {
		fail(w, http.StatusForbidden, "that is not your password")
		return
	}
	codes, err := a.Ctl.EnableTwoStep(r.Context(), u.ID, cleanCode(in.Code), a.unix)
	if errors.Is(err, auth.ErrBadLogin) {
		fail(w, http.StatusBadRequest, "that code is not right — check your phone's clock and try the current one")
		return
	}
	if errors.Is(err, auth.ErrNotFound) {
		fail(w, http.StatusBadRequest, "start the setup again: there is no secret to confirm")
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recovery": codes})
}

// disableTwoStep turns it off and forgets the secret. It asks for the password
// again for the same reason enabling does, and, since it is on, a code.
func (a *API) disableTwoStep(w http.ResponseWriter, r *http.Request) {
	// Each of these does real work (outside fetches, or a password hash):
	// limited, so a busy button or a stolen session cannot make it a flood.
	if !a.loginRate.allow("twostep:"+a.ip(r), a.Now(), 10, 10*time.Minute) {
		fail(w, http.StatusTooManyRequests, "too many tries: wait a few minutes")
		return
	}
	u := a.twoStepUser(w, r)
	if u == nil {
		return
	}
	var in struct {
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if _, err := a.Ctl.Login(r.Context(), u.Email, in.Password); err != nil {
		fail(w, http.StatusForbidden, "that is not your password")
		return
	}
	if _, ok := a.secondStepFor(w, r, u, in.Code); !ok {
		return
	}
	if err := a.Ctl.DisableTwoStep(r.Context(), u.ID); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// unix is the clock the TOTP window is measured against, so tests can pin it.
func (a *API) unix() int64 {
	a.init()
	return a.Now().Unix()
}

// cleanCode lets people paste "123 456" or "123-456" from their phone.
func cleanCode(s string) string {
	return strings.Map(func(r rune) rune {
		if r == ' ' || r == '-' {
			return -1
		}
		return r
	}, strings.TrimSpace(s))
}
