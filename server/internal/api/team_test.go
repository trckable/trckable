package api

import (
	"net/http"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// The team overview tells today in numbers that match: today is the last of
// the seven days, the source is the one most visitors came from, and a number
// the site cannot back (a usual before two weeks of history, revenue, a source
// with no visit) is left out of the row.
func TestTeamRowsTellTodayAndLeaveOutWhatTheyCannotKnow(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	if code, out := do(t, c, "POST", g.srv.URL+"/api/v1/sites", `{"domain":"second.com"}`, csrf, "1"); code != http.StatusCreated {
		t.Fatalf("second site: %d %v", code, out)
	}
	id := uint64(0)
	visit := func(at time.Time, visitor uint64, channel string) {
		t.Helper()
		id++
		g.event(t, event.Event{EventID: id, Kind: event.KindPageview, TS: at.UnixMilli(), Visitor: visitor, Pageview: id, Path: "/", Channel: channel})
	}
	// Today (the rig's clock is noon UTC): two came by search, one direct.
	at := g.now.Add(-2 * time.Hour)
	visit(at, 1, "Search")
	visit(at, 2, "Search")
	visit(at, 3, "Direct")
	// The same stretch a week and two weeks back: one visitor, then three.
	visit(at.AddDate(0, 0, -7), 4, "Direct")
	for v := uint64(5); v < 8; v++ {
		visit(at.AddDate(0, 0, -14), v, "Direct")
	}
	g.waitApplied(t, id)

	code, out := do(t, c, "GET", g.srv.URL+"/api/v1/team", "")
	if code != http.StatusOK {
		t.Fatalf("team: %d %v", code, out)
	}
	rows := map[string]map[string]any{}
	for _, s := range out["sites"].([]any) {
		m := s.(map[string]any)
		rows[m["id"].(string)] = m
	}
	one := rows[g.site]
	series := one["series"].([]any)
	if len(series) != 7 || series[6] != one["today"] || one["today"] != float64(3) {
		t.Fatalf("today %v and the last of the series %v disagree: %v", one["today"], series, one)
	}
	if one["top_source"] != "Search" {
		t.Errorf("top source = %v, want Search", one["top_source"])
	}
	if one["usual"] != float64(2) { // (1 + 3) / 2
		t.Errorf("usual = %v, want 2", one["usual"])
	}
	if _, has := one["revenue"]; has {
		t.Errorf("a site with no payments shows revenue: %v", one["revenue"])
	}
	for _, other := range rows {
		if other["id"] == g.site {
			continue
		}
		if other["today"] != float64(0) || other["top_source"] != nil || other["usual"] != nil || other["revenue"] != nil {
			t.Errorf("a site with no visits invents numbers: %v", other)
		}
	}
	if len(rows) != 2 {
		t.Errorf("rows = %d, want 2", len(rows))
	}
}
