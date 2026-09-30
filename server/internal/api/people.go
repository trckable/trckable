package api

import (
	"errors"
	"log/slog"
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
	account := principalOf(r).account
	list, err := a.Ctl.People(r.Context(), account)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"people": list})
}

// addPerson creates a person: a password may be sent, or left out, and then
// one is generated and returned once.
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
	if strings.TrimSpace(in.Password) == "" {
		generated = auth.Token("", 12)
		in.Password = generated
	}
	p, err := a.Ctl.AddUser(r.Context(), principalOf(r).account, in.Email, in.Password, in.Role)
	if busy(w, err) {
		return
	}
	switch {
	case errors.Is(err, auth.ErrExists):
		fail(w, http.StatusConflict, "that person is already on this account")
		return
	case err != nil:
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	// A password someone else chose is replaced at their first sign-in.
	if generated != "" {
		if err := a.Ctl.SetMustChange(r.Context(), p.ID, true); err != nil {
			slog.Warn("could not ask a new person to change the password", "user", p.ID, "err", err)
		} else {
			p.MustChange = true
		}
	}
	writeJSON(w, http.StatusCreated, map[string]any{"person": p, "password": generated})
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

// resetPersonPassword is an owner's answer to "I forgot my password": a new
// one-time password to pass on, every session of theirs ended, and a new
// password of their own asked for at the next sign-in. Your own password is
// changed in your account, with the current one.
func (a *API) resetPersonPassword(w http.ResponseWriter, r *http.Request) {
	me := a.owner(w, r)
	if me == nil {
		return
	}
	if r.PathValue("id") == me.ID {
		fail(w, http.StatusBadRequest, "change your own password in your account")
		return
	}
	// Your own password first: a session left open somewhere must not be
	// enough to take someone's account.
	var in struct{ Password, Code string }
	if err := decode(r, &in); err != nil || in.Password == "" {
		fail(w, http.StatusBadRequest, "type your own password to confirm")
		return
	}
	if _, err := a.Ctl.Login(r.Context(), me.Email, in.Password); err != nil {
		if busy(w, err) {
			return
		}
		fail(w, http.StatusForbidden, "that is not your password")
		return
	}
	// With two-step on, the owner's own code too: a borrowed owner session
	// plus the password must not be enough to take someone else's account.
	if _, ok := a.secondStepFor(w, r, me, in.Code); !ok {
		return
	}
	p, err := a.Ctl.PersonByID(r.Context(), principalOf(r).account, r.PathValue("id"))
	if failPerson(w, err) {
		return
	}
	if a.elsewhere(w, r, p.ID) {
		return
	}
	// An owner's password is theirs: another owner makes them a viewer first,
	// which everyone on the instance can see, and can undo.
	if p.Role == sqlite.RoleOwner {
		fail(w, http.StatusConflict, "an owner's password can only be reset once they are a viewer: make them a viewer first")
		return
	}
	password := auth.Token("", 12)
	if err := a.Ctl.ResetPersonPassword(r.Context(), principalOf(r).account, p.ID, password); busy(w, err) {
		return
	} else if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	// The new password already stands: hand it over even if the flag failed.
	if err := a.Ctl.SetMustChange(r.Context(), p.ID, true); err != nil {
		slog.Warn("could not ask a person to change the reset password", "user", p.ID, "err", err)
	}
	writeJSON(w, http.StatusOK, map[string]any{"email": p.Email, "password": password})
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

// elsewhere refuses, and reports true, when the person is in other accounts
// too: an owner acts on the sign-in of people who are wholly in their own
// account, and everyone else manages theirs.
func (a *API) elsewhere(w http.ResponseWriter, r *http.Request, id string) bool {
	only, err := a.Ctl.OnlyInAccount(r.Context(), id, principalOf(r).account)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return true
	}
	if !only {
		fail(w, http.StatusConflict, sqlite.ErrElsewhere.Error())
	}
	return !only
}

// failPerson turns the store's refusals into the right status, and reports
// whether the request is finished.
func failPerson(w http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, auth.ErrNotFound):
		fail(w, http.StatusNotFound, "no such person")
	case errors.Is(err, sqlite.ErrLastOwner), errors.Is(err, sqlite.ErrHolder), errors.Is(err, sqlite.ErrElsewhere):
		fail(w, http.StatusConflict, err.Error())
	default:
		fail(w, http.StatusBadRequest, err.Error())
	}
	return true
}

// turnOffTwoStep is for someone who lost their phone and their recovery
// codes: an owner turns their second step off (with the owner's own
// password), and they set it up again after signing in. Not for owners: an
// owner's account is theirs (the same rule as resetting a password).
func (a *API) turnOffTwoStep(w http.ResponseWriter, r *http.Request) {
	me := a.owner(w, r)
	if me == nil {
		return
	}
	if r.PathValue("id") == me.ID {
		fail(w, http.StatusBadRequest, "turn off your own two-step in your account")
		return
	}
	var in struct{ Password, Code string }
	if err := decode(r, &in); err != nil || in.Password == "" {
		fail(w, http.StatusBadRequest, "type your own password to confirm")
		return
	}
	if _, err := a.Ctl.Login(r.Context(), me.Email, in.Password); err != nil {
		if busy(w, err) {
			return
		}
		fail(w, http.StatusForbidden, "that is not your password")
		return
	}
	// With two-step on, the owner's own code too: a borrowed owner session
	// plus the password must not be enough to take someone else's account.
	if _, ok := a.secondStepFor(w, r, me, in.Code); !ok {
		return
	}
	p, err := a.Ctl.PersonByID(r.Context(), principalOf(r).account, r.PathValue("id"))
	if failPerson(w, err) {
		return
	}
	if a.elsewhere(w, r, p.ID) {
		return
	}
	if p.Role == sqlite.RoleOwner {
		fail(w, http.StatusConflict, "an owner's two-step can only be turned off once they are a viewer: make them a viewer first")
		return
	}
	if err := a.Ctl.DisableTwoStep(r.Context(), p.ID); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
