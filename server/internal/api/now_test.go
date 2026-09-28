package api

import (
	"math/rand"
	"net/http"
	"sort"
	"strconv"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// Live mode's numbers are the events' own, counted again here by hand from
// the very events the test wrote: per-minute pageviews, visitors now and
// the 30 minutes before, channels, who is on the site and what they last saw.
func TestLiveNowIsExact(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	now := g.advance(25*time.Second + 400*time.Millisecond) // not on a whole minute
	rnd := rand.New(rand.NewSource(7))                      //nolint:gosec // seeded so the test data is repeatable, not security
	channels := []string{"Search", "Social", "", "AI", "Referral"}
	paths := []string{"/", "/pricing", "/docs", "/blog/x"}
	var evs []event.Event
	for i := 1; i <= 400; i++ {
		kind := event.KindPageview
		switch r := rnd.Intn(10); {
		case r == 0:
			kind = event.KindGoal
		case r < 3:
			kind = event.KindEngagement
		}
		// 70 minutes back to now, a few from before the window's edges.
		at := now.Add(-time.Duration(rnd.Int63n(int64(70 * time.Minute))))
		e := event.Event{Kind: kind, EventID: uint64(i), TS: at.UnixMilli(), Visitor: uint64(1 + rnd.Intn(60)), Pageview: uint64(i), //nolint:gosec // Intn never returns a negative number
			Path: paths[rnd.Intn(len(paths))], Channel: channels[rnd.Intn(len(channels))], Country: "DE"}
		if kind == event.KindGoal {
			e.Goal = "signup"
		}
		evs = append(evs, e)
		g.event(t, e)
	}
	// One right on now: the window includes its end.
	evs = append(evs, event.Event{Kind: event.KindPageview, EventID: 401, TS: now.UnixMilli(), Visitor: 99, Pageview: 401, Path: "/now", Channel: "Email"})
	g.event(t, evs[len(evs)-1])
	g.waitApplied(t, 401)

	code, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/now", "")
	if code != 200 {
		t.Fatalf("now: %d %v", code, out)
	}

	// By hand.
	ms := now.UnixMilli()
	start := now.Truncate(time.Minute).Add(-29 * time.Minute).UnixMilli()
	minutes := make([]float64, 30)
	cur, prev, online := map[uint64]bool{}, map[uint64]bool{}, map[uint64]bool{}
	byChannel := map[string]map[uint64]bool{}
	type row struct {
		ts, last int64
		path     string
		visitor  uint64
		seq      int
	}
	latest := map[uint64]*row{}
	for i, e := range evs {
		if e.TS > ms {
			continue
		}
		if e.TS >= ms-5*60_000 {
			online[e.Visitor] = true
		}
		if e.Kind != event.KindPageview && e.Kind != event.KindGoal {
			continue
		}
		if e.TS >= ms-30*60_000 {
			r := latest[e.Visitor]
			if r == nil || e.TS > r.ts || e.TS == r.ts && i > r.seq {
				latest[e.Visitor] = &row{ts: e.TS, path: e.Path, visitor: e.Visitor, seq: i}
			}
		}
		if e.Kind != event.KindPageview {
			continue
		}
		if e.TS >= start {
			minutes[(e.TS-start)/60_000]++
		}
		switch {
		case e.TS >= ms-30*60_000:
			cur[e.Visitor] = true
			ch := e.Channel
			if ch == "" {
				ch = "Direct"
			}
			if byChannel[ch] == nil {
				byChannel[ch] = map[uint64]bool{}
			}
			byChannel[ch][e.Visitor] = true
		case e.TS >= ms-60*60_000:
			prev[e.Visitor] = true
		}
	}
	var rows []*row
	for v, r := range latest {
		if !online[v] {
			continue
		}
		for _, e := range evs {
			if e.Visitor == v && e.TS <= ms && e.TS > r.last {
				r.last = e.TS
			}
		}
		rows = append(rows, r)
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].last != rows[j].last {
			return rows[i].last > rows[j].last
		}
		if rows[i].ts != rows[j].ts {
			return rows[i].ts > rows[j].ts
		}
		return rows[i].visitor < rows[j].visitor
	})

	if out["at"] != float64(ms) || out["start"] != float64(start) {
		t.Fatalf("at %v start %v, want %d %d", out["at"], out["start"], ms, start)
	}
	got := out["minutes"].([]any)
	if len(got) != 30 {
		t.Fatalf("%d minutes", len(got))
	}
	for i := range minutes {
		if got[i] != minutes[i] {
			t.Fatalf("minute %d: %v, want %v (all %v vs %v)", i, got[i], minutes[i], got, minutes)
		}
	}
	if out["visitors"] != float64(len(cur)) || out["previous"] != float64(len(prev)) || out["online"] != float64(len(online)) {
		t.Fatalf("visitors %v previous %v online %v, want %d %d %d", out["visitors"], out["previous"], out["online"], len(cur), len(prev), len(online))
	}
	sources := out["sources"].([]any)
	if len(sources) != len(byChannel) {
		t.Fatalf("sources %v, want %d channels", sources, len(byChannel))
	}
	last := 1 << 30
	for _, s := range sources {
		m := s.(map[string]any)
		n := int(m["visitors"].(float64))
		if n != len(byChannel[m["channel"].(string)]) || n > last {
			t.Fatalf("sources %v", sources)
		}
		last = n
	}
	recent := out["recent"].([]any)
	if len(recent) != len(rows) {
		t.Fatalf("%d on the site, want %d", len(recent), len(rows))
	}
	for i, r := range rows {
		m := recent[i].(map[string]any)
		if m["ts"] != float64(r.ts) || m["last"] != float64(r.last) || m["path"] != r.path || m["visitor"] != strconv.FormatUint(r.visitor, 36) {
			t.Fatalf("row %d: %v, want %+v", i, m, *r)
		}
	}
}

// With the journeys module off, no row carries a visitor id, as on the
// stream; with revenue off there is no money. A share link has no Live.
func TestLiveNowFollowsModulesAndAccess(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, TS: g.now.UnixMilli(), Visitor: 5, Path: "/"})
	g.waitApplied(t, 1)

	visitorOf := func() any {
		t.Helper()
		code, out := do(t, c, "GET", base+"/now", "")
		if code != 200 {
			t.Fatalf("now: %d %v", code, out)
		}
		if _, ok := out["revenue"]; ok {
			t.Fatalf("revenue with no payments: %v", out)
		}
		return out["recent"].([]any)[0].(map[string]any)["visitor"]
	}
	if v := visitorOf(); v != "5" {
		t.Fatalf("journeys on: visitor %v", v)
	}
	if code, _ := do(t, c, "PUT", base+"/modules/journeys", `{"enabled":false}`, csrf, "1"); code != 200 {
		t.Fatal("journeys off")
	}
	if v := visitorOf(); v != nil {
		t.Fatalf("journeys off: visitor %v sent", v)
	}

	// A share session is no way in.
	_, sh := do(t, c, "POST", base+"/shares", `{"name":"x","revenue":true}`, csrf, "1")
	url := sh["url"].(string)
	anon := client()
	if code, _ := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`); code != 200 {
		t.Fatal("open share")
	}
	if code, _ := do(t, anon, "GET", base+"/now", ""); code != http.StatusUnauthorized {
		t.Fatalf("a share link read Live: %d", code)
	}
}

// Answers are reused for two seconds, but never past a new visit.
func TestLiveNowCacheFollowsCommits(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	url := g.srv.URL + "/api/v1/sites/" + g.site + "/now"
	visitors := func() float64 {
		t.Helper()
		code, out := do(t, c, "GET", url, "")
		if code != 200 {
			t.Fatalf("now: %d %v", code, out)
		}
		return out["visitors"].(float64)
	}
	if n := visitors(); n != 0 {
		t.Fatalf("visitors %v", n)
	}
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, TS: g.now.UnixMilli(), Visitor: 1, Path: "/"})
	g.waitApplied(t, 1)
	if n := visitors(); n != 1 {
		t.Fatalf("visitors %v after a visit: the cache held the old answer", n)
	}
	// Two seconds on, the minute window moves even with nothing new.
	g.advance(31 * time.Minute)
	if n := visitors(); n != 0 {
		t.Fatalf("visitors %v half an hour later", n)
	}
}
