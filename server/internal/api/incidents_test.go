package api

import (
	"context"
	"net/http"
	"strconv"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// seedIncidents makes n closed incidents, one an hour apart, ending the
// moment before the rig's clock.
func seedIncidents(t *testing.T, g *rig, n int) {
	t.Helper()
	ctx := context.Background()
	for i := 0; i < n; i++ {
		start := g.now.Unix() - int64(n-i)*7200
		if _, err := g.ctl.StartIncident(ctx, g.site, "quiet", start, "no visits"); err != nil {
			t.Fatal(err)
		}
		open, _ := g.ctl.OpenIncident(ctx, g.site)
		exp := int64(10 * (i + 1))
		if err := g.ctl.EndIncident(ctx, open.ID, start+3600, &exp); err != nil {
			t.Fatal(err)
		}
	}
}

// The incident list: signed in only, five by default, at most fifty, newest
// first, paged by the start of the last; another account sees nothing; an API
// key reads; a viewer reads but cannot write a note.
func TestIncidentsEndpoint(t *testing.T) {
	g := newRig(t)
	c := client()
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/incidents"
	if code, _ := do(t, c, "GET", base, ""); code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", code)
	}
	g.setup(t, c)
	seedIncidents(t, g, 7)

	code, out := do(t, c, "GET", base, "")
	list := out["incidents"].([]any)
	if code != 200 || len(list) != 5 || out["next_before"] == nil {
		t.Fatalf("default page: %d, %d rows, next %v", code, len(list), out["next_before"])
	}
	first := list[0].(map[string]any)
	if first["kind"] != "quiet" || first["expected_visits"] != float64(70) || first["ended_at"] == nil || first["cause"] != "no visits" {
		t.Fatalf("newest first: %v", first)
	}
	next := strconv.FormatInt(int64(out["next_before"].(float64)), 10)
	_, out = do(t, c, "GET", base+"?before="+next, "")
	if rest := out["incidents"].([]any); len(rest) != 2 || out["next_before"] != nil {
		t.Fatalf("second page: %d rows, next %v", len(rest), out["next_before"])
	}
	if _, out = do(t, c, "GET", base+"?limit=2", ""); len(out["incidents"].([]any)) != 2 {
		t.Fatal("limit=2")
	}
	if _, out = do(t, c, "GET", base+"?limit=500", ""); len(out["incidents"].([]any)) != 7 {
		t.Fatal("limit=500 is held at 50, which shows all 7")
	}

	// A period: what overlaps it, with the totals cut to it (1800 s of the
	// first, the whole of the other two).
	from := g.now.Unix() - 3*7200 + 1800
	_, out = do(t, c, "GET", base+"?from="+strconv.FormatInt(from, 10), "")
	sum := out["summary"].(map[string]any)
	if got := len(out["incidents"].([]any)); got != 3 || sum["count"] != float64(3) || sum["seconds"] != float64(1800+3600+3600) || sum["lost"] != float64(180) || sum["lost_some"] != true {
		t.Fatalf("period: %d rows, %v", got, sum)
	}

	// A note, by the owner.
	id := first["id"].(string)
	pc, one := do(t, c, "PATCH", base+"/"+id, `{"note":"DNS expired"}`, csrf, "1")
	if pc != 200 || one["note"] != "DNS expired" {
		t.Fatalf("note: %d %v", pc, one)
	}
	if pc, _ = do(t, c, "PATCH", base+"/inc_nothere", `{"note":"x"}`, csrf, "1"); pc != http.StatusNotFound {
		t.Fatalf("missing incident: %d", pc)
	}

	// A viewer reads, and cannot write a note.
	ctx := context.Background()
	if _, err := g.ctl.AddUser(ctx, sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	v := client()
	if code, _ := do(t, v, "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@site.com","password":"correct horse battery V"}`); code != 200 {
		t.Fatal("viewer signs in")
	}
	if code, out := do(t, v, "GET", base, ""); code != 200 || len(out["incidents"].([]any)) != 5 {
		t.Fatalf("viewer reads: %d", code)
	}
	if code, _ := do(t, v, "PATCH", base+"/"+id, `{"note":"mine"}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("viewer note: %d, want 403", code)
	}

	// An API key reads and cannot write.
	key, _, err := g.ctl.CreateAPIKey(ctx, sqlite.DefaultAccount, "k")
	if err != nil {
		t.Fatal(err)
	}
	if code, _ := do(t, http.DefaultClient, "GET", base, "", "Authorization", "Bearer "+key); code != 200 {
		t.Fatalf("key reads: %d", code)
	}
	if code, _ := do(t, http.DefaultClient, "PATCH", base+"/"+id, `{"note":"k"}`, "Authorization", "Bearer "+key); code != http.StatusForbidden {
		t.Fatalf("key writes: %d, want 403", code)
	}
}

// The account's list: every site of the account, nothing from a viewer's
// hidden sites, and it goes with the site.
func TestAccountIncidentsAndSiteDeletion(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	seedIncidents(t, g, 3)
	_, out := do(t, c, "GET", g.srv.URL+"/api/v1/incidents?days=1", "")
	list := out["incidents"].([]any)
	if len(list) != 3 || list[0].(map[string]any)["site"] != g.site {
		t.Fatalf("account list: %v", out)
	}
	if _, out = do(t, c, "GET", g.srv.URL+"/api/v1/incidents?days=0", ""); len(out["incidents"].([]any)) != 3 {
		t.Fatal("the default period is a month")
	}
	if _, err := g.ctl.DeleteSite(context.Background(), g.site); err != nil {
		t.Fatal(err)
	}
	if _, out = do(t, c, "GET", g.srv.URL+"/api/v1/incidents", ""); len(out["incidents"].([]any)) != 0 {
		t.Fatal("incidents outlived their site")
	}
}
