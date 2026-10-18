package api

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Deleting a site and erasing a person are the owner's alone: a viewer, a
// signed-out caller, a key and a shared link are refused and nothing is lost.
func TestOnlyAnOwnerDeletesASiteOrErasesAPerson(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	owner := client()
	g.setup(t, owner)
	if _, err := g.ctl.AddUser(ctx, sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	viewer := client()
	if code, out := do(t, viewer, "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@site.com","password":"correct horse battery V"}`); code != http.StatusOK {
		t.Fatalf("viewer signs in: %d %v", code, out)
	}
	key, _, err := g.ctl.CreateAPIKey(ctx, sqlite.DefaultAccount, "deletes")
	if err != nil {
		t.Fatal(err)
	}
	base := g.srv.URL + "/api/v1/sites/" + g.site
	code, out := do(t, owner, "POST", base+"/shares", `{"name":"x"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("share: %d %v", code, out)
	}
	url, _ := out["url"].(string)
	visitor := client()
	if code, _ := do(t, visitor, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`); code != http.StatusOK {
		t.Fatal("open the shared link")
	}
	var shared string
	for _, cs := range visitor.Jar.Cookies(mustURL(g.srv.URL + "/api/v1/share/")) {
		if cs.Name == shareCookie {
			shared = shareCookie + "=" + cs.Value
		}
	}
	if shared == "" {
		t.Fatal("the shared link set no cookie")
	}

	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, Visitor: 7, Path: "/", TS: g.now.Add(-time.Hour).UnixMilli()})
	g.waitApplied(t, 1)

	routes := []struct{ name, method, path, body string }{
		{"delete the site", "DELETE", base, `{"domain":"site.com"}`},
		{"erase a person", "DELETE", base + "/privacy/person?visitor=7", ""},
	}
	for _, rt := range routes {
		for _, who := range []struct {
			name string
			c    *http.Client
			hdr  []string
			want int
		}{
			{"nobody", client(), []string{csrf, "1"}, http.StatusUnauthorized},
			{"a viewer", viewer, []string{csrf, "1"}, http.StatusForbidden},
			{"an API key", client(), []string{"Authorization", "Bearer " + key}, http.StatusForbidden},
			{"a shared link", client(), []string{"Cookie", shared, csrf, "1"}, http.StatusUnauthorized},
			{"the automation token", client(), []string{"Authorization", "Bearer automation-token"}, http.StatusForbidden},
		} {
			if code, out := do(t, who.c, rt.method, rt.path, rt.body, who.hdr...); code != who.want {
				t.Errorf("%s as %s: %d %v, want %d", rt.name, who.name, code, out, who.want)
			}
		}
	}
	if _, err := g.ctl.SiteInfo(ctx, g.site); err != nil {
		t.Fatalf("a refused call deleted the site: %v", err)
	}
	for i := len(routes) - 1; i >= 0; i-- { // the person goes first, then the site
		rt := routes[i]
		if code, out := do(t, owner, rt.method, rt.path, rt.body, csrf, "1"); code != http.StatusOK {
			t.Errorf("%s as the owner: %d %v", rt.name, code, out)
		}
	}
}
