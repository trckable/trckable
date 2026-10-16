package milestones

import (
	"fmt"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/mailkit"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The words of the milestone email, which is a celebration: the headline, the
// one line of context and what comes next.
const (
	mailCrossed    = "%s just passed %s 🎉"
	mailFirstView  = "%s just got its first pageview 🎉"
	mailFirstGoal  = "%s just reached its first goal 🎉"
	mailFirstSale  = "%s just made its first sale 🎉"
	mailRevenue    = "%s just passed a revenue milestone 🎉"
	mailBestDay    = "%s just had its best day yet 🎉"
	mailSince      = "It took %d %s from the first visit"
	mailReachedOn  = "Reached on %s"
	mailNext       = "Next up: %s"
	mailOpen       = "Open %s"
	mailWay        = "%d%% of the way"
	mailNote       = "You get this when a site reaches a milestone."
	mailHeadlineNo = "milestone"
)

// Headline is the warm line of a milestone email: "librarialbas.al just
// passed 10,000 pageviews 🎉".
func (w Words) Headline(domain string) string {
	switch {
	case w.Kind == Pageviews && w.Big == words.first:
		return fmt.Sprintf(mailFirstView, domain)
	case w.Kind == Visitors, w.Kind == Pageviews, w.Kind == Countries:
		return fmt.Sprintf(mailCrossed, domain, w.Line())
	case w.Kind == FirstGoal:
		return fmt.Sprintf(mailFirstGoal, domain)
	case w.Kind == FirstSale:
		return fmt.Sprintf(mailFirstSale, domain)
	case w.Kind == Revenue:
		return fmt.Sprintf(mailRevenue, domain)
	case w.Kind == RecordDay:
		return fmt.Sprintf(mailBestDay, domain)
	}
	return fmt.Sprintf(mailCrossed, domain, mailHeadlineNo)
}

// sinceFirst says how long a counted milestone took from the site's first
// pageview, when that day is known and not the same day.
func sinceFirst(m sqlite.Milestone, list []sqlite.Milestone) string {
	if m.Kind != Visitors && m.Kind != Pageviews && m.Kind != Countries {
		return ""
	}
	for _, x := range list {
		if x.Kind == Pageviews && x.Step == "1" {
			d := daysBetween(x.Day, m.Day)
			if d <= 0 {
				return ""
			}
			unit := "days"
			if d == 1 {
				unit = "day"
			}
			return fmt.Sprintf(mailSince, d, unit)
		}
	}
	return ""
}

// nextStep is the step after m on its ladder, 0 at the top or for a family
// without one (an amount of money is never named).
func nextStep(m sqlite.Milestone) float64 {
	if m.Kind != Visitors && m.Kind != Pageviews && m.Kind != Countries {
		return 0
	}
	for _, v := range Steps[m.Kind] {
		if v > m.Value {
			return v
		}
	}
	return 0
}

// Email dresses a milestone as the celebration email: the cheering ghost in
// its confetti, the warm headline, the number as the lime hero, one line of
// real context, the way to the next step, and one button. list is the site's
// milestones, for the context; baseURL is where the dashboard lives, empty
// for no button. Money is never named: an alert can go to a shared channel.
func Email(m sqlite.Milestone, list []sqlite.Milestone, domain, baseURL string) (headline string, e *mailkit.Email) {
	w := Say(m, false)
	headline = w.Headline(domain)
	sub := sinceFirst(m, list)
	if sub == "" {
		sub = Context(m, list)
	}
	if sub == "" {
		reached := m.Day
		if t, err := time.Parse(time.DateOnly, m.Day); err == nil {
			reached = t.Format("2 Jan 2006")
		}
		sub = fmt.Sprintf(mailReachedOn, reached)
	}
	e = &mailkit.Email{Preheader: sub, Foot: mailkit.Foot{Note: mailNote}}
	e.Blocks = []mailkit.Block{mailkit.Hero{Tone: mailkit.Celebrate, Picture: &mailkit.Cheer, Confetti: true, Headline: headline, Big: w.Big, Unit: w.Label, Line: sub}}
	if next := nextStep(m); next > 0 {
		e.Blocks = append(e.Blocks, mailkit.Progress{Label: fmt.Sprintf(mailNext, Number(next)), Note: fmt.Sprintf(mailWay, int(m.Value*100/next)), Value: m.Value, Of: next})
	}
	if baseURL != "" {
		e.Blocks = append(e.Blocks, mailkit.Button{Label: fmt.Sprintf(mailOpen, domain), URL: strings.TrimSuffix(baseURL, "/") + "/" + domain})
	}
	return headline, e
}
