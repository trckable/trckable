package api

import (
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The permission table keys its rows by the store's role names.
func TestThePermissionTableUsesTheStoresRoles(t *testing.T) {
	if sqlite.RoleOwner != "owner" || sqlite.RoleViewer != "viewer" {
		t.Fatal("internal/permissions keys its rows by \"owner\" and \"viewer\"")
	}
}
