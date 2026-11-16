package api

import (
	"errors"
	"net/http"
	"slices"
	"strings"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// allowedState is Settings' view of the extra hostnames a site accepts: the
// list, and the hostnames refused this week that are not on it (what to offer
// with one tap), most visits first.
type allowedState struct {
	Allowed []string           `json:"allowed"`
	Refused []sqlite.HostCount `json:"refused"`
	Max     int                `json:"max"`
}

func (a *API) allowedStateOf(r *http.Request, site string) (allowedState, error) {
	list, err := a.Ctl.AllowedOf(r.Context(), site)
	if err != nil {
		return allowedState{}, err
	}
	si, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		return allowedState{}, err
	}
	out := allowedState{Allowed: list, Refused: []sqlite.HostCount{}, Max: sqlite.MaxAllowedHosts}
	rh, err := a.Ctl.RejectedHostsOf(r.Context(), site, a.Now())
	if err != nil {
		return allowedState{}, err
	}
	for _, h := range rh.Hosts {
		// A name the site already covers (its domain, a listed name, or a subdomain of one) is not refused any more.
		covered := h.Host == si.Domain || strings.HasSuffix(h.Host, "."+si.Domain) ||
			slices.ContainsFunc(list, func(x string) bool { return h.Host == x || strings.HasSuffix(h.Host, "."+x) })
		if !covered {
			out.Refused = append(out.Refused, h)
		}
	}
	return out, nil
}

func failAllowed(w http.ResponseWriter, err error) {
	if errors.Is(err, auth.ErrNotFound) {
		fail(w, http.StatusNotFound, "not found")
		return
	}
	code := ""
	switch {
	case errors.Is(err, sqlite.ErrBadAllowed):
		code = "allowed_bad"
	case errors.Is(err, sqlite.ErrTooManyAllowed):
		code = "allowed_many"
	case errors.Is(err, sqlite.ErrPublicSuffix):
		code = "allowed_shared"
	}
	writeJSON(w, http.StatusBadRequest, apiError{Error: err.Error(), Code: code})
}

// siteAllowed answers Settings with the site's allowed domains.
func (a *API) siteAllowed(w http.ResponseWriter, r *http.Request) {
	st, err := a.allowedStateOf(r, r.PathValue("site"))
	if err != nil {
		failAllowed(w, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

// setAllowed replaces the list. Who may is the settings rule for every write
// (owners and admins); ingest uses the new list at once.
func (a *API) setAllowed(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Allowed []string `json:"allowed"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	list, err := sqlite.CleanAllowed(in.Allowed)
	if err != nil {
		failAllowed(w, err)
		return
	}
	site := r.PathValue("site")
	if err := a.Ctl.SetAllowed(r.Context(), site, list); err != nil {
		failAllowed(w, err)
		return
	}
	a.cache.purgeSite(site)
	st, err := a.allowedStateOf(r, site)
	if err != nil {
		failAllowed(w, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}
