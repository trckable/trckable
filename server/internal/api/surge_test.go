package api

import (
	"context"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/surge"
)

// usualWeeks writes what a Tuesday noon usually looks like: per visitors in
// every five minutes of that hour, for the four weeks before the rig's now.
// It returns the last event id used.
func (g *rig) usualWeeks(t *testing.T, per int) uint64 {
	t.Helper()
	var id uint64
	hour := time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC)
	for w := 1; w <= 4; w++ {
		for b := 0; b < 12; b++ {
			for v := 0; v < per; v++ {
				id++
				at := hour.AddDate(0, 0, -7*w).Add(time.Duration(b)*5*time.Minute + time.Minute)
				g.event(t, event.Event{Kind: event.KindPageview, EventID: id, TS: at.UnixMilli(), Visitor: uint64(1000 + v), Pageview: id, Path: "/", Channel: "Direct"})
			}
		}
	}
	return id
}

// A crowd arrives: n people in the last five minutes, from one source, on one page.
func (g *rig) crowd(t *testing.T, id uint64, n, fromFacebook int, now time.Time) uint64 {
	t.Helper()
	for v := 0; v < n; v++ {
		id++
		e := event.Event{Kind: event.KindPageview, EventID: id, TS: now.Add(-time.Duration(30+v) * time.Second).UnixMilli(), Visitor: uint64(5000 + v), Pageview: id, Path: "/", Channel: "Direct", Country: "DE"}
		if v < fromFacebook {
			e.Path, e.Channel, e.RefHost, e.Country = "/blog/launch-post", "Social", "l.facebook.com", "US"
		}
		g.event(t, e)
	}
	return id
}

func surgeOf(t *testing.T, g *rig, c *http.Client) map[string]any {
	t.Helper()
	code, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/surge", "")
	if code != http.StatusOK {
		t.Fatalf("surge: %d %v", code, out)
	}
	s, _ := out["surge"].(map[string]any)
	return s
}

// A crowd of 14 against a usual of 5: it is a surge, it says who sent most of
// them (Facebook, with how many that source usually has), the page and the
// jump, it is recorded as a moment, and it is told to the alert hook once.
func TestSurgeIsFoundAndExplained(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	told := &atomic.Int32{}
	g.api.OnSurge = func(surge.Surge) { told.Add(1) }
	id := g.usualWeeks(t, 5)
	now := g.advance(0)
	id = g.crowd(t, id, 14, 10, now)
	g.waitApplied(t, id)

	s := surgeOf(t, g, c)
	if s == nil {
		t.Fatal("no surge for 14 online against a usual of 5")
	}
	if s["online"] != float64(14) || s["usual"] != float64(5) || s["times"] != 2.8 {
		t.Fatalf("numbers: %v", s)
	}
	why, _ := s["why"].(map[string]any)
	if why["source"] != "Facebook" || why["source_n"] != float64(10) || why["source_dim"] != "referrer" || why["source_value"] != "l.facebook.com" {
		t.Fatalf("source: %v", why)
	}
	if why["page"] != "/blog/launch-post" || why["page_n"] != float64(10) {
		t.Fatalf("page: %v", why)
	}
	if why["country"] != nil && why["country"] != "US" {
		t.Fatalf("country: %v", why)
	}
	if why["before"] != float64(0) || why["minutes"] != float64(15) {
		t.Fatalf("the jump: %v", why)
	}
	// Facebook never sent anyone at this hour before.
	if why["source_usual"] != float64(0) {
		t.Fatalf("usual from Facebook: %v", why["source_usual"])
	}

	// How it went: twelve slices of the last hour, the crowd all in the last one.
	story, _ := s["story"].(map[string]any)
	series, _ := story["series"].([]any)
	if len(series) != 12 || story["now"] != float64(14) || story["peak"] != float64(14) {
		t.Fatalf("story: %v", story)
	}
	if want := float64(now.Add(-5 * time.Minute).Unix()); story["start"] != want {
		t.Fatalf("it began in the last slice: %v, want %v", story["start"], want)
	}

	// Asked again, the same surge, and told once.
	if again := surgeOf(t, g, c); again == nil || again["id"] != s["id"] {
		t.Fatalf("again: %v", again)
	}
	g.advance(time.Minute)
	if again := surgeOf(t, g, c); again == nil || again["id"] != s["id"] {
		t.Fatalf("a minute later: %v", again)
	}
	time.Sleep(50 * time.Millisecond)
	if told.Load() != 1 {
		t.Fatalf("told %d times", told.Load())
	}

	// A moment on the chart, "Surge from Facebook".
	day := "2026-09-22"
	code, _, body := get(t, c, g.srv.URL+"/api/v1/sites/"+g.site+"/moments?bucket=hour&from="+day+"&to="+day)
	if code != http.StatusOK || !strings.Contains(body, `"kind":"surge"`) || !strings.Contains(body, `"text":"Facebook"`) || !strings.Contains(body, `"referrer":"l.facebook.com"`) || !strings.Contains(body, `"t":"2026-09-22T12:00"`) {
		t.Fatalf("moments: %d %s", code, body)
	}
	if latest, _ := g.ctl.LatestSurge(context.Background(), g.site); latest == nil || latest.Online != 14 || latest.Why.Source != "Facebook" {
		t.Fatalf("kept: %+v", latest)
	}
}

// The small-site guard: 2 becoming 4, or 9 against nothing, is not a surge;
// and a site with no history has no usual to be above.
func TestSmallSitesAndNewSitesDoNotSurge(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	id := g.usualWeeks(t, 1)
	now := g.advance(0)
	id = g.crowd(t, id, 9, 9, now)
	g.waitApplied(t, id)
	if s := surgeOf(t, g, c); s != nil {
		t.Fatalf("nine people is under the floor: %v", s)
	}

	h := newRig(t)
	d := client()
	h.setup(t, d)
	id = h.crowd(t, 0, 30, 20, h.advance(0))
	h.waitApplied(t, id)
	if s := surgeOf(t, h, d); s != nil {
		t.Fatalf("a site with no earlier weeks has no usual: %v", s)
	}
}

// It ends when it is back under one and a half times the usual, and a second
// crowd within three hours is not another surge.
func TestSurgeEndsAndDoesNotRepeatWithinThreeHours(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	id := g.usualWeeks(t, 5)
	id = g.crowd(t, id, 14, 10, g.advance(0))
	g.waitApplied(t, id)
	if surgeOf(t, g, c) == nil {
		t.Fatal("no surge")
	}
	// Ten minutes on, nobody is left online (their events are older than five minutes).
	g.advance(10 * time.Minute)
	if s := surgeOf(t, g, c); s != nil {
		t.Fatalf("still on with nobody online: %v", s)
	}
	if latest, _ := g.ctl.LatestSurge(context.Background(), g.site); latest == nil || latest.Ended == 0 {
		t.Fatalf("the end is kept: %+v", latest)
	}
	// Another crowd, 20 minutes after the first began: inside the cooldown.
	now := g.advance(0)
	for v := 0; v < 14; v++ {
		id++
		g.event(t, event.Event{Kind: event.KindPageview, EventID: id, TS: now.Add(-time.Duration(20+v) * time.Second).UnixMilli(), Visitor: uint64(9000 + v), Pageview: id, Path: "/", Channel: "Direct"})
	}
	g.waitApplied(t, id)
	g.advance(time.Minute)
	if s := surgeOf(t, g, c); s != nil {
		t.Fatalf("a second surge inside three hours: %v", s)
	}
}
