package api

import (
	"errors"
	"net/http"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// What a site's people steer in the uptime check (server/uptime.go):
//
//	GET    /api/v1/sites/{site}/uptime         paused, and the extra paths
//	PUT    /api/v1/sites/{site}/uptime         {"paused": true|false}
//	POST   /api/v1/sites/{site}/uptime/paths   {"path": "/pricing"}
//	DELETE /api/v1/sites/{site}/uptime/paths   ?path=/pricing
//
// Reading is for anyone who sees the site; the writes are the guard's: a
// viewer or an API key cannot, whatever the route.

func (a *API) uptime(w http.ResponseWriter, r *http.Request) {
	u, err := a.Ctl.UptimeOf(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the uptime check")
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func (a *API) setUptime(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Paused *bool `json:"paused"`
	}
	if err := decode(r, &in); err != nil || in.Paused == nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	site := r.PathValue("site")
	if err := a.Ctl.SetUptimePaused(r.Context(), site, *in.Paused, a.Now().Unix()); err != nil {
		fail(w, http.StatusInternalServerError, "could not save")
		return
	}
	a.uptime(w, r)
}

func (a *API) addUptimePath(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Path string `json:"path"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	u, err := a.Ctl.AddUptimePath(r.Context(), r.PathValue("site"), in.Path)
	switch {
	case errors.Is(err, sqlite.ErrUptimePath):
		fail(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, sqlite.ErrUptimeFull):
		fail(w, http.StatusConflict, err.Error())
	case err != nil:
		fail(w, http.StatusInternalServerError, "could not save")
	default:
		writeJSON(w, http.StatusOK, u)
	}
}

func (a *API) removeUptimePath(w http.ResponseWriter, r *http.Request) {
	u, err := a.Ctl.RemoveUptimePath(r.Context(), r.PathValue("site"), r.URL.Query().Get("path"))
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not save")
		return
	}
	writeJSON(w, http.StatusOK, u)
}
