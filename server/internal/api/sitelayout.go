package api

// The site switcher's order, pins and groups, per account. Anyone of the
// account reads it (the switcher is on every page); changing it is a change
// like any other, so a viewer or an API key cannot (authed refuses them).

import (
	"errors"
	"net/http"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func (a *API) siteLayout(w http.ResponseWriter, r *http.Request) {
	l, err := a.Ctl.SiteLayoutOf(r.Context(), principalOf(r).account)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if p := principalOf(r); p.sites != nil {
		l = l.Only(p.sites)
	}
	writeJSON(w, http.StatusOK, l)
}

func (a *API) setSiteLayout(w http.ResponseWriter, r *http.Request) {
	var in sqlite.SiteLayout
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	l, err := a.Ctl.SetSiteLayout(r.Context(), principalOf(r).account, in)
	var bad sqlite.ErrLayout
	if errors.As(err, &bad) {
		fail(w, http.StatusBadRequest, bad.Why)
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, l)
}
