package milestones

import (
	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Card is a milestone's share card: the spotlight, with the number, what
// it is, the day and the site's domain. Nothing about visitors: no chart of
// them, no pages, no sources, no countries. Money is drawn in the money
// colour, and its amount only with showAmount.
func Card(m sqlite.Milestone, domain, theme string, showAmount bool) cards.Spec {
	w := Say(m, showAmount)
	_, th := cards.ThemeOf(theme)
	s := cards.Spec{Template: "spotlight", Theme: th, Domain: domain, Big: w.Big, Label: w.Label, Foot: w.Day}
	if Money(m.Kind) {
		s.Accent = th.Money
	}
	return s
}
