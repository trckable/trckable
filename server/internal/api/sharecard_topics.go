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

// cardLists are the list pictures, by t: the breakdown they read and their title. "devices" shows each device's share.
var cardLists = map[string]struct {
	dim, title string
	percent    bool
}{
	"leaderboard": {dim: "entry_page", title: "Top pages"},
	"sources":     {dim: "referrer", title: "Top sources"},
	"places":      {dim: "country", title: "Top countries"},
	"browsers":    {dim: "browser", title: "Top browsers"},
	"devices":     {dim: "device", title: "Mobile and desktop", percent: true},
}

// cardHeroes are the single-item pictures, by t: the list whose first line they say, and the words before it.
var cardHeroes = map[string]struct{ list, label string }{
	"toppage":   {"leaderboard", "Your most visited page"},
	"topsource": {"sources", "Most visitors came from"},
	"topplace":  {"places", "Most visitors are in"},
}

// listsOf fills the top five of every list picture from the report.
func (n *cardNumbers) listsOf(res *query.Result) {
	n.lists = map[string][]cards.Item{}
	for t, l := range cardLists {
		rows := res.Dims[l.dim]
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
			if l.dim == "country" {
				name = countryName(r.Value)
			}
			if name == "" || rows[0].Visitors == 0 {
				continue
			}
			value := number(r.Visitors)
			if l.percent {
				value = fmt.Sprintf("%.0f%%", float64(r.Visitors)/float64(total)*100)
			}
			items = append(items, cards.Item{Name: name, Value: value, Share: float64(r.Visitors) / float64(rows[0].Visitors)})
		}
		n.lists[t] = items
	}
}

// pictureOf sets what the picture says on the spec: a list or hero from its items, and for every picture
// with nothing behind it the one line "Needs a visit in this period" (never a zero or a dash).
func (n *cardNumbers) pictureOf(spec *cards.Spec, t string) {
	if l, ok := cardLists[t]; ok {
		spec.Template, spec.Label, spec.Rows, spec.Big = "leaderboard", l.title, n.lists[t], cardWords.noVisits
		return
	}
	if h, ok := cardHeroes[t]; ok {
		spec.Template, spec.Label, spec.Big = "spotlight", h.label, cardWords.noVisits
		if items := n.lists[h.list]; len(items) > 0 {
			spec.Big = items[0].Name
		} else {
			spec.Label = ""
		}
		return
	}
	if d, ok := n.digests[t]; ok {
		spec.Template, spec.Label, spec.Rows, spec.Stats, spec.Big = "digest", d.title, d.rows, d.stats, d.empty
		spec.Change, spec.Dir, spec.Series = "", 0, nil
		return
	}
	if t == "milestone" {
		n.milestoneOf(spec)
		return
	}
	if (t == "overview" || t == "numbers") && !n.HasData && n.Metric != "revenue" {
		spec.Big, spec.Label, spec.Change, spec.Dir, spec.Series, spec.Stats = cardWords.noVisits, "", "", 0, nil, nil
	}
}

// milestoneOf makes the spec the milestone's own card (the spotlight, in its words and colours), on the format and
// look asked for; with no milestone in the period, the line that says so.
func (n *cardNumbers) milestoneOf(spec *cards.Spec) {
	spec.Template, spec.Change, spec.Dir, spec.Series, spec.Stats = "spotlight", "", 0, nil, nil
	if n.milestone == nil {
		spec.Big, spec.Label = cardWords.noMilestone, ""
		return
	}
	m := n.milestone.spec
	spec.Big, spec.Label, spec.Foot = m.Big, m.Label, m.Foot
	if n.milestone.money {
		spec.Accent = spec.Theme.Money
	}
}
