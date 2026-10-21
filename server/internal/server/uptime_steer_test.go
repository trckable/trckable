package server

import (
	"context"
	"slices"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// A paused check looks at nothing: not in a round, not in a probe handed
// the site directly.
func TestPausedCheckLooksAtNothing(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	var mu sync.Mutex
	var urls []string
	p, _ := fakeProber(st, func(u string) (int, error) {
		mu.Lock()
		urls = append(urls, u)
		mu.Unlock()
		return 200, nil
	})
	if err := st.SetUptimePaused(ctx, site, true, 1_800_000_000); err != nil {
		t.Fatal(err)
	}
	p.round(ctx)
	p.probe(ctx, sqlite.SiteRow{ID: site, Domain: "a.com"})
	if len(urls) != 0 {
		t.Fatalf("a paused site was looked at: %v", urls)
	}
	if err := st.SetUptimePaused(ctx, site, false, 1_800_000_100); err != nil {
		t.Fatal(err)
	}
	p.round(ctx)
	if len(urls) != 1 || urls[0] != "https://a.com/" {
		t.Fatalf("resumed: %v", urls)
	}
}

// Pausing a site that is down ends the down state without anyone being told
// the site is back: it is not known to be.
func TestPausingADownSiteIsSilent(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	p, clock := fakeProber(st, func(string) (int, error) { return 503, nil })
	row := sqlite.SiteRow{ID: site, Domain: "a.com"}
	var told []string
	p.changed = func(_ context.Context, _ sqlite.SiteRow, before, after sqlite.SiteProbe) {
		switch {
		case !before.Down() && after.Down():
			told = append(told, "down")
		case before.Down() && after.Failures == 0:
			told = append(told, "up")
		}
	}
	p.probe(ctx, row)
	*clock += 300
	p.probe(ctx, row)
	if err := st.SetUptimePaused(ctx, site, true, *clock+10); err != nil {
		t.Fatal(err)
	}
	if pr, _ := st.ProbeOf(ctx, site); pr.Down() || pr.Failures != 0 || pr.DownSince != 0 {
		t.Fatalf("still down after the pause: %+v", pr)
	}
	*clock += 300
	p.round(ctx)
	p.probe(ctx, row)
	if len(told) != 1 || told[0] != "down" {
		t.Fatalf("told %v", told)
	}
}

// The extra paths are looked at with the homepage, on the site's own domain;
// a failing one makes the site down, named by its path.
func TestExtraPathsAreLookedAt(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	if _, err := st.AddUptimePath(ctx, site, "/pricing"); err != nil {
		t.Fatal(err)
	}
	if _, err := st.AddUptimePath(ctx, site, "/blog?x=1"); err != nil {
		t.Fatal(err)
	}
	var (
		mu  sync.Mutex
		got []string
	)
	status := map[string]int{"https://a.com/": 200, "https://a.com/pricing": 200, "https://a.com/blog?x=1": 200}
	p, clock := fakeProber(st, func(u string) (int, error) {
		mu.Lock()
		got = append(got, u)
		mu.Unlock()
		return status[u], nil
	})
	row := sqlite.SiteRow{ID: site, Domain: "a.com"}
	p.probe(ctx, row)
	slices.Sort(got) // extra pages are looked at side by side, in any order
	if len(got) != 3 || got[0] != "https://a.com/" || got[1] != "https://a.com/blog?x=1" || got[2] != "https://a.com/pricing" {
		t.Fatalf("looked at %v", got)
	}
	if pr, _ := st.ProbeOf(ctx, site); pr.Failures != 0 || pr.Error != "" {
		t.Fatalf("all fine: %+v", pr)
	}
	status["https://a.com/pricing"] = 500
	for range 2 {
		*clock += 300
		p.probe(ctx, row)
	}
	pr, _ := st.ProbeOf(ctx, site)
	if !pr.Down() || pr.Error != "/pricing answered 500" {
		t.Fatalf("a failing path: %+v", pr)
	}
	status["https://a.com/pricing"] = 200
	*clock += 300
	p.probe(ctx, row)
	if pr, _ = st.ProbeOf(ctx, site); pr.Down() {
		t.Fatalf("fixed: %+v", pr)
	}
	// A page the firewall turns away is not a failure.
	status["https://a.com/blog?x=1"] = 403
	*clock += 300
	p.probe(ctx, row)
	if pr, _ = st.ProbeOf(ctx, site); pr.Failures != 0 || pr.BlockedSince == 0 {
		t.Fatalf("blocked: %+v", pr)
	}
}

// An extra page that leads somewhere private is left out, not the whole look:
// a failing homepage still marks the site down.
func TestAPrivateExtraPageDoesNotDropTheLook(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	if _, err := st.AddUptimePath(ctx, site, "/go"); err != nil {
		t.Fatal(err)
	}
	p, clock := fakeProber(st, nil)
	p.get = func(_ context.Context, u string) (look, error) {
		if u == "https://a.com/go" {
			return look{}, alerts.ErrUnsafeTarget
		}
		return look{Status: 503}, nil
	}
	row := sqlite.SiteRow{ID: site, Domain: "a.com"}
	for range 2 {
		*clock += 300
		p.probe(ctx, row)
	}
	if pr, _ := st.ProbeOf(ctx, site); !pr.Down() || pr.Error != "Your homepage answered 503" {
		t.Fatalf("the failing homepage was dropped with the private page: %+v", pr)
	}
}

// A probe that began before a pause records and tells nothing.
func TestAProbeStartedBeforeAPauseTellsNothing(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	p, clock := fakeProber(st, nil)
	p.get = func(context.Context, string) (look, error) {
		if err := st.SetUptimePaused(ctx, site, true, *clock); err != nil { // paused while the look is out
			t.Error(err)
		}
		return look{Status: 503}, nil
	}
	told := 0
	p.changed = func(context.Context, sqlite.SiteRow, sqlite.SiteProbe, sqlite.SiteProbe) { told++ }
	for range 3 {
		*clock += 300
		p.probe(ctx, sqlite.SiteRow{ID: site, Domain: "a.com"})
	}
	if pr, _ := st.ProbeOf(ctx, site); pr.Failures != 0 || told != 0 {
		t.Fatalf("a paused check recorded or told: %+v told %d", pr, told)
	}
}

// A site's pages are looked at at most three at a time.
func TestExtraPagesAreLookedAtThreeAtATime(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	for _, path := range []string{"/a", "/b", "/c", "/d", "/e"} {
		if _, err := st.AddUptimePath(ctx, site, path); err != nil {
			t.Fatal(err)
		}
	}
	var in, most, total atomic.Int32
	p, _ := fakeProber(st, nil)
	p.get = func(context.Context, string) (look, error) {
		n := in.Add(1)
		for {
			m := most.Load()
			if n <= m || most.CompareAndSwap(m, n) {
				break
			}
		}
		time.Sleep(20 * time.Millisecond)
		in.Add(-1)
		total.Add(1)
		return look{Status: 200}, nil
	}
	p.probe(ctx, sqlite.SiteRow{ID: site, Domain: "a.com"})
	if total.Load() != 6 || most.Load() > 3 || most.Load() < 2 {
		t.Fatalf("%d looks, %d at once", total.Load(), most.Load())
	}
}
