package api

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/milestones"
)

// A milestone is one thing, told once, on the day it was first reached: not
// again by a backfill (the first look back, run again after an import), by the
// nightly check of a later day, or by a second period that holds it.
func TestMilestoneMomentsAreNeverRepeated(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	ctx := context.Background()
	// Three days of visitors from twelve countries: 100 visitors, 10 countries and the first
	// pageview all fall on the first day; 1,000 pageviews on the third.
	var id uint64
	first := time.Date(2026, 9, 18, 9, 0, 0, 0, time.UTC)
	for day, n := range []int{110, 40, 900} {
		for i := 0; i < n; i++ {
			id++
			at := first.AddDate(0, 0, day).Add(time.Duration(i) * time.Second)
			g.event(t, event.Event{Kind: event.KindPageview, EventID: id, TS: at.UnixMilli(), Visitor: uint64(1000 + id), Pageview: id, Path: "/", Country: []string{"DE", "FR", "US", "GB", "NL", "ES", "IT", "PL", "SE", "NO", "DK", "FI"}[i%12]})
		}
	}
	g.waitApplied(t, id)
	check := func(now time.Time) {
		t.Helper()
		sites, _ := g.ctl.MilestoneSites(ctx)
		for _, s := range sites {
			if s.ID == g.site {
				if _, err := milestones.Check(ctx, *g.api.Query(), g.ctl, s, now); err != nil {
					t.Fatal(err)
				}
			}
		}
	}
	count := func() (n int) {
		_ = g.ctl.DB.QueryRow(`SELECT count(*) FROM milestones WHERE site_id = ?`, g.site).Scan(&n)
		return n
	}
	// Sessions are written once they are idle; the check finds nothing before.
	for try := 0; try < 200 && count() < 5; try++ {
		_ = g.ctl.SetMilestonesDay(ctx, g.site, "")
		check(g.now)
		time.Sleep(20 * time.Millisecond)
	}
	want := count()
	if want < 5 {
		t.Fatalf("only %d milestones were found", want)
	}
	// Backfills again, then the nightly check of the days after.
	for i := 0; i < 3; i++ {
		_ = g.ctl.SetMilestonesDay(ctx, g.site, "")
		check(g.now)
	}
	check(g.now.AddDate(0, 0, 1))
	check(g.now.AddDate(0, 0, 2))
	if n := count(); n != want {
		t.Fatalf("the milestones went from %d to %d", want, n)
	}

	// The same milestones, asked for through overlapping periods.
	base := g.srv.URL + "/api/v1/sites/" + g.site
	days := map[string]string{} // family/step -> the day, as every period told it
	for _, q := range []string{"from=2026-09-01&to=2026-09-22", "from=2026-09-18&to=2026-09-20", "from=2026-09-17&to=2026-09-18", "from=2026-09-19&to=2026-09-22", "from=2026-09-01&to=2026-09-22"} {
		code, out := do(t, owner, "GET", base+"/moments?"+q+"&bucket=day&tz=UTC", "")
		if code != http.StatusOK {
			t.Fatalf("%s: %d", q, code)
		}
		seen := map[string]bool{}
		for _, m := range out["moments"].([]any) {
			m := m.(map[string]any)
			if m["kind"] != "milestone" {
				continue
			}
			key := m["family"].(string) + "/" + m["step"].(string)
			if seen[key] {
				t.Errorf("%s: %s is told twice: %v", q, key, out["moments"])
			}
			seen[key] = true
			if was, ok := days[key]; ok && was != m["t"] {
				t.Errorf("%s: %s is on %v here and on %s in another period", q, key, m["t"], was)
			}
			days[key] = m["t"].(string)
		}
	}
	if days["visitors/100"] != "2026-09-18T00:00" || days["countries/10"] != "2026-09-18T00:00" || days["pageviews/1"] != "2026-09-18T00:00" {
		t.Errorf("the first day's milestones: %v", days)
	}
	if days["pageviews/1000"] != "2026-09-20T00:00" {
		t.Errorf("1,000 pageviews: %v", days)
	}

	// The list the Timeline reads holds each once as well.
	list, err := g.ctl.Milestones(ctx, g.site, "")
	if err != nil {
		t.Fatal(err)
	}
	seen := map[[2]string]bool{}
	for _, m := range list {
		if k := [2]string{m.Kind, m.Step}; seen[k] {
			t.Errorf("%v is listed twice", k)
		} else {
			seen[k] = true
		}
	}
}
