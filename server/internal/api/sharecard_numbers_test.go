package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/query"
)

// A card's big number is the report's visitors for the same period, never another count: every preset, a custom
// range and all time (which begins at the first event, imported ones before the site's creation included), with
// the hour still running counted in the last 24 hours.
func TestCardNumberIsTheReportsVisitors(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	now := g.advance(0) // 2026-09-22 12:00 UTC
	n := uint64(0)
	visit := func(at time.Time, imported bool) {
		n++
		g.event(t, event.Event{Kind: event.KindPageview, EventID: n, Pageview: n, TS: at.UnixMilli(), Visitor: n, Path: "/", Imported: imported})
	}
	visit(now.Add(-20*time.Minute), false)  // the hour still running
	visit(now.Add(-2*time.Hour), false)     // today
	visit(now.Add(-30*time.Hour), false)    // yesterday, outside 24 hours
	visit(now.Add(-5*24*time.Hour), false)  // in 7 days
	visit(now.Add(-20*24*time.Hour), false) // in 30 days
	visit(now.Add(-80*24*time.Hour), true)  // imported, long before the site existed
	g.waitApplied(t, n)
	today := now.Format("2006-01-02")
	for _, c := range []struct {
		name, period, extra string
		want                int64
	}{
		{"24h", "24h", "", 2},
		{"7d", "7d", "", 4},
		{"30d", "30d", "", 5},
		{"all", "all", "", 6},
		{"custom", "custom", "&from=2026-08-30&to=" + today, 5},
	} {
		_, _, body := get(t, owner, g.srv.URL+"/api/v1/sites/"+g.site+"/card?format=json&period="+c.period+c.extra)
		var card struct {
			Big string `json:"big"`
		}
		if err := json.Unmarshal([]byte(body), &card); err != nil {
			t.Fatalf("%s: %v: %s", c.name, err, body)
		}
		if card.Big != fmt.Sprint(c.want) {
			t.Errorf("%s: card says %q, want %d", c.name, card.Big, c.want)
		}
		// The same count from the report, over the same window.
		q := url.Values{}
		switch c.period {
		case "24h":
			q.Set("from", "2026-09-21")
			q.Set("to", today)
			q.Set("bucket", "hour")
		case "7d":
			q.Set("from", "2026-09-16")
			q.Set("to", today)
		case "30d":
			q.Set("from", "2026-08-24")
			q.Set("to", today)
		case "all":
			q.Set("from", now.Add(-80*24*time.Hour).Format("2006-01-02"))
			q.Set("to", today)
		default:
			q.Set("from", "2026-08-30")
			q.Set("to", today)
		}
		if c.period == "24h" {
			continue // the report counts whole days; the 24 hours are told by the card's own window above
		}
		_, _, rb := get(t, owner, g.srv.URL+"/api/v1/sites/"+g.site+"/report?"+q.Encode())
		var rep struct {
			Current query.Result `json:"current"`
		}
		if err := json.Unmarshal([]byte(rb), &rep); err != nil {
			t.Fatalf("%s report: %v", c.name, err)
		}
		if rep.Current.KPIs.Visitors != c.want {
			t.Errorf("%s: report says %d, want %d", c.name, rep.Current.KPIs.Visitors, c.want)
		}
	}
}

// cardOf reads a card the way the route does, in the numbers it would draw.
func (g *rig) cardOf(t *testing.T, params string) cardNumbers {
	t.Helper()
	v, _ := url.ParseQuery(params)
	r := httptest.NewRequest("GET", "/api/v1/sites/"+g.site+"/card?"+params, nil)
	n, ok := g.api.cardRead(httptest.NewRecorder(), r, g.api.Query(), g.site, v, "overview")
	if !ok {
		t.Fatalf("card %s not read", params)
	}
	return n
}

// In a zone away from UTC, across the night the clocks go back, the card's days and its 24 hours are still the report's.
func TestCardNumberInAZoneAcrossAClockChange(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	si, _ := g.ctl.SiteInfo(context.Background(), g.site)
	if err := g.ctl.UpdateSite(context.Background(), g.site, si.Name, "America/New_York", si.Currency); err != nil {
		t.Fatal(err)
	}
	loc, _ := time.LoadLocation("America/New_York")
	now := g.advance(time.Date(2026, 11, 1, 17, 30, 0, 0, time.UTC).Sub(g.advance(0))) // 12:30 in New York, six hours after the clocks went back
	n := uint64(0)
	visit := func(at time.Time) {
		n++
		g.event(t, event.Event{Kind: event.KindPageview, EventID: n, Pageview: n, TS: at.UnixMilli(), Visitor: n, Path: "/"})
	}
	visit(now.Add(-20 * time.Minute))
	visit(now.Add(-23 * time.Hour))
	visit(now.Add(-25 * time.Hour)) // before the 24 hours, though inside the last 25 local hours
	visit(now.Add(-4 * 24 * time.Hour))
	g.waitApplied(t, n)

	if got := g.cardOf(t, "period=24h").Big; got != "2" {
		t.Errorf("24 hours across the clock change: %s, want 2", got)
	}
	from, to := last24Hours(now.In(loc))
	res, err := g.api.Query().Report(context.Background(), query.Params{Site: g.site, From: from.UTC(), To: to.UTC(), TZ: "America/New_York", Bucket: "hour", Limit: 10})
	if err != nil || res.KPIs.Visitors != 2 {
		t.Errorf("report over the same 24 hours: %v, %+v", err, res)
	}
	today := now.In(loc)
	for period, back := range map[string]int{"7d": 6, "30d": 29} {
		from := today.AddDate(0, 0, -back).Format("2006-01-02")
		_, _, rb := get(t, owner, g.srv.URL+"/api/v1/sites/"+g.site+"/report?from="+from+"&to="+today.Format("2006-01-02"))
		var rep struct {
			Current query.Result `json:"current"`
		}
		if err := json.Unmarshal([]byte(rb), &rep); err != nil {
			t.Fatal(err)
		}
		if got := g.cardOf(t, "period="+period).Big; got != fmt.Sprint(rep.Current.KPIs.Visitors) || rep.Current.KPIs.Visitors != 4 {
			t.Errorf("%s: card %s, report %d, want 4", period, got, rep.Current.KPIs.Visitors)
		}
	}
}

// Days brought in from another tool (counters, not events) before the site's own first event are part of all time.
func TestCardAllTimeBeginsAtImportedDays(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	now := g.advance(0)
	for _, d := range []string{"2026-06-01", "2026-06-02"} {
		if _, err := g.api.Query().DB.Exec(`INSERT INTO imported_daily VALUES (?, CAST(? AS DATE), 'total', '', 30, 20, 50)`, g.site, d); err != nil {
			t.Fatal(err)
		}
	}
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, Pageview: 1, TS: now.Add(-2 * time.Hour).UnixMilli(), Visitor: 1, Path: "/"})
	g.waitApplied(t, 1)
	n := g.cardOf(t, "period=all")
	_, _, rb := get(t, owner, g.srv.URL+"/api/v1/sites/"+g.site+"/report?from=2026-06-01&to="+now.Format("2006-01-02"))
	var rep struct {
		Current query.Result `json:"current"`
	}
	if err := json.Unmarshal([]byte(rb), &rep); err != nil {
		t.Fatal(err)
	}
	if rep.Current.KPIs.Visitors != 41 || n.Big != "41" || n.Foot != "Since Jun 2026" {
		t.Errorf("all time: card %s %q, report %d, want 41 since Jun 2026", n.Big, n.Foot, rep.Current.KPIs.Visitors)
	}
}

// A site that did not change reads no change early in the day, on 7 days and on 24 hours: the period still running is
// told against the same stretch of the one before, never against all of it.
func TestCardComparisonOfAFlatSiteIsFlat(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	now := g.advance(-3 * time.Hour) // 09:00
	n := uint64(0)
	for h := 0; h < 15*24; h++ {
		n++
		g.event(t, event.Event{Kind: event.KindPageview, EventID: n, Pageview: n, TS: now.Add(-time.Duration(h)*time.Hour - 10*time.Minute).UnixMilli(), Visitor: n, Path: "/"})
	}
	g.waitApplied(t, n)
	for _, period := range []string{"7d", "24h"} {
		c := g.cardOf(t, "period="+period+"&compare=1")
		if c.dir != 0 || c.change != "" {
			t.Errorf("%s of a flat site: %q (dir %d), want none", period, c.change, c.dir)
		}
	}
}
