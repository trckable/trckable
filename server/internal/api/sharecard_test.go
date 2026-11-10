package api

import (
	"context"
	"image"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/cards"
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
	noOutbound(t, g)
	owner := client()
	g.setup(t, owner)
	card := g.srv.URL + "/api/v1/sites/" + g.site + "/card"
	for _, q := range []string{"", "?t=leaderboard&theme=light", "?t=overview&period=30d&accent=%22%2F%3E%3Cscript%3E", "?t=%3Cx%3E&metric=revenue&period=99d&accent=%23ff00zz"} {
		if code, ct, body := get(t, owner, card+q); code != http.StatusOK || ct != "image/png" || !strings.HasPrefix(body, "\x89PNG") {
			t.Fatalf("%s: %d %s", q, code, ct)
		}
	}
	for _, q := range []string{"?metric=engaged&stats=page,source,country", "?metric=pageviews&stats=bounce,<x>,visitors&theme=light"} {
		if code, ct, body := get(t, owner, card+q); code != http.StatusOK || ct != "image/png" || !strings.HasPrefix(body, "\x89PNG") {
			t.Fatalf("%s: %d %s", q, code, ct)
		}
	}
	if code, _, body := get(t, owner, card+"?format=json&metric=engaged"); code != http.StatusOK || !strings.Contains(body, `"metric":"engaged"`) {
		t.Fatalf("json engaged: %d %s", code, body)
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
	n.overview(res, &query.Result{KPIs: query.KPIs{Visitors: 100}}, "", noIcon)
	if n.change != "+12%" || n.dir != 1 || len(n.stats) != 3 {
		t.Fatalf("%+v", n)
	}
	if got := []string{n.stats[0].Value, n.stats[1].Value, n.stats[2].Value}; got[0] != "120" || got[1] != "3m 12s" || got[2] != "Germany" {
		t.Fatalf("stats: %v", got)
	}
	n = cardWordsOf(res, "example.com", cardPeriodOf("7d"), "")
	n.overview(res, &query.Result{KPIs: query.KPIs{Visitors: 200}}, "", noIcon)
	if n.change != "-44%" || n.dir != -1 {
		t.Fatalf("fall: %+v", n)
	}
	// Zero engaged visits and no time: those two are left off, the country stays.
	n = cardWordsOf(res, "example.com", cardPeriodOf("7d"), "")
	n.overview(&query.Result{KPIs: query.KPIs{Visitors: 5, Sessions: 5, BounceRate: 1}, Dims: res.Dims}, nil, "", noIcon)
	if len(n.stats) != 1 || n.stats[0].Label != "Top country" {
		t.Fatalf("zeros: %+v", n.stats)
	}
	// Nothing before it, nothing in it: no change and no numbers that are not true.
	n = cardWordsOf(&query.Result{}, "example.com", cardPeriodOf("7d"), "")
	n.overview(&query.Result{Dims: map[string][]query.Row{"country": {{Value: "ZZZ", Visitors: 3}}}}, nil, "", noIcon)
	if n.change != "" || n.dir != 0 || len(n.stats) != 0 {
		t.Fatalf("empty: %+v", n)
	}
}

// noOutbound keeps a test off the internet: the icon fetches go to a stand-in.
// A lookup runs in the background, so the real client comes back only once
// none is left.
func noOutbound(t *testing.T, g *rig) {
	t.Helper()
	var hits atomic.Int32
	srv := iconServer(t, &hits)
	old := refIconClient
	refIconClient = func() *http.Client { return toServer(srv, 2*time.Second) }
	t.Cleanup(func() {
		for range 200 {
			g.api.refIcons.mu.Lock()
			n := len(g.api.refIcons.pending)
			g.api.refIcons.mu.Unlock()
			if n == 0 {
				break
			}
			time.Sleep(20 * time.Millisecond)
		}
		refIconClient = old
	})
}

// The card's tile takes the owner's icon first, else the site's favicon; the
// card never waits for the fetch (the first one has the initial), and a site
// with no usable icon keeps the initial.
func TestCardIcon(t *testing.T) {
	g := newRig(t)
	noOutbound(t, g)
	ctx := context.Background()
	warm := func(host string) {
		t.Helper()
		for range 100 {
			if _, known := g.api.refIcons.get(host, g.api.Now()); known {
				return
			}
			time.Sleep(30 * time.Millisecond)
		}
		t.Fatalf("%s was never looked up", host)
	}
	if g.api.cardIcon(ctx, g.site, "icons.example.org") != nil {
		t.Fatal("the card waited for the fetch")
	}
	warm("icons.example.org")
	if img := g.api.cardIcon(ctx, g.site, "icons.example.org"); img == nil {
		t.Fatal("the favicon is not used")
	}
	g.api.cardIcon(ctx, g.site, "nope.example.org")
	warm("nope.example.org")
	for _, domain := range []string{"nope.example.org", "svg.example.org", "localhost", "127.0.0.1", ""} {
		if g.api.cardIcon(ctx, g.site, domain) != nil {
			t.Errorf("%q has no icon to draw", domain)
		}
	}
	// The owner's own icon wins, with no lookup at all.
	if err := g.ctl.SetBrandIcon(ctx, g.site, "image/png", onePixel); err != nil {
		t.Fatal(err)
	}
	if g.api.cardIcon(ctx, g.site, "nope.example.org") == nil {
		t.Fatal("the owner's icon is not used")
	}
}

func noIcon(string) image.Image { return nil }

// The picked stats: unknown ids, repeats and the card's own big number are
// left out, three at most, in the order asked; nothing usable is the default.
func TestCardStatsOf(t *testing.T) {
	for _, c := range []struct{ raw, metric, want string }{
		{"", "visitors", "engaged,avgtime,country"},
		{"nope,<x>,,", "visitors", "engaged,avgtime,country"},
		{"page,source,country,bounce", "visitors", "page,source,country"},
		{"page,page,visitors,source", "visitors", "page,source"},
		{"", "engaged", "avgtime,country"},
		{"pageviews", "pageviews", "engaged,avgtime,country"},
		{" bounce , page ", "revenue", "bounce,page"},
	} {
		if got := strings.Join(cardStatsOf(c.raw, c.metric), ","); got != c.want {
			t.Errorf("%q on %s: %s, want %s", c.raw, c.metric, got, c.want)
		}
	}
}

// Every metric is a card's big number with its own chart; an unknown one,
// and revenue without money, is visitors.
func TestCardMetrics(t *testing.T) {
	res := &query.Result{
		KPIs:   query.KPIs{Visitors: 100, Sessions: 80, Pageviews: 300, BounceRate: 0.25},
		Series: []query.Point{{Visitors: 10, Pageviews: 20, Bounce: 0.5}, {Visitors: 40, Pageviews: 90}},
		Money:  &query.Money{Currency: "USD", Exponent: 2, Revenue: 5000},
	}
	for metric, want := range map[string][3]string{
		"visitors": {"visitors", "100", "10,40"}, "pageviews": {"pageviews", "300", "20,90"},
		"engaged": {"engaged", "60", "5,40"}, "revenue": {"revenue", "$50", "0,0"}, "bogus": {"visitors", "100", "10,40"},
	} {
		n := cardWordsOf(res, "example.com", cardPeriodOf("7d"), metric)
		var series []string
		for _, v := range n.series {
			series = append(series, strconv.FormatFloat(v, 'f', -1, 64))
		}
		if n.Metric != want[0] || n.Big != want[1] || strings.Join(series, ",") != want[2] {
			t.Errorf("%s: %s %s %v", metric, n.Metric, n.Big, series)
		}
	}
	if n := cardWordsOf(res, "example.com", cardPeriodOf("7d"), "engaged"); n.Label != "engaged visits" || !strings.Contains(n.Post, "60 engaged visits") {
		t.Fatalf("%+v", n)
	}
}

// The small numbers follow the pick: page, source (with the icon the cache
// has), bounce and revenue, each only where it is true; the metric is never repeated.
func TestCardPickedStats(t *testing.T) {
	res := &query.Result{
		KPIs: query.KPIs{Visitors: 100, Sessions: 80, Pageviews: 300, BounceRate: 0.25, AvgSessionS: 30},
		Dims: map[string][]query.Row{
			"entry_page": {{Value: "/pricing", Visitors: 40}}, "referrer": {{Value: "news.example.org", Visitors: 30}},
			"country": {{Value: "DE", Visitors: 50}},
		},
		Money: &query.Money{Currency: "USD", Exponent: 2, Revenue: 5000},
	}
	icon := image.NewRGBA(image.Rect(0, 0, 2, 2))
	var asked string
	get := func(host string) image.Image { asked = host; return icon }
	n := cardWordsOf(res, "example.com", cardPeriodOf("7d"), "pageviews")
	n.overview(res, nil, "page,source,bounce", get)
	if len(n.stats) != 3 || n.stats[0].Value != "/pricing" || n.stats[1].Icon == nil || asked != "news.example.org" || n.stats[2].Value != "25%" {
		t.Fatalf("%+v", n.stats)
	}
	n = cardWordsOf(res, "example.com", cardPeriodOf("7d"), "visitors")
	n.overview(res, nil, "country,revenue,visitors", noIcon)
	if len(n.stats) != 2 || n.stats[0].Flag != "DE" || n.stats[1].Value != "$50" {
		t.Fatalf("%+v", n.stats)
	}
	// No money, no source, no page: those are left off.
	res.Money, res.Dims = nil, nil
	n = cardWordsOf(res, "example.com", cardPeriodOf("7d"), "visitors")
	n.overview(res, nil, "revenue,page,pageviews", noIcon)
	if len(n.stats) != 1 || n.stats[0].Label != "Pageviews" {
		t.Fatalf("%+v", n.stats)
	}
}

// A paid site may take trckable off its pictures; a locked one (the "Powered
// by" rule) cannot, in the picture or in what the server stores.
func TestCardBrandFollowsLookAndLock(t *testing.T) {
	g := newRig(t)
	noOutbound(t, g)
	owner := client()
	g.setup(t, owner)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	card := func() string { _, _, b := get(t, owner, base+"/card"); return b }
	card() // the first picture warms the site's icon: the next ones are the same
	branded := card()
	if code, l := do(t, owner, "PUT", base+"/share-look", `{"hide_brand":true}`, csrf, "1"); code != 200 || l["hide_brand"] != true || l["brand_locked"] != false {
		t.Fatalf("unlocked set: %d %v", code, l)
	}
	if card() == branded {
		t.Fatal("an unlocked site's choice did not change the picture")
	}
	g.api.PoweredBy = func(context.Context, string) bool { return true }
	if card() != branded {
		t.Fatal("a locked site's picture lost the brand")
	}
	if code, l := do(t, owner, "GET", base+"/share-look", ""); code != 200 || l["brand_locked"] != true {
		t.Fatalf("look: %d %v", code, l)
	}
	if code, l := do(t, owner, "PUT", base+"/share-look", `{"hide_brand":true}`, csrf, "1"); code != 200 || l["hide_brand"] != false {
		t.Fatalf("a locked site stored hide_brand: %d %v", code, l)
	}
	g.api.PoweredBy = nil
	if code, l := do(t, owner, "GET", base+"/share-look", ""); code != 200 || l["hide_brand"] != false {
		t.Fatalf("still stored: %v", l)
	}
}

// The card comes in the size asked for with shape, for each template; an
// unknown shape is the link preview.
func TestCardShapeSizes(t *testing.T) {
	g := newRig(t)
	noOutbound(t, g)
	owner := client()
	g.setup(t, owner)
	// Drawing a 1080x1920 picture under the race detector takes longer than the rig's 5 s.
	owner.Timeout = 60 * time.Second
	card := g.srv.URL + "/api/v1/sites/" + g.site + "/card"
	for shape, want := range map[string]image.Point{"": {1200, 630}, "link": {1200, 630}, "square": {1080, 1080}, "story": {1080, 1920}, "wide": {1600, 900}, "nope": {1200, 630}} {
		for _, tpl := range []string{"overview", "leaderboard"} {
			code, _, body := get(t, owner, card+"?t="+tpl+"&shape="+shape)
			if code != http.StatusOK {
				t.Fatalf("%s %s: %d", tpl, shape, code)
			}
			cfg, _, err := image.DecodeConfig(strings.NewReader(body))
			if err != nil || cfg.Width != want.X || cfg.Height != want.Y {
				t.Errorf("%s %s: %dx%d (%v), want %v", tpl, shape, cfg.Width, cfg.Height, err, want)
			}
		}
	}
}

// The grid holds the numbers that are true: nothing behind one leaves it out
// (never a dash), never money, and a busy period fills all four.
func TestCardGridModel(t *testing.T) {
	var n cardNumbers
	n.gridOf(&query.Result{}, func(string) image.Image { return nil })
	if len(n.grid) != 0 {
		t.Fatalf("no data: %+v", n.grid)
	}
	n.gridOf(&query.Result{KPIs: query.KPIs{Visitors: 3, Pageviews: 5}}, func(string) image.Image { return nil })
	if len(n.grid) != 2 || n.grid[0].Value != "3" || n.grid[1].Value != "5" {
		t.Fatalf("a little data: %+v", n.grid)
	}
	n = cardNumbers{}
	busy := &query.Result{KPIs: query.KPIs{Visitors: 1200, Pageviews: 3400, Sessions: 1500, BounceRate: 0.4, AvgSessionS: 134}}
	n = cardNumbers{money: "$9"}
	n.gridOf(busy, func(string) image.Image { return nil })
	got := []string{}
	for _, st := range n.grid {
		got = append(got, st.Label+"="+st.Value)
	}
	if want := "Visitors=1,200 Pageviews=3,400 Engaged visits=900 Avg time=2m 14s"; strings.Join(got, " ") != want {
		t.Errorf("busy: %v", got)
	}
}

// The grid's title follows the period; an unknown period is the week's.
func TestCardGridTitle(t *testing.T) {
	for in, want := range map[string]string{"30d": "This month in numbers", "24h": "Today in numbers", "all": "All time in numbers", "custom": "Your numbers", "nope": "This week in numbers"} {
		if got := cardWords.gridTitle[periodKey(in)]; got != want {
			t.Errorf("%s: %q", in, got)
		}
	}
}

// numbers and grid are drawn at every size, with and without a comparison.
func TestCardOverviewPictures(t *testing.T) {
	g := newRig(t)
	noOutbound(t, g)
	owner := client()
	g.setup(t, owner)
	card := g.srv.URL + "/api/v1/sites/" + g.site + "/card"
	for _, tpl := range []string{"numbers", "grid"} {
		for shape, want := range map[string]image.Point{"link": {1200, 630}, "square": {1080, 1080}, "story": {1080, 1920}, "wide": {1600, 900}} {
			code, ct, body := get(t, owner, card+"?t="+tpl+"&shape="+shape+"&compare=1&period=30d")
			if code != http.StatusOK || ct != "image/png" {
				t.Fatalf("%s %s: %d %s", tpl, shape, code, ct)
			}
			cfg, _, err := image.DecodeConfig(strings.NewReader(body))
			if err != nil || cfg.Width != want.X || cfg.Height != want.Y {
				t.Errorf("%s %s: %dx%d (%v)", tpl, shape, cfg.Width, cfg.Height, err)
			}
		}
	}
}

// A thumbnail is the same picture 360 px wide, and the full size is untouched.
func TestCardThumb(t *testing.T) {
	g := newRig(t)
	noOutbound(t, g)
	owner := client()
	g.setup(t, owner)
	card := g.srv.URL + "/api/v1/sites/" + g.site + "/card"
	for tpl, want := range map[string]image.Point{"overview": {360, 189}, "numbers": {360, 189}, "grid": {360, 189}, "leaderboard": {360, 189}} {
		code, _, body := get(t, owner, card+"?t="+tpl+"&thumb=1")
		cfg, _, err := image.DecodeConfig(strings.NewReader(body))
		if code != http.StatusOK || err != nil || cfg.Width != want.X || cfg.Height != want.Y {
			t.Errorf("%s: %d %dx%d (%v)", tpl, code, cfg.Width, cfg.Height, err)
		}
	}
	if _, _, body := get(t, owner, card+"?t=overview"); len(body) < 2000 {
		t.Fatal("the full picture is still drawn")
	}
}

// Each list picture holds the top five of its breakdown, a hero the first line, and a picture with nothing behind
// it says "Needs a visit in this period" instead of a zero or a dash.
func TestCardTopicModels(t *testing.T) {
	busy := &query.Result{KPIs: query.KPIs{Visitors: 100}, Dims: map[string][]query.Row{
		"referrer": {{Value: "google.com", Visitors: 60}, {Value: "x.com", Visitors: 30}, {Value: "a.com", Visitors: 5}, {Value: "b.com", Visitors: 3}, {Value: "c.com", Visitors: 2}, {Value: "d.com", Visitors: 1}},
		"country":  {{Value: "US", Visitors: 50}, {Value: "DE", Visitors: 50}, {Value: "ZZ", Visitors: 5}},
		"device":   {{Value: "Desktop", Visitors: 75}, {Value: "Mobile", Visitors: 25}},
		"browser":  {{Value: "Chrome", Visitors: 80}},
	}}
	var n cardNumbers
	n.listsOf(busy)
	if got := n.lists["sources"]; len(got) != cards.MaxRows || got[0].Name != "google.com" || got[0].Share != 1 || got[1].Share != 0.5 {
		t.Errorf("sources: %+v", got)
	}
	if got := n.lists["places"]; len(got) != 2 || got[0].Name == "US" {
		t.Errorf("places (names, unknown left out): %+v", got)
	}
	if got := n.lists["devices"]; len(got) != 2 || got[0].Value != "75%" || got[1].Value != "25%" {
		t.Errorf("devices: %+v", got)
	}
	var spec cards.Spec
	n.pictureOf(&spec, "topsource")
	if spec.Template != "spotlight" || spec.Big != "google.com" || spec.Label != "Most visitors came from" {
		t.Errorf("hero: %+v", spec)
	}
	spec = cards.Spec{}
	n.pictureOf(&spec, "browsers")
	if spec.Template != "leaderboard" || len(spec.Rows) != 1 || spec.Label != "Top browsers" {
		t.Errorf("browsers: %+v", spec)
	}

	// None: every picture says what it needs, none shows a zero or a dash.
	var none cardNumbers
	none.listsOf(&query.Result{})
	for _, tpl := range []string{"overview", "numbers", "leaderboard", "sources", "places", "browsers", "devices", "toppage", "topsource", "topplace"} {
		spec = cards.Spec{Big: "0", Rows: nil}
		none.pictureOf(&spec, tpl)
		if spec.Big != "Needs a visit in this period" || len(spec.Rows) != 0 || len(spec.Stats) != 0 {
			t.Errorf("%s with none: %+v", tpl, spec)
		}
	}

	// A little: one source is a list of one and a hero.
	var some cardNumbers
	some.listsOf(&query.Result{Dims: map[string][]query.Row{"referrer": {{Value: "google.com", Visitors: 1}}}})
	if len(some.lists["sources"]) != 1 || len(some.lists["places"]) != 0 {
		t.Errorf("partial: %+v", some.lists)
	}
}

// The new pictures, backgrounds, and the hidden name and date are drawn at the right size, as thumbnails too.
func TestCardTopicRoutes(t *testing.T) {
	g := newRig(t)
	noOutbound(t, g)
	owner := client()
	g.setup(t, owner)
	card := g.srv.URL + "/api/v1/sites/" + g.site + "/card"
	for _, tpl := range []string{"sources", "places", "browsers", "devices", "toppage", "topsource", "topplace"} {
		for shape, want := range map[string]image.Point{"link": {1200, 630}, "square": {1080, 1080}, "story": {1080, 1920}, "wide": {1600, 900}} {
			code, ct, body := get(t, owner, card+"?t="+tpl+"&shape="+shape+"&bg=grid&date=0&name=0")
			cfg, _, err := image.DecodeConfig(strings.NewReader(body))
			if code != http.StatusOK || ct != "image/png" || err != nil || cfg.Width != want.X || cfg.Height != want.Y {
				t.Errorf("%s %s: %d %s %dx%d (%v)", tpl, shape, code, ct, cfg.Width, cfg.Height, err)
			}
		}
		code, _, body := get(t, owner, card+"?t="+tpl+"&thumb=1&bg=solid")
		cfg, _, err := image.DecodeConfig(strings.NewReader(body))
		if code != http.StatusOK || err != nil || cfg.Width != 360 {
			t.Errorf("%s thumb: %d %d (%v)", tpl, code, cfg.Width, err)
		}
	}
	// A background is its own picture, not the cached gradient.
	_, _, a := get(t, owner, card+"?t=overview&thumb=1&bg=gradient")
	_, _, b := get(t, owner, card+"?t=overview&thumb=1&bg=grid")
	_, _, c := get(t, owner, card+"?t=overview&thumb=1&name=0&date=0")
	if a == b || a == c {
		t.Error("the look options do not change the picture")
	}
	if code, _, body := get(t, owner, card+"?format=json"); code != http.StatusOK || !strings.Contains(body, `"has_sources"`) {
		t.Errorf("json: %d %s", code, body)
	}
}
