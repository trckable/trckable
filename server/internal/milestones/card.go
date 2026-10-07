package milestones

import (
	"fmt"
	"sort"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Card is a milestone's share card: the spotlight, with the number, what
// it is, the day and the site's domain. Nothing about visitors: no chart of
// them, no pages, no sources, no countries. Money is drawn in the money
// colour, and its amount only with showAmount; without it the hero says
// "Revenue milestone reached" and no digit of the amount is drawn. context
// is the growth line under the hero ("" when nothing true can be said).
func Card(m sqlite.Milestone, context, domain, theme string, showAmount bool) cards.Spec {
	w := Say(m, showAmount)
	_, th := cards.ThemeOf(theme)
	s := cards.Spec{Template: "spotlight", Theme: th, Domain: domain, Big: w.Big, Label: w.Label, Foot: w.Day}
	if Money(m.Kind) {
		s.Accent = th.Money
	}
	if m.Kind == Revenue {
		if showAmount {
			// "$1,000" over "revenue milestone": the number leads, the words say what it is.
			s.Label += " " + words.milestone
		} else {
			s.Big, s.Label = words.revenueReached, context
		}
	}
	return s
}

// Context is the one line of growth under a reached number, from the
// milestones already known: revenue says how long after the first sale, a
// family how much faster than its last step (twice as fast or more). Empty
// when nothing true can be said.
func Context(m sqlite.Milestone, list []sqlite.Milestone) string {
	if m.Kind == Revenue {
		for _, x := range list {
			if x.Kind == FirstSale {
				if d := daysBetween(x.Day, m.Day); d > 0 {
					unit := "days"
					if d == 1 {
						unit = "day"
					}
					return fmt.Sprintf("%d %s after the first sale", d, unit)
				}
				break
			}
		}
	}
	if m.Kind == FirstSale || m.Kind == FirstGoal {
		return ""
	}
	var earlier []sqlite.Milestone
	for _, x := range list {
		if x.Kind == m.Kind && x.Value < m.Value {
			earlier = append(earlier, x)
		}
	}
	if len(earlier) < 2 {
		return ""
	}
	sort.Slice(earlier, func(i, j int) bool { return earlier[i].Value > earlier[j].Value })
	now, then := daysBetween(earlier[0].Day, m.Day), daysBetween(earlier[1].Day, earlier[0].Day)
	if now <= 0 || then <= 0 || then/now < 2 {
		return ""
	}
	return fmt.Sprintf("%d× faster than the last one", then/now)
}
