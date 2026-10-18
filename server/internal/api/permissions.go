package api

import (
	"github.com/trckable/trckable/server/internal/permissions"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// canUser is permissions.Can for a request's person; no person (an API key)
// may do none of the owner-only things.
func canUser(u *sqlite.User, action permissions.Action) bool {
	return u != nil && permissions.Can(u.Role, action)
}
