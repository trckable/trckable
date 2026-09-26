package api

import (
	"context"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Deleting a site through the API leaves nothing of it in the analytics
// store, even for events that reach the write-ahead log after the delete
// (a request that checked the site a moment before it went), and another
// site's rows are untouched.
func TestDeletedSiteStaysEmpty(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	ctx := context.Background()
	other, err := g.ctl.CreateSite(ctx, sqlite.DefaultAccount, "other.com", "")
	if err != nil {
		t.Fatal(err)
	}
	base := g.now.Add(-time.Hour).UnixMilli()
	var id uint64
	add := func(site string, n int) {
		for i := 0; i < n; i++ {
			id++
			b, _ := (&event.Event{Site: site, Kind: event.KindPageview, EventID: id, Visitor: uint64(i%5 + 1), Path: "/", TS: base + int64(id)}).Marshal()
			if _, err := g.log.Append(ctx, b); err != nil {
				t.Fatal(err)
			}
		}
	}
	count := func(site string) int64 {
		var n int64
		if err := g.api.Query().DB.QueryRow(`SELECT count(*) FROM events WHERE site_id = ?`, site).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	add(g.site, 40)
	add(other, 40)
	g.waitApplied(t, 80)

	code, out := do(t, c, "DELETE", g.srv.URL+"/api/v1/sites/"+g.site, `{"domain":"site.com"}`, csrf, "1")
	if code != 200 || out["events"] != 40.0 {
		t.Fatalf("delete: %d %v", code, out)
	}
	add(g.site, 15)
	add(other, 15)
	g.waitApplied(t, 110)
	if n := count(g.site); n != 0 {
		t.Fatalf("the deleted site has %d rows again", n)
	}
	if n := count(other); n != 55 {
		t.Fatalf("the other site has %d rows, want 55", n)
	}
	if open, _ := g.w.OpenSessions(g.site); len(open) != 0 {
		t.Fatalf("%d open sessions kept for the deleted site", len(open))
	}
}
