package api

import (
	"fmt"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// Every period the picker offers, in every kind of zone, comes back with the
// period before it: the dashboard's change figures read from it.
func TestReportComparePeriodsAcrossZones(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	n := uint64(0)
	// A few visitors a day for the 400 days before the rig's now.
	for d := 0; d < 400; d++ {
		for v := 0; v < 3; v++ {
			n++
			g.event(t, event.Event{EventID: n, Kind: event.KindPageview, TS: g.now.AddDate(0, 0, -d).Add(-time.Duration(90+v*200) * time.Minute).UnixMilli(), Visitor: n, Path: "/", Channel: "Search", Country: "DE"})
		}
	}
	g.waitApplied(t, n)
	for _, zone := range []string{"UTC", "Europe/Berlin", "America/New_York"} {
		loc, err := time.LoadLocation(zone)
		if err != nil {
			t.Fatal(err)
		}
		today := g.now.In(loc)
		day := func(back int) string {
			return time.Date(today.Year(), today.Month(), today.Day()-back, 0, 0, 0, 0, loc).Format("2006-01-02")
		}
		cases := []struct {
			name, from, to, prevFrom, prevTo, compare string
		}{
			{"today", day(0), day(0), day(1), day(1), "previous"},
			{"yesterday", day(1), day(1), day(2), day(2), "previous"},
			{"7d", day(6), day(0), day(13), day(7), "previous"},
			{"30d", day(29), day(0), day(59), day(30), "previous"},
			{"custom", day(20), day(10), day(31), day(21), "previous"},
			{"year", day(5), day(0), "", "", "year"},
		}
		for _, k := range cases {
			t.Run(zone+"/"+k.name, func(t *testing.T) {
				q := fmt.Sprintf("/report?from=%s&to=%s&tz=%s&daily=1&compare=%s", k.from, k.to, zone, k.compare)
				code, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+q, "")
				if code != 200 {
					t.Fatalf("report: %d %v", code, out)
				}
				prev, ok := out["previous"].(map[string]any)
				if !ok {
					t.Fatalf("no previous in the answer: %v", out)
				}
				if v := prev["kpis"].(map[string]any)["visitors"].(float64); v < 1 {
					t.Fatalf("previous has no visitors: %v", prev["kpis"])
				}
				if k.prevFrom != "" && (out["previous_from"] != k.prevFrom || out["previous_to"] != k.prevTo) {
					t.Fatalf("previous range %v..%v, want %s..%s", out["previous_from"], out["previous_to"], k.prevFrom, k.prevTo)
				}
			})
		}
	}
}
