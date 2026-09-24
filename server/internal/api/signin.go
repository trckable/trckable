package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// signinLink serves POST /_trckable/signin to the operator: a one-time link
// that signs the person with this email in, for a hosting provider's "open
// dashboard" button. Off (404) without TRCKABLE_OPERATOR_TOKEN; refused for
// someone with two-step sign-in on.
func (a *API) signinLink(w http.ResponseWriter, r *http.Request) {
	if a.Operator == "" {
		http.NotFound(w, r)
		return
	}
	if !auth.Equal(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), a.Operator) {
		fail(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var in struct{ Email string }
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	tok, err := a.Ctl.CreateSigninLink(r.Context(), in.Email)
	switch {
	case errors.Is(err, auth.ErrNotFound):
		fail(w, http.StatusNotFound, "nobody with that email here")
		return
	case errors.Is(err, sqlite.ErrTwoStepOn):
		fail(w, http.StatusConflict, err.Error())
		return
	case err != nil:
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"url": strings.TrimSuffix(a.BaseURL, "/") + "/_trckable/signin?t=" + tok, "expires_in": int(sqlite.SigninLinkTTL.Seconds()),
	})
}

// useSigninLink serves GET /_trckable/signin?t=…: spend the link, set the
// session, and go to the dashboard. A used or old link goes to the sign-in
// page instead, which is where the person would be anyway.
func (a *API) useSigninLink(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	id, err := a.Ctl.UseSigninLink(r.Context(), r.URL.Query().Get("t"))
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}
	tok, err := a.Ctl.CreateSession(r.Context(), id)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.setCookie(w, r, tok, int(sqlite.SessionTTL.Seconds()))
	http.Redirect(w, r, "/", http.StatusSeeOther)
}
