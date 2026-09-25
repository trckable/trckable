package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The operator endpoints: how a hosting provider (trckable Cloud, or anyone
// hosting trckable for others) manages its customers' accounts on one
// server. All of them need TRCKABLE_OPERATOR_TOKEN and answer 404 without
// it, so a self-hosted instance does not even show they exist.
//
//	POST   /_trckable/accounts               {"email"}          a new account and its owner
//	GET    /_trckable/accounts                                  every account but the default
//	GET    /_trckable/accounts/{id}
//	PUT    /_trckable/accounts/{id}/limits   {"max_members"}    owners the plan allows (0: no limit)
//	PUT    /_trckable/accounts/{id}/state    {"state"}          active, read_only or suspended
//	DELETE /_trckable/accounts/{id}                             the account and everything in it
//	GET    /_trckable/health                                    the server's health, as Settings → Health shows it

// operator answers the request itself unless it carries the operator token.
func (a *API) operator(w http.ResponseWriter, r *http.Request) bool {
	if a.Operator == "" {
		http.NotFound(w, r)
		return false
	}
	if !auth.Equal(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), a.Operator) {
		fail(w, http.StatusUnauthorized, "unauthorized")
		return false
	}
	return true
}

func (a *API) createAccount(w http.ResponseWriter, r *http.Request) {
	if !a.operator(w, r) {
		return
	}
	var in struct{ Email string }
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	acc, owner, err := a.Ctl.CreateAccountWithOwner(r.Context(), in.Email)
	switch {
	case errors.Is(err, auth.ErrExists):
		fail(w, http.StatusConflict, "someone with that email already has an account here")
		return
	case err != nil:
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"account": acc, "owner": owner})
}

func (a *API) listAccounts(w http.ResponseWriter, r *http.Request) {
	if !a.operator(w, r) {
		return
	}
	list, err := a.Ctl.Accounts(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"accounts": list})
}

// accountSites serves GET /_trckable/accounts/{id}/sites: the account's sites
// and their domains, so the host can hold one trial per website. The account
// must exist (404 otherwise), and it lists that account's sites only.
func (a *API) accountSites(w http.ResponseWriter, r *http.Request) {
	if !a.operator(w, r) {
		return
	}
	id := r.PathValue("id")
	if _, err := a.Ctl.Account(r.Context(), id); err != nil {
		operatorFail(w, err)
		return
	}
	sites, err := a.Ctl.AccountDomains(r.Context(), id)
	if err != nil {
		operatorFail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sites": sites})
}

func (a *API) getAccount(w http.ResponseWriter, r *http.Request) {
	if !a.operator(w, r) {
		return
	}
	acc, err := a.Ctl.Account(r.Context(), r.PathValue("id"))
	if err != nil {
		operatorFail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, acc)
}

func (a *API) setAccountLimits(w http.ResponseWriter, r *http.Request) {
	if !a.operator(w, r) {
		return
	}
	var in struct {
		MaxMembers *int `json:"max_members"`
	}
	if err := decode(r, &in); err != nil || in.MaxMembers == nil {
		fail(w, http.StatusBadRequest, `send {"max_members": n}; 0 means no limit`)
		return
	}
	if err := a.Ctl.SetMaxMembers(r.Context(), r.PathValue("id"), *in.MaxMembers); err != nil {
		operatorFail(w, err)
		return
	}
	a.getAccount(w, r)
}

func (a *API) setAccountState(w http.ResponseWriter, r *http.Request) {
	if !a.operator(w, r) {
		return
	}
	var in struct{ State string }
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if err := a.Ctl.SetAccountState(r.Context(), r.PathValue("id"), in.State); err != nil {
		operatorFail(w, err)
		return
	}
	a.getAccount(w, r)
}

// deleteAccount removes an account and everything in it: each site's
// analytics (from the analytics store), then the site, then the people, keys
// and the account. It can take minutes on a large account, so the response
// is not held to the server's usual write timeout.
func (a *API) deleteAccount(w http.ResponseWriter, r *http.Request) {
	if !a.operator(w, r) {
		return
	}
	id := r.PathValue("id")
	if id == sqlite.DefaultAccount {
		operatorFail(w, sqlite.ErrDefaultAccount)
		return
	}
	if _, err := a.Ctl.Account(r.Context(), id); err != nil {
		operatorFail(w, err)
		return
	}
	_ = http.NewResponseController(w).SetWriteDeadline(time.Time{})
	sites, err := a.Ctl.AccountSites(r.Context(), id)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	var gone sqlite.Removed
	for _, site := range sites {
		if a.PurgeAnalytics != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
			events, sessions, err := a.PurgeAnalytics(ctx, site)
			cancel()
			if err != nil {
				fail(w, http.StatusServiceUnavailable, "could not remove "+site+"'s analytics data: "+err.Error())
				return
			}
			gone.Events += events
			gone.Sessions += sessions
		}
		rest, err := a.Ctl.DeleteSite(r.Context(), site)
		if err != nil {
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		gone.Payments += rest.Payments
		gone.Connections += rest.Connections
	}
	if err := a.Ctl.DeleteAccount(r.Context(), id); err != nil {
		operatorFail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": id, "sites": len(sites), "removed": gone})
}

func operatorFail(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, auth.ErrNotFound):
		fail(w, http.StatusNotFound, "no such account")
	case errors.Is(err, sqlite.ErrDefaultAccount), errors.Is(err, sqlite.ErrBadState):
		fail(w, http.StatusBadRequest, err.Error())
	default:
		fail(w, http.StatusInternalServerError, err.Error())
	}
}
