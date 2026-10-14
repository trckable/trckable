package api

import (
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// A tagged link and the site it names are one row, a plain visit is not a
// row, and the row carries the filter that finds its visits.
func TestLinksEndToEnd(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site

	refs := []string{"trustmrr", "trustmrr.com", "news.ycombinator.com"}
	for i, ref := range refs {
		g.event(t, event.Event{EventID: uint64(i + 1), Kind: event.KindPageview, TS: g.now.Add(-time.Hour).UnixMilli(),
			Visitor: uint64(i + 1), Pageview: uint64(i + 1), Path: "/", Channel: "Referral", RefHost: ref})
	}
	g.waitApplied(t, uint64(len(refs)))

	code, out := do(t, c, "GET", base+"/report/links?from=2026-09-22&to=2026-09-22", "")
	if code != 200 {
		t.Fatalf("links: %d %v", code, out)
	}
	rows, _ := out["links"].([]any)
	if len(rows) != 1 {
		t.Fatalf("one link expected: %v", rows)
	}
	row := rows[0].(map[string]any)
	if row["dim"] != "referrer" || row["value"] != "trustmrr.com" || row["visitors"] != 2.0 {
		t.Fatalf("row: %v", row)
	}
	if len(row["spark"].([]any)) != 30 {
		t.Fatalf("spark: %v", row["spark"])
	}
}
