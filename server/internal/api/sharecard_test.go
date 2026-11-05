package api

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/query"
)

// Revenue asked for where the report has none (module off, nothing
// connected) is visitors: the card and the post never carry money then.
func TestCardNeverSlipsInRevenue(t *testing.T) {
	res := &query.Result{KPIs: query.KPIs{Visitors: 1200, Pageviews: 3400}}
	n := cardWordsOf(res, "example.com", cardPeriodOf("7d"), "revenue")
	if n.Metric != "visitors" || n.Revenue || n.Big != "1,200" || n.money != "" {
		t.Fatalf("%+v", n)
	}
	if strings.Contains(n.Post, "$") || strings.Contains(n.Post, "revenue") {
		t.Fatalf("post: %s", n.Post)
	}
	// With money, revenue shows only when picked.
	res.Money = &query.Money{Currency: "USD", Exponent: 2, Revenue: 123456}
	if n := cardWordsOf(res, "example.com", cardPeriodOf("7d"), ""); n.Metric != "visitors" || strings.Contains(n.Post, "$") {
		t.Fatalf("default: %+v", n)
	}
	if n := cardWordsOf(res, "example.com", cardPeriodOf("7d"), "revenue"); n.Big != "$1,234" || !strings.Contains(n.Post, "$1,234 revenue") {
		t.Fatalf("revenue: %+v", n)
	}
}

// No visits: the post says so plainly, and a leaderboard has no lines.
func TestCardEmpty(t *testing.T) {
	n := cardWordsOf(&query.Result{Dims: map[string][]query.Row{"entry_page": {{Value: "/", Visitors: 0}}}}, "example.com", cardPeriodOf("24h"), "")
	if n.HasData || len(n.rows) != 0 || n.Big != "0" || !strings.Contains(n.Post, "counting has begun") {
		t.Fatalf("%+v", n)
	}
	if cardPeriodOf("nope").label != "Last 7 days" || cardTemplateOf("x") != "overview" || cardTemplateOf("leaderboard") != "leaderboard" {
		t.Fatal("defaults")
	}
}

// The card route over HTTP: a PNG for the site's reader, whatever the theme
// or accent says; no other account's site; nobody signed out.
func TestCardRoute(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	card := g.srv.URL + "/api/v1/sites/" + g.site + "/card"
	for _, q := range []string{"", "?t=leaderboard&theme=light", "?t=overview&period=30d&accent=%22%2F%3E%3Cscript%3E", "?t=%3Cx%3E&metric=revenue&period=99d&accent=%23ff00zz"} {
		if code, ct, body := get(t, owner, card+q); code != http.StatusOK || ct != "image/png" || !strings.HasPrefix(body, "\x89PNG") {
			t.Fatalf("%s: %d %s", q, code, ct)
		}
	}
	if code, _, body := get(t, owner, card+"?format=json&metric=revenue"); code != http.StatusOK || !strings.Contains(body, `"metric":"visitors"`) {
		t.Fatalf("json: %d %s", code, body)
	}
	if code, _, _ := get(t, client(), card); code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", code)
	}
	acc, _ := g.ctl.CreateAccount(context.Background())
	theirs, _ := g.ctl.CreateSite(context.Background(), acc, "theirs.com", "")
	if code, _, _ := get(t, owner, g.srv.URL+"/api/v1/sites/"+theirs+"/card"); code != http.StatusNotFound {
		t.Fatalf("another account's site: %d", code)
	}
}

// The overview card's small numbers: the change against the period before,
// engaged visits, average time and the top country, each only where it is true.
func TestCardOverview(t *testing.T) {
	res := &query.Result{
		KPIs: query.KPIs{Visitors: 112, Sessions: 200, BounceRate: 0.4, AvgSessionS: 192},
		Dims: map[string][]query.Row{"country": {{Value: "DE", Visitors: 60}}},
	}
	n := cardWordsOf(res, "example.com", cardPeriodOf("7d"), "")
	n.overview(res, &query.Result{KPIs: query.KPIs{Visitors: 100}})
	if n.change != "+12%" || n.dir != 1 || len(n.stats) != 3 {
		t.Fatalf("%+v", n)
	}
	if got := []string{n.stats[0].Value, n.stats[1].Value, n.stats[2].Value}; got[0] != "120" || got[1] != "3m 12s" || got[2] != "Germany" {
		t.Fatalf("stats: %v", got)
	}
	n = cardWordsOf(res, "example.com", cardPeriodOf("7d"), "")
	n.overview(res, &query.Result{KPIs: query.KPIs{Visitors: 200}})
	if n.change != "-44%" || n.dir != -1 {
		t.Fatalf("fall: %+v", n)
	}
	// Zero engaged visits and no time: those two are left off, the country stays.
	n = cardWordsOf(res, "example.com", cardPeriodOf("7d"), "")
	n.overview(&query.Result{KPIs: query.KPIs{Visitors: 5, Sessions: 5, BounceRate: 1}, Dims: res.Dims}, nil)
	if len(n.stats) != 1 || n.stats[0].Label != "Top country" {
		t.Fatalf("zeros: %+v", n.stats)
	}
	// Nothing before it, nothing in it: no change and no numbers that are not true.
	n = cardWordsOf(&query.Result{}, "example.com", cardPeriodOf("7d"), "")
	n.overview(&query.Result{Dims: map[string][]query.Row{"country": {{Value: "ZZZ", Visitors: 3}}}}, nil)
	if n.change != "" || n.dir != 0 || len(n.stats) != 0 {
		t.Fatalf("empty: %+v", n)
	}
}
