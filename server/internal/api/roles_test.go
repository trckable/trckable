package api

import (
	"context"
	"net/http"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// A role is read from the database on every request, so a person made a
// viewer is a viewer from their next call, with the session they already
// hold. And a viewer cannot lift themselves: not by changing their own role,
// not by adding an owner.
func TestARoleChangeTakesEffectAtOnce(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	g.setup(t, client())
	p, err := g.ctl.AddUser(ctx, sqlite.DefaultAccount, "second@site.com", "correct horse battery S", sqlite.RoleOwner)
	if err != nil {
		t.Fatal(err)
	}
	two := client()
	if code, out := do(t, two, "POST", g.srv.URL+"/api/v1/login", `{"email":"second@site.com","password":"correct horse battery S"}`); code != http.StatusOK {
		t.Fatalf("sign in: %d %v", code, out)
	}
	site := g.srv.URL + "/api/v1/sites/" + g.site
	if code, out := do(t, two, "PATCH", site, `{"name":"As owner"}`, csrf, "1"); code != http.StatusOK {
		t.Fatalf("an owner renames the site: %d %v", code, out)
	}
	if err := g.ctl.SetRole(ctx, sqlite.DefaultAccount, p.ID, sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	if code, _ := do(t, two, "PATCH", site, `{"name":"As viewer"}`, csrf, "1"); code != http.StatusForbidden {
		t.Errorf("the same session, now a viewer, renames the site: %d", code)
	}
	if code, _ := do(t, two, "PATCH", g.srv.URL+"/api/v1/people/"+p.ID, `{"role":"owner"}`, csrf, "1"); code != http.StatusForbidden {
		t.Errorf("a viewer makes themselves an owner: %d", code)
	}
	if code, _ := do(t, two, "POST", g.srv.URL+"/api/v1/people", `{"email":"third@site.com","role":"owner"}`, csrf, "1"); code != http.StatusForbidden {
		t.Errorf("a viewer adds an owner: %d", code)
	}
}
