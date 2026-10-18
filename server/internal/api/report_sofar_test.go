package api

import (
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// A period still running is compared with the same stretch of the one before when sofar=1, and with all of it otherwise.
func TestReportCompareSoFar(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	// The server's clock: 12:00 on 2026-09-21, so "so far" is the first twelve hours.
	g.clock.Store(time.Date(2026, 9, 21, 12, 0, 0, 0, time.UTC).UnixMilli())
	at := func(d, h int) int64 { return time.Date(2026, 9, d, h, 0, 0, 0, time.UTC).UnixMilli() }
	n := uint64(0)
	add := func(e event.Event) { n++; e.EventID = n; g.event(t, e) }
	add(event.Event{Kind: event.KindPageview, TS: at(21, 9), Visitor: 1, Path: "/"})
	add(event.Event{Kind: event.KindPageview, TS: at(20, 9), Visitor: 2, Path: "/"})
	add(event.Event{Kind: event.KindPageview, TS: at(20, 20), Visitor: 3, Path: "/"})
	g.waitApplied(t, n)
	visitors := func(q string) float64 {
		_, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/report?from=2026-09-21&to=2026-09-21&compare=previous"+q, "")
		return out["previous"].(map[string]any)["kpis"].(map[string]any)["visitors"].(float64)
	}
	if v := visitors(""); v != 2 {
		t.Fatalf("whole day before: %v", v)
	}
	if v := visitors("&sofar=1"); v != 1 {
		t.Fatalf("day before, so far: %v", v)
	}
	// The range it says it compared with is the day before in both cases, never one that ends before it starts.
	for _, q := range []string{"", "&sofar=1"} {
		_, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/report?from=2026-09-21&to=2026-09-21&compare=previous"+q, "")
		if out["previous_from"] != "2026-09-20" || out["previous_to"] != "2026-09-20" {
			t.Fatalf("previous range%s: %v..%v", q, out["previous_from"], out["previous_to"])
		}
	}
}

// People since an hour are counted as people: one visitor seen in two hours is one.
func TestReportSinceHour(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	g.clock.Store(time.Date(2026, 9, 21, 15, 0, 0, 0, time.UTC).UnixMilli())
	at := func(h int) int64 { return time.Date(2026, 9, 21, h, 0, 0, 0, time.UTC).UnixMilli() }
	n := uint64(0)
	add := func(e event.Event) { n++; e.EventID = n; g.event(t, e) }
	add(event.Event{Kind: event.KindPageview, TS: at(7), Visitor: 1, Path: "/"})
	add(event.Event{Kind: event.KindPageview, TS: at(10), Visitor: 1, Path: "/"})
	add(event.Event{Kind: event.KindPageview, TS: at(11), Visitor: 1, Path: "/a"})
	add(event.Event{Kind: event.KindPageview, TS: at(12), Visitor: 2, Path: "/"})
	g.waitApplied(t, n)
	visitors := func(q string) float64 {
		_, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/report?from=2026-09-21&to=2026-09-21"+q, "")
		return out["current"].(map[string]any)["kpis"].(map[string]any)["visitors"].(float64)
	}
	if v := visitors(""); v != 2 {
		t.Fatalf("whole day: %v", v)
	}
	if v := visitors("&sincehour=9"); v != 2 {
		t.Fatalf("since 09:00: %v", v)
	}
	if v := visitors("&sincehour=11"); v != 2 {
		t.Fatalf("since 11:00: %v", v)
	}
	if v := visitors("&sincehour=12"); v != 1 {
		t.Fatalf("since 12:00: %v", v)
	}
}
