package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Site access: which of the sites each viewer may see
// (store/sqlite/siteaccess.go). A limited viewer simply sees fewer sites, and
// every other site answers "not found". An owner sets it in People.
//
//	GET /api/v1/site-access             {"sites": [{id, domain, name}], "viewers": [{id, email, role, sites}]}
//	                                    sites null: every site
//	PUT /api/v1/site-access/{subject}   {"sites": null | ["tkb_…", …]}
//	    404 unknown viewer, 400 an owner or a site that does not exist

// mySiteAccess is the signed-in owner's account's list, for People.
func (a *API) mySiteAccess(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil {
		return
	}
	a.writeSiteAccess(w, r, principalOf(r).account)
}

// setMySiteAccess limits a viewer (or a viewer invitation) of the signed-in
// owner's own account: the account is the session's, never one the request
// names.
func (a *API) setMySiteAccess(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil {
		return
	}
	a.applySiteAccess(w, r, principalOf(r).account)
}

// writeSiteAccess answers an account's sites and each viewer's access.
func (a *API) writeSiteAccess(w http.ResponseWriter, r *http.Request, account string) {
	rows, err := a.Ctl.ListSites(r.Context(), account)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	type site struct {
		ID     string `json:"id"`
		Domain string `json:"domain"`
		Name   string `json:"name"`
	}
	sites := make([]site, 0, len(rows))
	for _, s := range rows {
		sites = append(sites, site{s.ID, s.Domain, s.Name})
	}
	viewers, err := a.Ctl.AccessList(r.Context(), account)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sites": sites, "viewers": viewers})
}

// applySiteAccess sets one subject's sites in an account, then answers the
// account's list.
func (a *API) applySiteAccess(w http.ResponseWriter, r *http.Request, account string) {
	var in struct {
		Sites json.RawMessage `json:"sites"`
	}
	if err := decode(r, &in); err != nil || len(in.Sites) == 0 {
		fail(w, http.StatusBadRequest, `send {"sites": null} or {"sites": ["site id", …]}`)
		return
	}
	var sites []string
	if string(in.Sites) != "null" {
		if err := json.Unmarshal(in.Sites, &sites); err != nil {
			fail(w, http.StatusBadRequest, `send {"sites": null} or {"sites": ["site id", …]}`)
			return
		}
		if sites == nil {
			sites = []string{}
		}
	}
	err := a.Ctl.SetAccess(r.Context(), account, r.PathValue("subject"), sites)
	switch {
	case errors.Is(err, auth.ErrNotFound):
		fail(w, http.StatusNotFound, "no such viewer in this account")
		return
	case errors.Is(err, sqlite.ErrAccessOwner), errors.Is(err, sqlite.ErrAccessSite):
		fail(w, http.StatusBadRequest, err.Error())
		return
	case err != nil:
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.writeSiteAccess(w, r, account)
}
