package main

import (
	"context"
	"testing"

	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/server"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// A password the admin command made up is one the person running it has
// seen: like one an owner makes in the dashboard, it only opens the way to
// choosing their own. (A password piped in is the person's own choice.)
func TestAdminMadePasswordsMustBeChanged(t *testing.T) {
	cfg := config.Config{DataDir: t.TempDir()}
	if err := admin(cfg, []string{"add-user", "new@site.com", "--role", "owner"}); err != nil {
		t.Fatal(err)
	}
	if err := admin(cfg, []string{"add-user", "second@site.com", "--role", "owner"}); err != nil {
		t.Fatal(err)
	}
	ctl, err := server.OpenControl(context.Background(), cfg, 0)
	if err != nil {
		t.Fatal(err)
	}
	must := func(email string) bool {
		t.Helper()
		var id string
		if err := ctl.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return ctl.MustChange(context.Background(), id)
	}
	if !must("new@site.com") {
		t.Error("add-user: a generated password does not have to be changed")
	}
	if err := ctl.SetMustChange(context.Background(), mustID(t, ctl, "second@site.com"), false); err != nil {
		t.Fatal(err)
	}
	ctl.Close()
	if err := admin(cfg, []string{"reset-password", "second@site.com"}); err != nil {
		t.Fatal(err)
	}
	ctl, err = server.OpenControl(context.Background(), cfg, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer ctl.Close()
	if !must("second@site.com") {
		t.Error("reset-password: a generated password does not have to be changed")
	}
}

func mustID(t *testing.T, ctl *sqlite.Store, email string) string {
	t.Helper()
	var id string
	if err := ctl.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

// When the password cannot be marked for replacing, it is not shown.
func TestMustChangeFirstReportsFailure(t *testing.T) {
	cfg := config.Config{DataDir: t.TempDir()}
	ctl, err := server.OpenControl(context.Background(), cfg, 0)
	if err != nil {
		t.Fatal(err)
	}
	ctl.Close()
	if err := mustChangeFirst(context.Background(), ctl, "usr_x"); err == nil {
		t.Fatal("a failed flag was reported as done")
	}
}
