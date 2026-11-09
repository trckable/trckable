package api

import (
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/query"
)

func visitorsResult(total int64, dims map[string][]query.Row) *query.Result {
	return &query.Result{KPIs: query.KPIs{Visitors: total}, Dims: dims}
}

// What changed says what the dashboard says: the sentence, the cause that led, and the biggest changes with their sign.
func TestChangedSentence(t *testing.T) {
	cur := visitorsResult(300, map[string][]query.Row{"referrer": {{Value: "news.ycombinator.com", Visitors: 200}, {Value: "google.com", Visitors: 100}}})
	prev := visitorsResult(100, map[string][]query.Row{"referrer": {{Value: "google.com", Visitors: 90}, {Value: "news.ycombinator.com", Visitors: 10}}})
	ch := explainChange(cur, prev)
	if ch.say != "People rose 3×, mostly from news.ycombinator.com." {
		t.Fatalf("sentence: %q", ch.say)
	}
	rows := changeRows(biggestChanges(cur, prev))
	if len(rows) == 0 || rows[0].Name != "news.ycombinator.com" || rows[0].Value != "+190" || rows[0].Share != 1 {
		t.Fatalf("rows: %+v", rows)
	}

	fell := explainChange(visitorsResult(60, map[string][]query.Row{"country": {{Value: "DE", Visitors: 10}}}), visitorsResult(100, map[string][]query.Row{"country": {{Value: "DE", Visitors: 50}}}))
	if !strings.HasPrefix(fell.say, "People fell 40%, ") || !strings.Contains(fell.say, "Germany") {
		t.Fatalf("fall: %q", fell.say)
	}
	if got := explainChange(visitorsResult(100, nil), visitorsResult(102, nil)).say; got != cardWords.changedFlat {
		t.Fatalf("flat: %q", got)
	}
	if got := explainChange(visitorsResult(5, nil), visitorsResult(9, nil)).say; got != cardWords.changedFew {
		t.Fatalf("few: %q", got)
	}
	if got := explainChange(visitorsResult(50, nil), visitorsResult(0, nil)).say; got != "People are new this period." {
		t.Fatalf("new: %q", got)
	}
	if rows := changeRows(nil); len(rows) != 0 {
		t.Fatalf("no changes: %+v", rows)
	}
	if signed(-45) != "−45" || signed(1200) != "+1,200" {
		t.Fatalf("sign: %s %s", signed(-45), signed(1200))
	}
	if times(2.46) != "2.5×" || times(40.4) != "40×" || times(900) != "100×" {
		t.Fatalf("times: %s %s %s", times(2.46), times(40.4), times(900))
	}
}

// The goals and sales pictures keep to what the report holds, and say a plain line with nothing behind them.
func TestGoalsAndSalesPictures(t *testing.T) {
	n := cardNumbers{digests: map[string]digest{}}
	n.goalsPicture(&query.Result{Goals: []query.Row{{Value: "signup", Label: "Signed up", Visitors: 40}, {Value: "buy", Visitors: 10}, {Value: "none", Visitors: 0}}})
	g := n.digests["goals"]
	if !n.HasGoals || len(g.rows) != 2 || g.rows[0].Name != "Signed up" || g.rows[0].Value != "40" || g.rows[1].Name != "buy" || g.rows[1].Share != 0.25 {
		t.Fatalf("goals: %+v", g)
	}
	n = cardNumbers{digests: map[string]digest{}}
	n.goalsPicture(&query.Result{})
	if n.HasGoals || n.digests["goals"].filled() || n.digests["goals"].empty == "" {
		t.Fatalf("no goals: %+v", n.digests["goals"])
	}

	res := &query.Result{Money: &query.Money{Currency: "USD", Exponent: 2, Revenue: 123456, Payments: 3}}
	n = cardWordsOf(res, "example.com", cardPeriodOf("7d"), "")
	n.digests = map[string]digest{}
	n.salesPicture(res)
	if s := n.digests["sales"]; len(s.stats) != 2 || s.stats[0].Value != "$1,234" || s.stats[1].Value != "3" {
		t.Fatalf("sales: %+v", s)
	}
	// No money in the report (a role that cannot see it, or nothing connected) is no number at all.
	none := &query.Result{}
	n = cardWordsOf(none, "example.com", cardPeriodOf("7d"), "")
	n.digests = map[string]digest{}
	n.salesPicture(none)
	if s := n.digests["sales"]; s.filled() || strings.ContainsAny(s.empty+s.title, "$0123456789") {
		t.Fatalf("no money: %+v", s)
	}
}

// A digest fills the spec; a milestone is the spotlight in the milestone card's words; with none, a line.
func TestPictureOfNewTopics(t *testing.T) {
	n := cardNumbers{digests: map[string]digest{"goals": {title: "Top goals", rows: []cards.Item{{Name: "a", Value: "1", Share: 1}}, empty: "none"}}}
	spec := cards.Spec{Change: "+1%", Dir: 1, Series: []float64{1, 2}}
	n.pictureOf(&spec, "goals")
	if spec.Template != "digest" || spec.Label != "Top goals" || len(spec.Rows) != 1 || spec.Change != "" || spec.Series != nil {
		t.Fatalf("%+v", spec)
	}
	spec = cards.Spec{Label: "x", Foot: "Last 7 days"}
	n.pictureOf(&spec, "milestone")
	if spec.Template != "spotlight" || spec.Big != cardWords.noMilestone || spec.Label != "" {
		t.Fatalf("none: %+v", spec)
	}
	n.milestone = &milestoneLine{spec: cards.Spec{Big: "10,000", Label: "visitors", Foot: "Sep 21, 2026"}}
	spec = cards.Spec{Foot: "Last 30 days", Theme: cards.Themes["dark"]}
	n.pictureOf(&spec, "milestone")
	if spec.Big != "10,000" || spec.Label != "visitors" || spec.Foot != "Sep 21, 2026" || spec.Accent != "" {
		t.Fatalf("milestone: %+v", spec)
	}
	for _, id := range []string{"changed", "search", "ai", "goals", "sales", "milestone"} {
		if cardTemplateOf(id) != id {
			t.Errorf("%s is not a picture", id)
		}
	}
}

// The new pictures over HTTP: a PNG of the asked size on a site with nothing to say, and the json says which the site can make.
func TestCardRouteNewPictures(t *testing.T) {
	g := newRig(t)
	noOutbound(t, g)
	owner := client()
	g.setup(t, owner)
	card := g.srv.URL + "/api/v1/sites/" + g.site + "/card"
	for _, tpl := range []string{"changed", "search", "ai", "goals", "sales", "milestone"} {
		for _, shape := range []string{"link", "story"} {
			if code, ct, body := get(t, owner, card+"?t="+tpl+"&shape="+shape+"&period=30d"); code != 200 || ct != "image/png" || !strings.HasPrefix(body, "\x89PNG") {
				t.Fatalf("%s %s: %d %s", tpl, shape, code, ct)
			}
		}
	}
	code, _, body := get(t, owner, card+"?format=json&period=30d")
	if code != 200 {
		t.Fatalf("json: %d", code)
	}
	for _, key := range []string{"has_changed", "has_search", "has_ai", "has_goals", "has_milestone"} {
		if !strings.Contains(body, `"`+key+`":`) {
			t.Errorf("json lacks %s: %s", key, body)
		}
	}
	if code, _, body := get(t, owner, card+"?format=json&t=goals&period=30d"); code != 200 || !strings.Contains(body, "No goals reached in this period") {
		t.Errorf("a goals post says its picture's line: %d %s", code, body)
	}
	if strings.Contains(body, `"has_search":true`) {
		t.Errorf("Search Console is not connected: %s", body)
	}
}

// A post says what its picture says, in its words: a digest's title, cards and lines, a milestone's number first,
// a hero's words first, and the plain line for a picture with nothing behind it.
func TestSpecPost(t *testing.T) {
	n := cardNumbers{domain: "example.com", said: "the last 30 days"}
	digest := cards.Spec{Template: "digest", Label: "Top goals", Rows: []cards.Item{{Name: "Signed up", Value: "40"}, {Name: "buy", Value: "10"}}}
	if got := specPost(digest, "goals", n); got != "example.com in the last 30 days: Top goals. Signed up 40, buy 10. Counted with trckable" {
		t.Fatalf("goals: %q", got)
	}
	sales := cards.Spec{Template: "digest", Label: "Sales", Stats: []cards.Stat{{Value: "$1,234", Label: "Revenue"}, {Value: "3", Label: "Orders"}}}
	if got := specPost(sales, "sales", n); !strings.Contains(got, "$1,234 Revenue, 3 Orders.") {
		t.Fatalf("sales: %q", got)
	}
	if got := specPost(cards.Spec{Template: "digest", Label: "Sales", Big: cardWords.noSales}, "sales", n); got != "example.com: No sales in this period. Counted with trckable" {
		t.Fatalf("no sales: %q", got)
	}
	if got := specPost(cards.Spec{Template: "spotlight", Big: "10,000", Label: "visitors"}, "milestone", n); got != "example.com: 10,000 visitors. Counted with trckable" {
		t.Fatalf("milestone: %q", got)
	}
	if got := specPost(cards.Spec{Template: "spotlight", Big: "Google", Label: "Most visitors came from"}, "topsource", n); got != "example.com: Most visitors came from Google. Counted with trckable" {
		t.Fatalf("hero: %q", got)
	}
}
