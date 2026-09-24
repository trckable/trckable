package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Who may use this instance. Owners run it; viewers read it. Only an owner
// sees or changes this list.

func (a *API) owner(w http.ResponseWriter, r *http.Request) *sqlite.User {
	u := r.Context().Value(ctxKey{}).(principal).user
	if u == nil || u.Role != sqlite.RoleOwner {
		fail(w, http.StatusForbidden, "only an owner can manage the people on this instance")
		return nil
	}
	return u
}

func (a *API) people(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil {
		return
	}
	list, err := a.Ctl.People(r.Context(), principalOf(r).account)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"people": list})
}

// addPerson creates an account. A password may be sent, or left out — then one
// is generated and returned once, which is what the invite flow uses.
func (a *API) addPerson(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil {
		return
	}
	var in struct {
		Email    string `json:"email"`
		Role     string `json:"role"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if in.Role == "" {
		in.Role = sqlite.RoleViewer
	}
	generated := ""
	if a.Managed != "" {
		// On a managed instance nobody signs in with a password: they sign in
		// at the provider with this email, so no password is made or shown.
		in.Password = auth.Token("", 32)
	} else if strings.TrimSpace(in.Password) == "" {
		generated = auth.Token("", 12)
		in.Password = generated
	}
	p, err := a.Ctl.AddUser(r.Context(), principalOf(r).account, in.Email, in.Password, in.Role)
	switch {
	case errors.Is(err, auth.ErrExists):
		fail(w, http.StatusConflict, "someone already uses that email address")
		return
	case err != nil:
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"person": p, "password": generated, "signin": a.Managed})
}

func (a *API) setPersonRole(w http.ResponseWriter, r *http.Request) {
	me := a.owner(w, r)
	if me == nil {
		return
	}
	var in struct {
		Role string `json:"role"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	err := a.Ctl.SetRole(r.Context(), principalOf(r).account, r.PathValue("id"), in.Role)
	if failPerson(w, err) {
		return
	}
	a.people(w, r)
}

func (a *API) removePerson(w http.ResponseWriter, r *http.Request) {
	me := a.owner(w, r)
	if me == nil {
		return
	}
	if r.PathValue("id") == me.ID {
		fail(w, http.StatusBadRequest, "you cannot remove your own account")
		return
	}
	if failPerson(w, a.Ctl.RemoveUser(r.Context(), principalOf(r).account, r.PathValue("id"))) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// failPerson turns the store's refusals into the right status, and reports
// whether the request is finished.
func failPerson(w http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, auth.ErrNotFound):
		fail(w, http.StatusNotFound, "no such person")
	case errors.Is(err, sqlite.ErrLastOwner):
		fail(w, http.StatusConflict, err.Error())
	default:
		fail(w, http.StatusBadRequest, err.Error())
	}
	return true
}
