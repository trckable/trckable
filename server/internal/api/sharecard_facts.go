package api

import "github.com/trckable/trckable/server/internal/cards"

// cardFacts are what a card says, as the card's own words and numbers, for the dashboard to write a post from: it
// writes the sentences, never a number.
type cardFacts struct {
	Template string `json:"template"` // the card: overview, changed, bestday, milestone, sources, search, toppage, leaderboard...
	Domain   string `json:"domain"`
	Big      string `json:"big"`
	Label    string `json:"label"`
	Foot     string `json:"foot"` // the period's dates, or the day of a best day or milestone
	// Change is the overview's change against the period before ("+12%"), Dir its sign, Vs what it is against.
	Change string     `json:"change,omitempty"`
	Dir    int        `json:"dir,omitempty"`
	Vs     string     `json:"vs,omitempty"`
	Rows   []factItem `json:"rows,omitempty"`
	Stats  []factItem `json:"stats,omitempty"`
	// Empty is a card with nothing behind it: the post is the server's own line then.
	Empty bool `json:"empty,omitempty"`
}

type factItem struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

func itemsOf(rows []cards.Item) []factItem {
	var out []factItem
	for _, r := range rows {
		out = append(out, factItem{r.Name, r.Value})
	}
	return out
}

func statsOf(stats []cards.Stat) []factItem {
	var out []factItem
	for _, s := range stats {
		out = append(out, factItem{s.Label, s.Value})
	}
	return out
}

// overviewFacts are the people card's: the number, the dates, the change, and the top sources.
func (n cardNumbers) overviewFacts() *cardFacts {
	f := &cardFacts{
		Template: "overview", Domain: n.domain, Big: n.Big, Label: n.Label, Foot: n.Foot, Vs: n.vs,
		Rows: itemsOf(n.lists["sources"][:min(len(n.lists["sources"]), 3)]), Stats: statsOf(n.stats),
		Empty: !n.HasData && n.Metric != "revenue",
	}
	if n.dir != 0 {
		f.Change, f.Dir = n.pct, n.dir
	}
	return f
}

// factsOf are the facts of any other card, from the spec the picture is drawn from.
func (n cardNumbers) factsOf(spec cards.Spec, t string) *cardFacts {
	f := &cardFacts{Template: t, Domain: n.domain, Big: spec.Big, Label: spec.Label, Foot: spec.Foot, Rows: itemsOf(spec.Rows), Stats: statsOf(spec.Stats), Empty: n.empty(&spec, t)}
	if list, ok := cardHeroes[t]; ok {
		// A hero says the first of its list; its count is the second thing it can say.
		items := n.lists[list]
		f.Rows = itemsOf(items[:min(len(items), 1)])
		f.Empty = len(items) == 0
	}
	if _, ok := cardLists[t]; ok {
		f.Empty = len(spec.Rows) == 0
	}
	if d, ok := n.digests[t]; ok {
		f.Empty = !d.filled()
	}
	return f
}
