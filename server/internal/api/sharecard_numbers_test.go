package api

import (
	"encoding/json"
	"fmt"
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
