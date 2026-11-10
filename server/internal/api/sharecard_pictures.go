package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/gsc"
	"github.com/trckable/trckable/server/internal/milestones"
	"github.com/trckable/trckable/server/internal/query"
)

// The gallery's report pictures, from the report the dashboard reads (no new numbers):
//
//	changed    the sentence of What changed, its four number cards and its three biggest changes
//	search     Google Search: clicks and impressions, the top three searches (Search Console, as the Search tab asks it)
//	ai         the visitors AI assistants sent, by assistant, and the mentions found in the period
//	goals      the goals reached most
//	sales      revenue and orders (only where the report shows money)
//	milestone  the biggest milestone reached in the period, as its own card says it
//
// Each is asked for only by its own t (the dialog's json asks for all, to know which the site can make).

// cardDigests are the pictures drawn by the digest template, by t.
var cardDigests = map[string]bool{"changed": true, "search": true, "ai": true, "goals": true, "sales": true}

// cardChangedIDs are the cards under the sentence: the four numbers of What changed (people, pageviews, time, bounce).
var cardChangedIDs = []string{"visitors", "pageviews", "avgtime", "bounce"}

// digest is one digest picture: its title, its cards and lines, and the line it says without them.
type digest struct {
	title string
	stats []cards.Stat
	rows  []cards.Item
	empty string
}

func (d digest) filled() bool { return len(d.stats) > 0 || len(d.rows) > 0 }

// milestoneLine is the milestone a period holds, as the card says it.
type milestoneLine struct {
	spec  cards.Spec
	money bool
}

// cardReading is what the pictures read from: the request, the period's report and the way it was asked.
type cardReading struct {
	r, ask *http.Request
	q      *query.Q
	res    *query.Result
	params query.Params
	loc    *time.Location
	site   string
	domain string
}

// pictures reads what the t asked for ("" is all of them, for the json) and says which the site can make.
func (a *API) pictures(c cardReading, n *cardNumbers, hours bool, kind string) {
	want := func(k string) bool { return kind == "" || kind == k }
	n.digests = map[string]digest{}
	if want("changed") {
		a.changedPicture(c, n, hours)
	}
	if want("search") {
		a.searchPicture(c, n)
	}
	if want("ai") {
		a.aiPicture(c, n)
	}
	if want("goals") {
		n.goalsPicture(c.res)
	}
	if want("sales") {
		n.salesPicture(c.res)
	}
	if want("milestone") {
		a.milestonePicture(c, n)
	}
}

func (a *API) changedPicture(c cardReading, n *cardNumbers, hours bool) {
	d := digest{title: cardWords.changedTitle, empty: cardWords.noChanged}
	defer func() { n.digests["changed"] = d }()
	prev := a.previousReport(c, hours, false)
	if prev == nil || prev.KPIs.Visitors == 0 || max(prev.KPIs.Visitors, c.res.KPIs.Visitors) < changedMinBase {
		return
	}
	n.HasChanged = true
	ch := explainChange(c.res, prev)
	d.title = ch.say
	for _, id := range cardChangedIDs {
		if st, ok := n.stat(id, c.res, a.refIconOf); ok {
			d.stats = append(d.stats, st)
		}
	}
	d.rows = changeRows(ch.causes)
}

// previousReport is the period just before, the same length (hours: the last 24 hours, so the 24 before them). light: only its totals, with no money, goals or groups to scan.
func (a *API) previousReport(c cardReading, hours, light bool) *query.Result {
	before := c.params
	before.From, before.To = previousStart(c.params.From, c.params.To, c.loc).UTC(), c.params.From
	if hours {
		before.From = c.params.From.Add(-c.params.To.Sub(c.params.From))
	}
	if light {
		before.Revenue, before.Goals, before.Groups, before.PageGoals, before.Limit = false, false, nil, nil, 1
	}
	got, err := a.cachedReport(c.ask, c.q, before)
	if err != nil {
		return nil
	}
	return got
}

func (a *API) searchPicture(c cardReading, n *cardNumbers) {
	d := digest{title: cardWords.searchTitle, empty: cardWords.noSearch}
	defer func() { n.digests["search"] = d }()
	if !a.moduleOn(c.r, c.site, "search") {
		return
	}
	conn, err := a.Ctl.SearchConsoleOf(c.r.Context(), c.site)
	if err != nil || conn.Property == "" {
		return
	}
	n.HasSearch = true
	from := startOfDay(c.params.From.In(c.loc), c.loc)
	last := startOfDay(c.params.To.In(c.loc), c.loc).AddDate(0, 0, -1) // the period's end is exclusive; Google's is not
	body, _, err := a.searchBody(c.r.Context(), c.site, conn, c.loc, gsc.Query{From: from, To: last, Dimension: "query", Limit: 100}, from, last)
	if err != nil {
		return
	}
	clicks, _ := body["clicks"].(float64)
	impressions, _ := body["impressions"].(float64)
	list, _ := body["rows"].([]gsc.Row)
	if impressions > 0 {
		d.stats = []cards.Stat{{Value: number(int64(clicks)), Label: cardWords.searchClicks}, {Value: number(int64(impressions)), Label: cardWords.searchImpressions}}
	}
	for _, row := range list[:min(len(list), cards.MaxDigestRows)] {
		if row.Key != "" && row.Clicks > 0 {
			d.rows = append(d.rows, cards.Item{Name: row.Key, Value: number(int64(row.Clicks)), Share: row.Clicks / list[0].Clicks})
		}
	}
}

func (a *API) aiPicture(c cardReading, n *cardNumbers) {
	d := digest{title: cardWords.aiTitle, empty: cardWords.noAI}
	defer func() { n.digests["ai"] = d }()
	if rep, err := c.q.AISearch(c.r.Context(), c.params, query.AIOptions{}); err == nil && (rep.Visitors > 0 || rep.Crawled > 0) {
		d.stats = aiHeadline(rep)
		for _, as := range rep.Assistants[:min(len(rep.Assistants), cards.MaxDigestRows)] {
			if as.Visitors > 0 {
				d.rows = append(d.rows, cards.Item{Name: as.Name, Value: number(as.Visitors), Share: float64(as.Visitors) / float64(rep.Assistants[0].Visitors)})
			}
		}
	}
	if a.MentionsOn && len(d.stats) < cards.MaxGrid {
		list, err := a.Ctl.Mentions(c.r.Context(), c.site, c.params.From.Unix(), c.params.To.Unix(), mentionsMax)
		if err == nil && len(list) > 0 {
			d.stats = append(d.stats, cards.Stat{Value: number(int64(len(list))), Label: cardWords.aiMentions})
		}
	}
	n.HasAI = d.filled()
}

// aiHeadline is the AI picture's number cards, the Explore headline's: the robots' requests, how many for each
// visitor, the busiest company and the visitors the assistants sent. With no robot data, only the visitors.
func aiHeadline(rep *query.AISearch) []cards.Stat {
	if rep.Crawled == 0 || len(rep.Companies) == 0 {
		return []cards.Stat{{Value: number(rep.Visitors), Label: cardWords.aiVisits}}
	}
	stats := []cards.Stat{{Value: shortCount(rep.Crawled), Label: cardWords.aiRequests}}
	if rep.PerVisitor > 0 {
		stats = append(stats, cards.Stat{Value: strconv.FormatFloat(rep.PerVisitor, 'f', 1, 64) + "×", Label: cardWords.aiPerVisitor})
	}
	top := rep.Companies[0]
	stats = append(stats, cards.Stat{Value: top.Name, Label: cardWords.aiTop + " · " + shortCount(top.Hits) + " " + cardWords.aiRequestsOf})
	return append(stats, cards.Stat{Value: number(rep.Visitors), Label: cardWords.aiVisits})
}

// shortCount says a large count briefly: 1.2M, 606K, 950.
func shortCount(n int64) string {
	switch {
	case n >= 10_000_000:
		return strconv.FormatInt(n/1_000_000, 10) + "M"
	case n >= 1_000_000:
		return strconv.FormatFloat(float64(n)/1_000_000, 'f', 2, 64) + "M"
	case n >= 10_000:
		return strconv.FormatInt(n/1000, 10) + "K"
	}
	return number(n)
}

// goalsPicture is the goals reached most, as the report lists them.
func (n *cardNumbers) goalsPicture(res *query.Result) {
	d := digest{title: cardWords.goalsTitle, empty: cardWords.noGoals}
	for _, g := range res.Goals {
		if g.Visitors <= 0 || len(d.rows) == cards.MaxRows {
			continue
		}
		name := g.Label
		if name == "" {
			name = g.Value
		}
		d.rows = append(d.rows, cards.Item{Name: name, Value: number(g.Visitors), Share: float64(g.Visitors) / float64(res.Goals[0].Visitors)})
	}
	n.HasGoals = d.filled()
	n.digests["goals"] = d
}

// salesPicture is the period's revenue and its orders, where the report has money at all.
func (n *cardNumbers) salesPicture(res *query.Result) {
	d := digest{title: cardWords.salesTitle, empty: cardWords.noSales}
	if res.Money != nil && res.Money.Payments > 0 {
		d.stats = []cards.Stat{{Value: n.money, Label: cardWords.salesRevenue}, {Value: number(res.Money.Payments), Label: cardWords.salesOrders}}
	}
	n.digests["sales"] = d
}

// milestonePicture is the biggest milestone found in the period, in the milestone card's own words. A money one
// never shows its amount here.
func (a *API) milestonePicture(c cardReading, n *cardNumbers) {
	list, _, err := a.visibleMilestones(c.r, c.site)
	if err != nil {
		return
	}
	first := c.params.From.In(c.loc).Format("2006-01-02")
	last := c.params.To.Add(-time.Nanosecond).In(c.loc).Format("2006-01-02")
	best := -1
	for i, m := range list {
		if m.Day >= first && m.Day <= last && (best < 0 || milestones.Bigger(m, list[best])) {
			best = i
		}
	}
	if best < 0 {
		return
	}
	m := list[best]
	spec := milestones.Card(m, milestones.Context(m, list), c.domain, "dark", false)
	n.HasMilestone = true
	n.milestone = &milestoneLine{spec: spec, money: milestones.Money(m.Kind)}
}
