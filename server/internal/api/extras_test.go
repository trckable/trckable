package api

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/moments"
	"github.com/trckable/trckable/server/internal/query"
)

// At most three rings, the strongest, one to a bucket, in time order; a spike
// that is also a burst of sales is one ring that says both.
func TestMarkersKeepTheStrongestThree(t *testing.T) {
	spikes := []moments.Moment{
		{T: "2026-09-03T00:00", Kind: "spike", Factor: 3.4, Referrer: "news.example"},
		{T: "2026-09-09T00:00", Kind: "spike", Factor: 9.1, Referrer: "forum.example"},
		{T: "2026-09-20T00:00", Kind: "spike", Factor: 3.1},
	}
	bursts := []Marker{
		{T: "2026-09-09T00:00", Kind: "sale", Factor: 4.5, Count: 9, Amount: 45000, Channel: "Search"},
		{T: "2026-09-15T00:00", Kind: "sale", Factor: 6, Count: 12, Amount: 30000, Channel: "Email"},
	}
	got := markersOf(spikes, bursts)
	if len(got) != MaxMarkers {
		t.Fatalf("got %+v", got)
	}
	// Strongest: the 9.1 spike (with its sales), the 6× burst, the 3.4 spike; the 3.1 spike is cut.
	if got[0].T != "2026-09-03T00:00" || got[1].T != "2026-09-09T00:00" || got[2].T != "2026-09-15T00:00" {
		t.Fatalf("time order: %+v", got)
	}
	if m := got[1]; m.Kind != "spike" || m.Referrer != "forum.example" || m.Count != 9 || m.Amount != 45000 || m.Channel != "Search" {
		t.Fatalf("one ring for both: %+v", m)
	}
	if got[2].Kind != "sale" || got[2].Channel != "Email" {
		t.Fatalf("burst: %+v", got[2])
	}
	if got := markersOf(nil, nil); len(got) != 0 {
		t.Fatalf("nothing to mark: %+v", got)
	}
}

// Sales bursts come from the period's buckets, only where the report has money.
func TestBurstsOfNeedMoney(t *testing.T) {
	res := &query.Result{Series: []query.Point{{T: "a"}, {T: "b"}, {T: "c"}, {T: "d"}, {T: "e"}, {T: "f"}}}
	res.Sales = []query.SaleBucket{{T: "a", Count: 1}, {T: "b", Count: 2}, {T: "c", Count: 2}, {T: "e", Count: 8, Amount: 9900, Channel: "AI"}}
	if got := burstsOf(res); got != nil {
		t.Fatalf("no money, no bursts: %+v", got)
	}
	res.Money = &query.Money{Currency: "USD", Exponent: 2}
	got := burstsOf(res)
	if len(got) != 1 || got[0].T != "e" || got[0].Factor != 4 || got[0].Count != 8 || got[0].Amount != 9900 || got[0].Channel != "AI" {
		t.Fatalf("got %+v", got)
	}
}

// A sale is read the way it is credited: the latest visit that came from
// somewhere, and only the visits before it.
func TestBuyerPath(t *testing.T) {
	at := func(d, h int) time.Time { return time.Date(2026, 9, d, h, 0, 0, 0, time.UTC) }
	paid := at(10, 12)
	j := &query.Journey{Visits: []query.JourneyVisit{
		{Start: at(10, 11), Channel: "Direct", Events: []query.JourneyEvent{{Kind: "pageview", Path: "/pricing"}, {Kind: "pageview", Path: "/checkout"}}}, // newest: Direct
		{Start: at(8, 9), Channel: "Search", Referrer: "google.com", Events: []query.JourneyEvent{
			{Kind: "pageview", Path: "/blog"}, {Kind: "pageview", Path: "/blog"}, {Kind: "goal", Goal: "signup"}, {Kind: "pageview", Path: "/pricing"}, {Kind: "pageview", Path: "/docs"}, {Kind: "pageview", Path: "/x"},
		}},
		{Start: at(1, 9), Channel: "Social"},
		{Start: at(11, 9), Channel: "Email"}, // after the payment: not part of it
	}}
	visits, first, pick := buyerOf(paid, j)
	if visits != 3 || !first.Equal(at(1, 9)) {
		t.Fatalf("visits %d first %v", visits, first)
	}
	if pick == nil || pick.Channel != "Search" {
		t.Fatalf("the Search visit earned it, not the Direct one: %+v", pick)
	}
	if got := strings.Join(pagesOf(pick), " "); got != "/blog /pricing /docs" {
		t.Fatalf("three pages, a goal is not one, a repeat is one: %q", got)
	}
	// With nothing but Direct, the latest is the one.
	_, _, pick = buyerOf(paid, &query.Journey{Visits: []query.JourneyVisit{{Start: at(9, 9), Channel: "Direct"}, {Start: at(3, 9), Channel: "Direct"}}})
	if pick == nil || !pick.Start.Equal(at(9, 9)) {
		t.Fatalf("got %+v", pick)
	}
}

// The new routes: nobody signed out, revenue-only reads are 404 while revenue
// is off, and a quiet site gets an empty list, not an error.
func TestExtrasRoutes(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	day := time.Now().UTC().Format("2006-01-02")
	q := "?from=" + day + "&to=" + day
	for _, path := range []string{"/insights", "/markers", "/buyers", "/report/pages-sell"} {
		if code, _, _ := get(t, client(), base+path+q); code != http.StatusUnauthorized {
			t.Fatalf("%s signed out: %d", path, code)
		}
	}
	code, _, body := get(t, owner, base+"/insights"+q)
	if code != http.StatusOK || !strings.Contains(body, `"insights":[]`) {
		t.Fatalf("insights: %d %s", code, body)
	}
	code, _, body = get(t, owner, base+"/markers"+q)
	if code != http.StatusOK || !strings.Contains(body, `"markers":[]`) || strings.Contains(body, "currency") {
		t.Fatalf("markers: %d %s", code, body)
	}
	if code, _, _ := get(t, owner, base+"/markers"+q+"&bucket=week"); code != http.StatusBadRequest {
		t.Fatalf("markers by the week: %d", code)
	}
	for _, path := range []string{"/buyers", "/report/pages-sell"} {
		if code, _, body := get(t, owner, base+path+q); code != http.StatusNotFound || !strings.Contains(body, "module is off") {
			t.Fatalf("%s with revenue off: %d %s", path, code, body)
		}
	}
	acc, _ := g.ctl.CreateAccount(context.Background())
	theirs, _ := g.ctl.CreateSite(context.Background(), acc, "theirs.com", "")
	if code, _, _ := get(t, owner, g.srv.URL+"/api/v1/sites/"+theirs+"/insights"); code != http.StatusNotFound {
		t.Fatalf("another account's site: %d", code)
	}
}
