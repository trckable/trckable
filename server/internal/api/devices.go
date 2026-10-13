package api

import (
	"errors"
	"net/http"

	"github.com/trckable/trckable/server/internal/auth"
)

// The phone app's sign-ins, listed and removed by the person they belong to.
// A browser session or a device may; an API key never has devices.

func (a *API) devices(w http.ResponseWriter, r *http.Request) {
	p := principalOf(r)
	if p.user == nil {
		fail(w, http.StatusForbidden, "only a signed-in person has devices")
		return
	}
	list, err := a.Ctl.Devices(r.Context(), p.user.ID, p.device)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"devices": list})
}

// removeDevice signs one device out at once. Only the person's own: another
// person's id is simply not found.
func (a *API) removeDevice(w http.ResponseWriter, r *http.Request) {
	p := principalOf(r)
	if p.user == nil {
		fail(w, http.StatusForbidden, "only a signed-in person has devices")
		return
	}
	err := a.Ctl.RemoveDevice(r.Context(), p.user.ID, r.PathValue("id"))
	if errors.Is(err, auth.ErrNotFound) {
		fail(w, http.StatusNotFound, "that device is not signed in")
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
