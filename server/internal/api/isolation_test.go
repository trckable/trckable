package api

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Two customers in one installation. Account B, signed in by cookie or by
// API key, tries every route there is on account A's site and objects, and
// must get "not found" from each: never data, never a change. The routes are
// the ones Routes actually registered, so a route added later is tried too.
func TestAccountsCannotReachEachOther(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	a := client()
	g.setup(t, a) // me@site.com owns the default account and site.com

	// Account A's objects, so there is something real to aim at.
	_, aKey, err := g.ctl.CreateAPIKey(ctx, sqlite.DefaultAccount, "A's key")
	if err != nil {
		t.Fatal(err)
	}
	aViewer, err := g.ctl.AddUser(ctx, sqlite.DefaultAccount, "viewer@site.com", "correct horse battery A", sqlite.RoleViewer)
	if err != nil {
		t.Fatal(err)
	}

	// Account B: another customer, with an owner, a key and a site of its own.
	accB, err := g.ctl.CreateAccount(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := g.ctl.AddUser(ctx, accB, "owner@other.com", "correct horse battery B", sqlite.RoleOwner); err != nil {
		t.Fatal(err)
	}
	b := client()
	if code, out := do(t, b, "POST", g.srv.URL+"/api/v1/login", `{"email":"owner@other.com","password":"correct horse battery B"}`); code != http.StatusOK {
		t.Fatalf("B signs in: %d %v", code, out)
	}
	code, out := do(t, b, "POST", g.srv.URL+"/api/v1/sites", `{"domain":"other.com"}`, csrf, "1")
	if code != http.StatusCreated && code != http.StatusOK {
		t.Fatalf("B adds a site: %d %v", code, out)
	}
	bKey, _, err := g.ctl.CreateAPIKey(ctx, accB, "B's key")
	if err != nil {
		t.Fatal(err)
	}

	send := func(c *http.Client, method, path, bearer string) (int, string) {
		t.Helper()
		body := io.Reader(nil)
		if method != "GET" && method != "HEAD" {
			// A valid change, where a body is read: the refusal must come from
			// the account, not from validation.
			body = strings.NewReader(`{"role":"owner"}`)
		}
		req, _ := http.NewRequest(method, g.srv.URL+path, body)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set(csrf, "1")
		if bearer != "" {
			req.Header.Set("Authorization", "Bearer "+bearer)
		}
		res, err := c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return res.StatusCode, string(raw)
	}

	// Every site route, aimed at A's site, as B.
	fill := strings.NewReplacer("{site}", g.site, "{id}", "x", "{module}", "goals", "{visitor}", "1")
	tried := 0
	for _, pattern := range g.api.patterns {
		method, path, _ := strings.Cut(pattern, " ")
		if !strings.Contains(path, "{site}") {
			continue
		}
		path = fill.Replace(path)
		tried++
		if code, body := send(b, method, path, ""); code != http.StatusNotFound {
			t.Errorf("%s %s as B's owner: %d %s", method, path, code, body)
		}
		if method == "GET" {
			if code, body := send(http.DefaultClient, method, path, bKey); code != http.StatusNotFound {
				t.Errorf("%s %s with B's API key: %d %s", method, path, code, body)
			}
		}
	}
	if tried < 40 {
		t.Fatalf("only %d site routes were tried: the route list is not being recorded", tried)
	}

	// Lists show B's own things only.
	for _, path := range []string{"/api/v1/sites", "/api/v1/overview?days=7", "/api/v1/people", "/api/v1/keys"} {
		code, body := send(b, "GET", path, "")
		if code != http.StatusOK {
			t.Errorf("GET %s as B: %d %s", path, code, body)
		}
		for _, leak := range []string{g.site, "site.com\"", "me@site.com", "viewer@site.com", aKey.ID, "A's key"} {
			if strings.Contains(body, leak) {
				t.Errorf("GET %s as B shows A's %q: %s", path, leak, body)
			}
		}
	}
	if code, body := send(http.DefaultClient, "GET", "/api/v1/sites", bKey); code != http.StatusOK || strings.Contains(body, g.site) {
		t.Errorf("GET /api/v1/sites with B's key: %d %s", code, body)
	}

	// A's people and keys, by id, as B: not found, and still there after.
	for _, try := range []struct{ method, path string }{
		{"PATCH", "/api/v1/people/" + aViewer.ID},
		{"DELETE", "/api/v1/people/" + aViewer.ID},
		{"DELETE", "/api/v1/keys/" + aKey.ID},
	} {
		if code, body := send(b, try.method, try.path, ""); code != http.StatusNotFound {
			t.Errorf("%s %s as B: %d %s", try.method, try.path, code, body)
		}
	}
	if people, _ := g.ctl.People(ctx, sqlite.DefaultAccount); len(people) != 2 {
		t.Errorf("A has %d people after B's attempts, want 2", len(people))
	}
	if keys, _ := g.ctl.ListAPIKeys(ctx, sqlite.DefaultAccount); len(keys) != 1 {
		t.Errorf("A has %d keys after B's attempts, want 1", len(keys))
	}
	if _, err := g.ctl.SiteInfo(ctx, g.site); err != nil {
		t.Errorf("A's site is gone: %v", err)
	}

	// The installation's own numbers are the operator's.
	if code, _ := send(b, "GET", "/api/v1/health", ""); code != http.StatusNotFound {
		t.Errorf("B reads the installation's health: %d", code)
	}
	if code, _ := send(a, "GET", "/api/v1/health", ""); code != http.StatusOK && code != http.StatusServiceUnavailable {
		t.Errorf("the operator's own account reads health: %d", code)
	}

	// And B still has a working product of its own.
	var bSite string
	_, sites := send(b, "GET", "/api/v1/sites", "")
	if i := strings.Index(sites, `"id":"`); i >= 0 {
		bSite = sites[i+6 : i+6+strings.Index(sites[i+6:], `"`)]
	}
	if code, body := send(b, "GET", "/api/v1/sites/"+bSite+"/report?from=2026-09-01&to=2026-09-22", ""); code != http.StatusOK && code != http.StatusServiceUnavailable {
		t.Errorf("B's own report: %d %s", code, body)
	}
}
