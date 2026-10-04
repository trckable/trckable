package api

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/query"
)

// No money in the report (revenue hidden from this reader, the module off,
// nothing connected): no sale is a moment, whatever the buckets hold.
func TestMomentsNeverSlipInSales(t *testing.T) {
	res := &query.Result{Sales: []query.SaleBucket{{T: "2026-09-27T20:00", Count: 2, Amount: 4900, Channel: "Search"}}}
	if got := salesOf(res); len(got) != 0 {
		t.Fatalf("sales without money: %+v", got)
	}
	res.Money = &query.Money{Currency: "USD", Exponent: 2}
	if got := salesOf(res); len(got) != 1 || got[0].Amount != 4900 || got[0].Channel != "Search" || got[0].Kind != "sale" {
		t.Fatalf("got %+v", got)
	}
}

func TestBucketKey(t *testing.T) {
	if bucketKey("2026-09-27T20:00", "day") != "2026-09-27T00:00" || bucketKey("2026-09-27T20:00", "hour") != "2026-09-27T20:00" {
		t.Fatal("bucketKey")
	}
}

// The moments route over HTTP: the site's own notes come back as moments;
// only day and hour buckets; no other account's site; nobody signed out.
func TestMomentsRoute(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	ctx := context.Background()
	day := time.Now().UTC().Format("2006-01-02")
	if _, err := g.ctl.AddAnnotation(ctx, g.site, "", day, "Launched on the forum", false); err != nil {
		t.Fatal(err)
	}
	url := g.srv.URL + "/api/v1/sites/" + g.site + "/moments?from=" + day + "&to=" + day
	code, _, body := get(t, owner, url+"&bucket=hour")
	if code != http.StatusOK || !strings.Contains(body, `"kind":"note"`) || !strings.Contains(body, "Launched on the forum") {
		t.Fatalf("hour: %d %s", code, body)
	}
	if strings.Contains(body, `"kind":"sale"`) || strings.Contains(body, "currency") {
		t.Fatalf("no payments connected, no money: %s", body)
	}
	if code, _, _ := get(t, owner, url+"&bucket=week"); code != http.StatusBadRequest {
		t.Fatalf("week: %d", code)
	}
	if code, _, _ := get(t, client(), url+"&bucket=day"); code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", code)
	}
	acc, _ := g.ctl.CreateAccount(ctx)
	theirs, _ := g.ctl.CreateSite(ctx, acc, "theirs.com", "")
	if code, _, _ := get(t, owner, g.srv.URL+"/api/v1/sites/"+theirs+"/moments?bucket=day"); code != http.StatusNotFound {
		t.Fatalf("another account's site: %d", code)
	}
}

// A spike says how many visitors it held, and a new referrer says the day it
// first sent anyone: what the dashboard needs to put each on the right day of
// the chart and to leave out a day too small to be news.
func TestSpikesAndNewReferrersCarryTheirDays(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	var id uint64
	visit := func(day, hour int, v uint64, ref string) {
		id++
		at := time.Date(2026, 9, day, hour, 0, 0, 0, time.UTC).UnixMilli()
		g.event(t, event.Event{Kind: event.KindPageview, EventID: id, TS: at, Visitor: v, Pageview: id, Path: "/", RefHost: ref, FirstSeen: at})
	}
	// Two visitors a day for a week, then 25 in a day from a site that never sent anyone.
	for day := 10; day <= 16; day++ {
		visit(day, 9, uint64(day*100), "")
		visit(day, 10, uint64(day*100+1), "")
	}
	for v := uint64(0); v < 25; v++ {
		visit(17, 9, 9000+v, "news.example")
	}
	g.waitApplied(t, id)

	_, out := do(t, c, "GET", base+"/moments?from=2026-09-14&to=2026-09-18&bucket=day&tz=UTC", "")
	var spike map[string]any
	for _, m := range out["moments"].([]any) {
		if m := m.(map[string]any); m["kind"] == "spike" {
			spike = m
		}
	}
	if spike == nil || spike["t"] != "2026-09-17T00:00" || spike["visitors"] != 25.0 || spike["referrer"] != "news.example" {
		t.Fatalf("spike: %v", out["moments"])
	}
	// Two visitors a day is no usual to multiply: new traffic carries no factor.
	if f, has := spike["factor"]; has {
		t.Fatalf("a usual of two is new traffic, got factor %v", f)
	}

	_, out = do(t, c, "GET", base+"/insights?from=2026-09-14&to=2026-09-18&tz=UTC", "")
	found := out["insights"].([]any)
	if len(found) != 1 {
		t.Fatalf("insights: %v", found)
	}
	if i := found[0].(map[string]any); i["kind"] != "new_referrer" || i["value"] != "news.example" || i["since"] != "2026-09-17" {
		t.Fatalf("new referrer: %v", i)
	}
}
