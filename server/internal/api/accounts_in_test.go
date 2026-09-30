package api

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

const acct = "X-Trckable-Account"

// world: a person in two accounts (a viewer of A, an owner of B) and a third
// account (C) they are not in.
type world struct {
	g           *rig
	a, b, c     string // account ids
	siteA       string // A's site (g.site)
	siteB       string
	siteB2      string // a second site of B
	siteC       string
	person      string // the person's user id
	p           *http.Client
	ownerA      *http.Client
	ownerB      *http.Client
	ownerBEmail string
}

func newWorld(t *testing.T) world {
	t.Helper()
	g := newRig(t)
	ctx := context.Background()
	w := world{g: g, a: sqlite.DefaultAccount, siteA: g.site, ownerA: client(), ownerBEmail: "boss@b.com"}
	g.setup(t, w.ownerA)
	var err error
	if w.b, err = g.ctl.CreateAccount(ctx); err != nil {
		t.Fatal(err)
	}
	if w.c, err = g.ctl.CreateAccount(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := g.ctl.AddUser(ctx, w.b, w.ownerBEmail, "correct horse battery B", sqlite.RoleOwner); err != nil {
		t.Fatal(err)
	}
	if _, err := g.ctl.AddUser(ctx, w.c, "boss@c.com", "correct horse battery C", sqlite.RoleOwner); err != nil {
		t.Fatal(err)
	}
	w.ownerB = client()
	if code, out := do(t, w.ownerB, "POST", g.srv.URL+"/api/v1/login", `{"email":"boss@b.com","password":"correct horse battery B"}`); code != http.StatusOK {
		t.Fatalf("B signs in: %d %v", code, out)
	}
	if w.siteB, err = g.ctl.CreateSite(ctx, w.b, "bee.com", ""); err != nil {
		t.Fatal(err)
	}
	if w.siteB2, err = g.ctl.CreateSite(ctx, w.b, "bee2.com", ""); err != nil {
		t.Fatal(err)
	}
	if w.siteC, err = g.ctl.CreateSite(ctx, w.c, "sea.com", ""); err != nil {
		t.Fatal(err)
	}
	p, err := g.ctl.AddUser(ctx, w.a, "both@site.com", "correct horse battery P", sqlite.RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	w.person = p.ID
	if err := g.ctl.JoinAccount(ctx, p.ID, w.b, sqlite.RoleOwner); err != nil {
		t.Fatal(err)
	}
	w.p = client()
	if code, out := do(t, w.p, "POST", g.srv.URL+"/api/v1/login", `{"email":"both@site.com","password":"correct horse battery P"}`); code != http.StatusOK {
		t.Fatalf("the person signs in: %d %v", code, out)
	}
	return w
}

func (w world) get(t *testing.T, c *http.Client, path string, hdr ...string) (int, map[string]any) {
	t.Helper()
	return do(t, c, "GET", w.g.srv.URL+path, "", hdr...)
}

func (w world) ids(t *testing.T, path string, hdr ...string) []string {
	t.Helper()
	code, out := w.get(t, w.p, path, hdr...)
	if code != http.StatusOK {
		t.Fatalf("GET %s %v: %d %v", path, hdr, code, out)
	}
	var ids []string
	for _, s := range out["sites"].([]any) {
		ids = append(ids, s.(map[string]any)["id"].(string))
	}
	return ids
}

// me says which accounts a person is in and which one this tab is in; the
// role is the one of that membership.
func TestMeListsAccountsAndFollowsTheHeader(t *testing.T) {
	w := newWorld(t)
	code, me := w.get(t, w.p, "/api/v1/me")
	if code != 200 {
		t.Fatalf("me: %d %v", code, me)
	}
	// No header, nothing used last: the oldest where they own.
	if me["account"] != w.b || me["role"] != "owner" {
		t.Fatalf("the fallback opens %v as %v, want B as owner", me["account"], me["role"])
	}
	list := me["accounts"].([]any)
	if len(list) != 2 {
		t.Fatalf("accounts: %v", list)
	}
	first, second := list[0].(map[string]any), list[1].(map[string]any)
	if first["id"] != w.a || first["role"] != "viewer" || second["id"] != w.b || second["role"] != "owner" {
		t.Fatalf("accounts: %v", list)
	}
	if first["name"] != "me@site.com" || second["name"] != w.ownerBEmail {
		t.Fatalf("an account is named for its first owner: %v %v", first["name"], second["name"])
	}
	if second["total"].(float64) != 2 || len(second["sites"].([]any)) != 2 {
		t.Fatalf("B's sites: %v", second)
	}
	// The header moves the tab, and the role with it.
	if _, me := w.get(t, w.p, "/api/v1/me", acct, w.a); me["account"] != w.a || me["role"] != "viewer" {
		t.Fatalf("A: %v %v", me["account"], me["role"])
	}
	if _, me := w.get(t, w.p, "/api/v1/me", acct, w.b); me["account"] != w.b || me["role"] != "owner" {
		t.Fatalf("B: %v %v", me["account"], me["role"])
	}
	// A header for an account they are not in does not stop a tab from asking
	// who it is: it gets the fallback, and the dashboard sees the difference.
	if code, me := w.get(t, w.p, "/api/v1/me", acct, w.c); code != 200 || me["account"] == w.c {
		t.Fatalf("a tab whose account is gone: %d %v", code, me)
	}
}

// What a list shows is the account in view; the role there decides what may
// change.
func TestListsAndWritesFollowTheAccountInView(t *testing.T) {
	w := newWorld(t)
	if ids := w.ids(t, "/api/v1/sites", acct, w.a); len(ids) != 1 || ids[0] != w.siteA {
		t.Fatalf("A's sites: %v", ids)
	}
	if ids := w.ids(t, "/api/v1/sites", acct, w.b); len(ids) != 2 {
		t.Fatalf("B's sites: %v", ids)
	}
	// A viewer in A changes nothing there; an owner in B does, for B only.
	if code, _ := do(t, w.p, "POST", w.g.srv.URL+"/api/v1/sites", `{"domain":"new-a.com"}`, csrf, "1", acct, w.a); code != http.StatusForbidden {
		t.Fatalf("a viewer adds a site to A: %d", code)
	}
	code, out := do(t, w.p, "POST", w.g.srv.URL+"/api/v1/sites", `{"domain":"new-b.com"}`, csrf, "1", acct, w.b)
	if code != http.StatusCreated && code != http.StatusOK {
		t.Fatalf("an owner adds a site to B: %d %v", code, out)
	}
	if sites, _ := w.g.ctl.ListSites(context.Background(), w.b); len(sites) != 3 {
		t.Fatalf("B has %d sites", len(sites))
	}
	if sites, _ := w.g.ctl.ListSites(context.Background(), w.a); len(sites) != 1 {
		t.Fatalf("A has %d sites", len(sites))
	}
	// The people of the account in view, for an owner there only.
	if code, _ := w.get(t, w.p, "/api/v1/people", acct, w.a); code != http.StatusForbidden {
		t.Fatalf("a viewer reads A's people: %d", code)
	}
	if code, out := w.get(t, w.p, "/api/v1/people", acct, w.b); code != 200 || len(out["people"].([]any)) != 2 {
		t.Fatalf("an owner reads B's people: %d %v", code, out)
	}
}

// An account they are not in: 403 not_member for what names no site; "site
// not found" for a site, whatever the header says. A member of two reaches
// each one's sites whichever account their tab is in: the site decides.
func TestTheSiteDecidesTheAccountAndNobodyReachesAnotherOne(t *testing.T) {
	w := newWorld(t)
	code, out := w.get(t, w.p, "/api/v1/sites", acct, w.c)
	if code != http.StatusForbidden || out["code"] != "not_member" {
		t.Fatalf("a header for an account they are not in: %d %v", code, out)
	}
	for _, h := range []string{w.a, w.b, w.c, "acc_nowhere", ""} {
		hdr := []string{}
		if h != "" {
			hdr = []string{acct, h}
		}
		if code, _ := w.get(t, w.p, "/api/v1/sites/"+w.siteC, hdr...); code != http.StatusNotFound {
			t.Errorf("C's site with the header %q: %d", h, code)
		}
		if code, _ := w.get(t, w.p, "/api/v1/sites/"+w.siteB, hdr...); code != 200 {
			t.Errorf("B's site with the header %q: %d", h, code)
		}
		if code, _ := w.get(t, w.p, "/api/v1/sites/"+w.siteA, hdr...); code != 200 {
			t.Errorf("A's site with the header %q: %d", h, code)
		}
	}
	// Reading A's site as a viewer, with B in view, is still a viewer's read.
	if code, _ := do(t, w.p, "PATCH", w.g.srv.URL+"/api/v1/sites/"+w.siteA, `{"name":"mine"}`, csrf, "1", acct, w.b); code != http.StatusForbidden {
		t.Fatalf("changing A's site from a tab in B: %d", code)
	}
	if code, _ := do(t, w.p, "PATCH", w.g.srv.URL+"/api/v1/sites/"+w.siteB, `{"name":"mine"}`, csrf, "1", acct, w.a); code != http.StatusOK {
		t.Fatalf("an owner of B changes B's site from a tab in A: %d", code)
	}
	// Nobody outside an account reaches it, not by a header, not by a guess.
	if code, _ := w.get(t, w.ownerB, "/api/v1/sites/"+w.siteA, acct, w.a); code != http.StatusNotFound {
		t.Fatalf("B's owner with A's header on A's site: %d", code)
	}
	if code, _ := w.get(t, w.ownerB, "/api/v1/sites", acct, w.a); code != http.StatusForbidden {
		t.Fatalf("B's owner listing A's sites: %d", code)
	}
}

// Every route, as someone in A and B, against an account they are not in.
func TestEveryRouteRefusesAnAccountThePersonIsNotIn(t *testing.T) {
	w := newWorld(t)
	fill := strings.NewReplacer("{site}", w.siteC, "{id}", "x", "{module}", "goals", "{visitor}", "1", "{subject}", w.person, "{kind}", "visits", "{step}", "1")
	tried, named := 0, 0
	for _, pattern := range w.g.api.patterns {
		method, raw, _ := strings.Cut(pattern, " ")
		if !strings.HasPrefix(raw, "/api/v1/") || strings.HasPrefix(raw, "/api/v1/share/") || raw == "/api/v1/setup" || raw == "/api/v1/login" || raw == "/api/v1/logout" || raw == "/api/v1/payments/start-over" {
			continue
		}
		path := fill.Replace(raw)
		siteRoute := strings.Contains(raw, "{site}")
		for _, h := range []string{w.a, w.b, w.c} {
			body := strings.NewReader(`{"role":"viewer"}`)
			req, _ := http.NewRequest(method, w.g.srv.URL+path, body)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set(csrf, "1")
			req.Header.Set(acct, h)
			res, err := w.p.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			raw, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
			res.Body.Close()
			tried++
			switch {
			case siteRoute:
				// Another account's site: never found, whatever the header.
				if res.StatusCode != http.StatusNotFound {
					t.Errorf("%s %s with header %s: %d %s", method, path, h, res.StatusCode, raw)
				}
			case h == w.c && !personRoute(req):
				named++
				if res.StatusCode != http.StatusForbidden || !strings.Contains(string(raw), "not_member") {
					t.Errorf("%s %s naming an account they are not in: %d %s", method, path, res.StatusCode, raw)
				}
			}
		}
	}
	if tried < 200 || named < 10 {
		t.Fatalf("only %d calls, %d naming another account: the route list is not being recorded", tried, named)
	}
}

// A viewer limited to some of an account's sites sees those there, and only
// in that account.
func TestALimitBelongsToOneAccount(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	// The person is a viewer in B this time, limited to one of its two sites,
	// and unlimited in A.
	if err := w.g.ctl.SetRole(ctx, w.b, w.person, sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	if err := w.g.ctl.SetAccess(ctx, w.b, w.person, []string{w.siteB}); err != nil {
		t.Fatal(err)
	}
	if ids := w.ids(t, "/api/v1/sites", acct, w.b); len(ids) != 1 || ids[0] != w.siteB {
		t.Fatalf("B's sites for the limited viewer: %v", ids)
	}
	if code, _ := w.get(t, w.p, "/api/v1/sites/"+w.siteB2, acct, w.b); code != http.StatusNotFound {
		t.Fatalf("a site outside the limit: %d", code)
	}
	if code, _ := w.get(t, w.p, "/api/v1/sites/"+w.siteB2, acct, w.a); code != http.StatusNotFound {
		t.Fatalf("a site outside the limit, with another account in view: %d", code)
	}
	if ids := w.ids(t, "/api/v1/sites", acct, w.a); len(ids) != 1 || ids[0] != w.siteA {
		t.Fatalf("the limit leaked into A: %v", ids)
	}
	_, me := w.get(t, w.p, "/api/v1/me")
	for _, c := range me["accounts"].([]any) {
		if c.(map[string]any)["id"] == w.b && c.(map[string]any)["total"].(float64) != 1 {
			t.Fatalf("the switcher counts what they may see: %v", c)
		}
	}
}

// me/account remembers the account a new tab opens in; me/leave ends one
// membership; with none left the person is out.
func TestLastAccountLeavingAndTheFallback(t *testing.T) {
	w := newWorld(t)
	if code, _ := do(t, w.p, "POST", w.g.srv.URL+"/api/v1/me/account", `{"account":"`+w.c+`"}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("remembering an account they are not in: %d", code)
	}
	if code, _ := do(t, w.p, "POST", w.g.srv.URL+"/api/v1/me/account", `{"account":"`+w.a+`"}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("remembering A: %d", code)
	}
	if _, me := w.get(t, w.p, "/api/v1/me"); me["account"] != w.a {
		t.Fatalf("a tab with no header opens the account used last: %v", me["account"])
	}
	if _, me := w.get(t, w.p, "/api/v1/me", acct, w.b); me["account"] != w.b {
		t.Fatalf("a header beats what was used last: %v", me["account"])
	}
	// Leaving the one used last: it falls back to the oldest where they own.
	if code, out := do(t, w.p, "POST", w.g.srv.URL+"/api/v1/me/leave", `{"account":"`+w.a+`"}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("leaving A: %d %v", code, out)
	}
	if _, me := w.get(t, w.p, "/api/v1/me"); me["account"] != w.b || len(me["accounts"].([]any)) != 1 {
		t.Fatalf("after leaving A: %v", me)
	}
	// A tab still in A is told it is not in it, and its sites are gone.
	if code, out := w.get(t, w.p, "/api/v1/sites", acct, w.a); code != http.StatusForbidden || out["code"] != "not_member" {
		t.Fatalf("a tab in the account they left: %d %v", code, out)
	}
	if code, _ := w.get(t, w.p, "/api/v1/sites/"+w.siteA); code != http.StatusNotFound {
		t.Fatalf("a site of the account they left: %d", code)
	}
	if people, _ := w.g.ctl.People(context.Background(), w.a); len(people) != 1 {
		t.Fatalf("A has %d people", len(people))
	}
	// The other account and the owner's own sign-in are untouched.
	if code, _ := w.get(t, w.ownerA, "/api/v1/people"); code != 200 {
		t.Fatalf("A's owner: %d", code)
	}
	// Leaving twice is refused; leaving the last takes the person out.
	if code, _ := do(t, w.p, "POST", w.g.srv.URL+"/api/v1/me/leave", `{"account":"`+w.a+`"}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("leaving A again: %d", code)
	}
	if code, out := do(t, w.p, "POST", w.g.srv.URL+"/api/v1/me/leave", `{"account":"`+w.b+`"}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("leaving the last account: %d %v", code, out)
	}
	if code, _ := w.get(t, w.p, "/api/v1/me"); code != http.StatusUnauthorized {
		t.Fatalf("no membership left: %d", code)
	}
}

// The first owner of an account keeps it: they cannot leave it.
func TestTheFirstOwnerCannotLeave(t *testing.T) {
	w := newWorld(t)
	if code, out := do(t, w.ownerB, "POST", w.g.srv.URL+"/api/v1/me/leave", `{"account":"`+w.b+`"}`, csrf, "1"); code != http.StatusConflict {
		t.Fatalf("the holder leaves: %d %v", code, out)
	}
	// Made another owner, B's first owner still cannot; the newcomer can.
	if code, out := do(t, w.p, "POST", w.g.srv.URL+"/api/v1/me/leave", `{"account":"`+w.b+`"}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("a second owner leaves: %d %v", code, out)
	}
}

// A person who was taken out of an account stops reaching it at once, with no
// session to end: the next request checks the membership.
func TestRemovalTakesEffectAtOnce(t *testing.T) {
	w := newWorld(t)
	if code, _ := w.get(t, w.p, "/api/v1/sites/"+w.siteB, acct, w.b); code != 200 {
		t.Fatalf("before: %d", code)
	}
	if code, out := do(t, w.ownerB, "DELETE", w.g.srv.URL+"/api/v1/people/"+w.person, "", csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("B's owner removes them: %d %v", code, out)
	}
	if code, _ := w.get(t, w.p, "/api/v1/sites/"+w.siteB, acct, w.b); code != http.StatusNotFound {
		t.Fatalf("after: %d", code)
	}
	if code, _ := w.get(t, w.p, "/api/v1/sites/"+w.siteA, acct, w.b); code != 200 {
		t.Fatalf("their own account is untouched, whatever the tab says: %d", code)
	}
}
