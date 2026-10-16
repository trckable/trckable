package milestones

import (
	"fmt"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The words of the milestone email, which is a celebration: the headline, the
// one line of context and what comes next.
const (
	mailPassed     = "%s just passed %s 🎉"
	mailFirstView  = "%s just got its first pageview 🎉"
	mailFirstGoal  = "%s just reached its first goal 🎉"
	mailFirstSale  = "%s just made its first sale 🎉"
	mailRevenue    = "%s just passed a revenue milestone 🎉"
	mailBestDay    = "%s just had its best day yet 🎉"
	mailSince      = "It took %d %s from the first visit"
	mailReachedOn  = "Reached on %s"
	mailNext       = "Next up: %s"
	mailOpen       = "Open %s"
	mailOpenPlain  = "Open %s: %s"
	mailHeadlineNo = "milestone"
)

// Headline is the warm line of a milestone email: "librarialbas.al just
// passed 10,000 pageviews 🎉".
func (w Words) Headline(domain string) string {
	switch {
	case w.Kind == Pageviews && w.Big == words.first:
		return fmt.Sprintf(mailFirstView, domain)
	case w.Kind == Visitors, w.Kind == Pageviews, w.Kind == Countries:
		return fmt.Sprintf(mailPassed, domain, w.Line())
	case w.Kind == FirstGoal:
		return fmt.Sprintf(mailFirstGoal, domain)
	case w.Kind == FirstSale:
		return fmt.Sprintf(mailFirstSale, domain)
	case w.Kind == Revenue:
		return fmt.Sprintf(mailRevenue, domain)
	case w.Kind == RecordDay:
		return fmt.Sprintf(mailBestDay, domain)
	}
	return fmt.Sprintf(mailPassed, domain, mailHeadlineNo)
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

// nextStep is the step after m on its ladder, "" at the top or for a family
// without one (an amount of money is never named).
func nextStep(m sqlite.Milestone) string {
	if m.Kind != Visitors && m.Kind != Pageviews && m.Kind != Countries {
		return ""
	}
	for _, v := range Steps[m.Kind] {
		if v > m.Value {
			return fmt.Sprintf(mailNext, Number(v))
		}
	}
	return ""
}

// EmailCard dresses a milestone as the celebration email. list is the site's
// milestones, for the one line of context; baseURL is where the dashboard
// lives, empty for no button. Money is never named: an alert can go to a
// shared channel.
func EmailCard(m sqlite.Milestone, list []sqlite.Milestone, domain, baseURL string) *alerts.Card {
	w := Say(m, false)
	c := &alerts.Card{Headline: w.Headline(domain), Big: w.Big, Unit: w.Label, Next: nextStep(m)}
	if c.Sub = sinceFirst(m, list); c.Sub == "" {
		c.Sub = Context(m, list)
	}
	if c.Sub == "" {
		reached := m.Day
		if t, err := time.Parse(time.DateOnly, m.Day); err == nil {
			reached = t.Format("2 Jan 2006")
		}
		c.Sub = fmt.Sprintf(mailReachedOn, reached)
	}
	plain := []string{c.Headline, "", w.Line(), c.Sub}
	if c.Next != "" {
		plain = append(plain, c.Next)
	}
	if baseURL != "" {
		c.CTA, c.Link = fmt.Sprintf(mailOpen, domain), strings.TrimSuffix(baseURL, "/")+"/"+domain
		plain = append(plain, "", fmt.Sprintf(mailOpenPlain, domain, c.Link))
	}
	c.Plain = strings.Join(plain, "\n")
	return c
}
