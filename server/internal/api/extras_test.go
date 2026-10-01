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

// While a period is still running its comparison stops at the same elapsed
// time: today at 09:00 is set against yesterday until 09:00, not all of it.
func TestFairPrevious(t *testing.T) {
	at := func(d, h int) time.Time { return time.Date(2026, 9, d, h, 0, 0, 0, time.UTC) }
	// Today, and it is 09:00.
	cur := query.Params{From: at(30, 0), To: at(31, 0)}
	got := fairPrevious(cur, at(30, 9))
	if !got.From.Equal(at(29, 0)) || !got.To.Equal(at(29, 9)) {
		t.Fatalf("today at 09:00 against yesterday until 09:00: %v to %v", got.From, got.To)
	}
	// A week still running: the week before, to the same moment of it.
	week := query.Params{From: at(24, 0), To: at(31, 0)}
	got = fairPrevious(week, at(30, 9))
	if !got.From.Equal(at(17, 0)) || !got.To.Equal(at(17, 0).Add(6*24*time.Hour+9*time.Hour)) {
		t.Fatalf("week so far: %v to %v", got.From, got.To)
	}
	// A period that is over: the whole period before.
	past := query.Params{From: at(20, 0), To: at(23, 0)}
	got = fairPrevious(past, at(30, 9))
	if !got.From.Equal(at(17, 0)) || !got.To.Equal(at(20, 0)) {
		t.Fatalf("a past period: %v to %v", got.From, got.To)
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
