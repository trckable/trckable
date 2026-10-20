package api

import (
	"errors"
	"net/http"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The funnels a site keeps by name (Explore opens one in a click). Only the
// steps are kept; the numbers are counted when one is opened.
//
//	GET    /api/v1/sites/{site}/funnels        the saved funnels
//	POST   /api/v1/sites/{site}/funnels        {"name", "steps": [{"kind", "value"}]}
//	PATCH  /api/v1/sites/{site}/funnels/{id}   {"name"?, "steps"?}: rename, edit the steps, or both
//	DELETE /api/v1/sites/{site}/funnels/{id}
//
// Reading is for anyone who sees the site; the writes are the guard's.

func (a *API) funnels(w http.ResponseWriter, r *http.Request) {
	list, err := a.Ctl.Funnels(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the funnels")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"funnels": list, "max": sqlite.MaxFunnels})
}

// funnelFailure answers what a funnel write refused, and reports whether it did.
func funnelFailure(w http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, auth.ErrNotFound):
		fail(w, http.StatusNotFound, "funnel not found")
	case errors.Is(err, sqlite.ErrFunnelName), errors.Is(err, sqlite.ErrFunnelSteps):
		fail(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, sqlite.ErrFunnelTaken), errors.Is(err, sqlite.ErrFunnelFull):
		fail(w, http.StatusConflict, err.Error())
	default:
		fail(w, http.StatusInternalServerError, "could not save")
	}
	return true
}

func (a *API) createFunnel(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name  string              `json:"name"`
		Steps []sqlite.FunnelStep `json:"steps"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	f, err := a.Ctl.CreateFunnel(r.Context(), r.PathValue("site"), in.Name, in.Steps)
	if funnelFailure(w, err) {
		return
	}
	writeJSON(w, http.StatusCreated, f)
}

func (a *API) updateFunnel(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name  *string             `json:"name"`
		Steps []sqlite.FunnelStep `json:"steps"`
	}
	if err := decode(r, &in); err != nil || (in.Name == nil && in.Steps == nil) {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	f, err := a.Ctl.UpdateFunnel(r.Context(), r.PathValue("site"), r.PathValue("id"), in.Name, in.Steps)
	if funnelFailure(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, f)
}

func (a *API) deleteFunnel(w http.ResponseWriter, r *http.Request) {
	if funnelFailure(w, a.Ctl.DeleteFunnel(r.Context(), r.PathValue("site"), r.PathValue("id"))) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
