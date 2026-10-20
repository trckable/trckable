package server

import (
	"context"
	"sync"
	"testing"

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
	var got []string
	status := map[string]int{"https://a.com/": 200, "https://a.com/pricing": 200, "https://a.com/blog?x=1": 200}
	p, clock := fakeProber(st, func(u string) (int, error) {
		got = append(got, u)
		return status[u], nil
	})
	row := sqlite.SiteRow{ID: site, Domain: "a.com"}
	p.probe(ctx, row)
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
