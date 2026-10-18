package api

import (
	"net/http"

	"github.com/trckable/trckable/server/internal/permissions"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// canUser is permissions.Can for a request's person; no person (an API key)
// may do none of the owner-only things.
func canUser(u *sqlite.User, action permissions.Action) bool {
	return u != nil && permissions.Can(u.Role, action)
}

// requireAct answers 403 and reports false unless the request's person may do
// action. An API key or the automation token has no person and may not.
func requireAct(w http.ResponseWriter, r *http.Request, action permissions.Action, msg string) bool {
	if !canUser(principalOf(r).user, action) {
		fail(w, http.StatusForbidden, msg)
		return false
	}
	return true
}
