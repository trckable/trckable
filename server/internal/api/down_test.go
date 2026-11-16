package api

import (
	"context"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// A site the uptime probe finds not answering says so in the sites list and in
// the single site, with since when and why; one failed probe is not enough.
func TestSitesSayWhenTheyAreDown(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	ctx := context.Background()
	say := func(url string) map[string]any {
		t.Helper()
		_, out := do(t, c, "GET", g.srv.URL+url, "")
		if l, ok := out["sites"].([]any); ok {
			return l[0].(map[string]any)
		}
		return out
	}
	for _, url := range []string{"/api/v1/sites", "/api/v1/sites/" + g.site} {
		if v := say(url)["down_since"]; v != nil {
			t.Fatalf("%s: a site never probed is down: %v", url, v)
		}
	}
	if _, _, err := g.ctl.RecordProbe(ctx, g.site, 1000, 0, 0, "No answer within 10 seconds"); err != nil {
		t.Fatal(err)
	}
	if v := say("/api/v1/sites")["down_since"]; v != nil {
		t.Fatalf("one failed probe is a blip: %v", v)
	}
	if _, _, err := g.ctl.RecordProbe(ctx, g.site, 1300, 0, 0, "No answer within 10 seconds"); err != nil {
		t.Fatal(err)
	}
	for _, url := range []string{"/api/v1/sites", "/api/v1/sites/" + g.site} {
		got := say(url)
		if got["down_since"] != float64(1000) || got["down_cause"] != "No answer within 10 seconds" {
			t.Fatalf("%s: %v %v", url, got["down_since"], got["down_cause"])
		}
	}
	if _, _, err := g.ctl.RecordProbe(ctx, g.site, 1600, 200, 0, ""); err != nil {
		t.Fatal(err)
	}
	if v := say("/api/v1/sites")["down_since"]; v != nil {
		t.Fatalf("a site that answers again is still down: %v", v)
	}
	if _, _, err := g.ctl.RecordProbe(ctx, g.site, 1900, 200, 85, ""); err != nil {
		t.Fatal(err)
	}
	_, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/probes", "")
	list, _ := out["probes"].([]any)
	if len(list) != 4 || list[0].(map[string]any)["ms"] != float64(85) {
		t.Fatalf("probes: %v", out)
	}
}

// A site that is not probed and whose daily look failed after its visits went silent is down by the same rule the incident record
// (and so the bell) uses: the sites list says so too, at the same time. A probe that finds the page answering settles it.
func TestSitesAgreeWithTheBellOnADownSite(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	ctx := context.Background()
	last := g.now.Add(-8 * time.Hour).Unix()
	if _, err := g.ctl.DB.ExecContext(ctx, `UPDATE sites SET last_event_at = ? WHERE id = ?`, last, g.site); err != nil {
		t.Fatal(err)
	}
	if err := g.ctl.SetCheck(ctx, g.site, sqlite.SiteCheck{At: g.now.Add(-time.Hour).Unix(), Error: "could not reach the page"}); err != nil {
		t.Fatal(err)
	}
	site := func() map[string]any {
		t.Helper()
		_, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites", "")
		return out["sites"].([]any)[0].(map[string]any)
	}
	for _, url := range []string{"/api/v1/sites", "/api/v1/sites/" + g.site} {
		_, out := do(t, c, "GET", g.srv.URL+url, "")
		if l, ok := out["sites"].([]any); ok {
			out = l[0].(map[string]any)
		}
		if out["down_since"] != float64(last+6*3600) || out["down_cause"] != "could not reach the page" {
			t.Fatalf("%s: a site the bell calls down is not down here: %v", url, out)
		}
	}
	// The bell's own down row, from the incident the record opens for the same site, starts where the list says.
	if _, err := g.ctl.StartIncident(ctx, g.site, "down", last+6*3600, "could not reach the page"); err != nil {
		t.Fatal(err)
	}
	var down feedRow
	for _, r := range feedOf(t, g, c) {
		if r["kind"] == "down" {
			down = r
		}
	}
	if down == nil || down["at"] != site()["down_since"] {
		t.Fatalf("the bell and the list disagree: %v vs %v", down, site()["down_since"])
	}
	// A probe that finds the page answering: not down.
	if _, _, err := g.ctl.RecordProbe(ctx, g.site, g.now.Unix(), 200, 40, ""); err != nil {
		t.Fatal(err)
	}
	if v := site()["down_since"]; v != nil {
		t.Fatalf("a probe that finds the page answering still leaves it down: %v", v)
	}
}
