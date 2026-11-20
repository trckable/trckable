package api

import (
	"fmt"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/query"
)

// The gallery's list and hero pictures read the report's own breakdowns (the
// ones the dashboard shows): no new numbers.
//
//	a list  is the top five of a breakdown with bars, drawn by the leaderboard.
//	a hero  is the first of a list, alone, drawn by the spotlight.

// cardLists are the list pictures, by t: the breakdown they read (their titles are the language's listTitle). "devices" shows each device's share.
var cardLists = map[string]struct {
	dim     string
	percent bool
}{
	"leaderboard": {dim: "entry_page"},
	"sources":     {dim: "referrer"},
	"places":      {dim: "country"},
	"browsers":    {dim: "browser"},
	"devices":     {dim: "device", percent: true},
}

// cardHeroes are the single-item pictures, by t: the list whose first line they say (the words before it are the language's heroLabel).
var cardHeroes = map[string]string{"toppage": "leaderboard", "topsource": "sources", "topplace": "places"}

// listsOf fills the top five of every list picture from the report.
func (n *cardNumbers) listsOf(res *query.Result) {
	l := n.l()
	n.lists = map[string][]cards.Item{}
	for t, list := range cardLists {
		rows := res.Dims[list.dim]
		var total int64
		for _, r := range rows {
			total += r.Visitors
		}
		var items []cards.Item
		for _, r := range rows {
			if len(items) == cards.MaxRows {
				break
			}
			name := r.Value
			if list.dim == "country" {
				name = countryName(l, r.Value)
			}
			if name == "" || rows[0].Visitors == 0 {
				continue
			}
			value := l.number(r.Visitors)
			if list.percent {
				value = fmt.Sprintf("%.0f%%", float64(r.Visitors)/float64(total)*100)
			}
			items = append(items, cards.Item{Name: name, Value: value, Share: float64(r.Visitors) / float64(rows[0].Visitors)})
		}
		n.lists[t] = items
	}
}

// vouchMoney puts the badge on a picture: the provider's, on one that shows revenue (the revenue metric, a revenue
// number card) when that provider vouches for all of it; otherwise Search Console's, when its connection works.
// The digests carry theirs from the pictures (vouchDigests).
func (n *cardNumbers) vouchMoney(spec *cards.Spec, t string) {
	shows := false
	switch t {
	case "overview", "numbers":
		shows = n.Metric == "revenue" || n.moneyStat
	case "grid":
		shows = n.moneyGrid
	}
	if _, ok := n.digests[t]; ok {
		return
	}
	switch {
	case shows && n.moneySource != "":
		spec.Badge, spec.Source = n.l().searchBadge, n.moneySource
	case n.gscSource != "":
		spec.Badge, spec.Source = n.l().searchBadge, n.gscSource
	}
}

// pictureOf sets what the picture says on the spec: a list or hero from its items, and for every picture
// with nothing behind it the one line "Needs a visit in this period" (never a zero or a dash).
func (n *cardNumbers) pictureOf(spec *cards.Spec, t string) {
	l := n.l()
	if _, ok := cardLists[t]; ok {
		spec.Template, spec.Label, spec.Rows, spec.Big = "leaderboard", l.listTitle[t], n.lists[t], l.noVisits
		return
	}
	if list, ok := cardHeroes[t]; ok {
		spec.Template, spec.Label, spec.Big = "spotlight", l.heroLabel[t], l.noVisits
		if items := n.lists[list]; len(items) > 0 {
			spec.Big = items[0].Name
		} else {
			spec.Label = ""
		}
		return
	}
	if d, ok := n.digests[t]; ok {
		spec.Template, spec.Label, spec.Rows, spec.Stats, spec.Big, spec.Badge, spec.Source = "digest", d.title, d.rows, d.stats, d.empty, d.badge, d.source
		spec.Change, spec.Dir, spec.Series = "", 0, nil
		return
	}
	if t == "milestone" {
		n.milestoneOf(spec)
		return
	}
	if (t == "overview" || t == "numbers") && !n.HasData && n.Metric != "revenue" {
		spec.Big, spec.Label, spec.Change, spec.Dir, spec.Series, spec.Stats = l.noVisits, "", "", 0, nil, nil
	}
}

// milestoneOf makes the spec the milestone's own card (the spotlight, in its words and colours), on the format and
// look asked for; with no milestone in the period, the line that says so.
func (n *cardNumbers) milestoneOf(spec *cards.Spec) {
	l := n.l()
	spec.Template, spec.Change, spec.Dir, spec.Series, spec.Stats = "spotlight", "", 0, nil, nil
	if n.milestone == nil {
		spec.Big, spec.Label = l.noMilestone, ""
		return
	}
	m := n.milestone.spec
	spec.Big, spec.Label, spec.Foot = m.Big, m.Label, m.Foot
	if n.milestone.money {
		spec.Accent = spec.Theme.Money
	}
}
