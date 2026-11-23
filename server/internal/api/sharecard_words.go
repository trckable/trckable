package api

import (
	"fmt"
	"time"
)

// cardPeriod is what a card covers: one of the dialog's presets, a custom
// range or all time. A preset or custom period resolved by resolvePeriod ends
// on the last full day (or hour), never on the one still running.
type cardPeriod struct {
	days, hours int
	label       string // the pill: real dates, or "Last 24 hours"
	post        string // how the post says it, with its preposition ("in the last 7 days")
	vs          string // what a comparison is against ("previous 30 days"); "" when there is none to make
	// from and to are the first and last day covered, in the site's zone; set by resolvePeriod, not by the presets.
	from, to time.Time
}

func cardTemplateOf(s string) string {
	switch s {
	case "leaderboard", "numbers", "grid", "milestone", "bestday":
		return s
	}
	if _, ok := cardDigests[s]; ok {
		return s
	}
	if _, ok := cardLists[s]; ok {
		return s
	}
	if _, ok := cardHeroes[s]; ok {
		return s
	}
	return "overview"
}

// cardPost is a short text update: the picked number first, then the
// others that are not money (money only when it is the pick).
func cardPost(n cardNumbers, p cardPeriod) string {
	l := n.l()
	if !n.HasData && n.Metric != "revenue" {
		return fmt.Sprintf(l.postBegun, n.domain, l.counted)
	}
	head := fmt.Sprintf("%s %s", n.Big, n.Label)
	rest := fmt.Sprintf("%s %s", l.number(n.pageviews), l.pageviews)
	if n.Metric != "visitors" {
		rest = fmt.Sprintf("%s %s", l.number(n.visitors), l.visitors)
	}
	top := ""
	if len(n.rows) > 0 {
		top = " " + fmt.Sprintf(l.postTopPage, n.rows[0].Name)
	}
	return fmt.Sprintf("%s %s: %s, %s.%s %s", n.domain, p.post, head, rest, top, l.counted)
}

// resolvePeriod is the period the card asks for, at the site's now: a preset
// (24h, 7d, 30d), "all" (since the site began) or a custom from..to (two
// dates). The last day is yesterday, never the one still running, so a chart
// does not end in a dip; a custom range that reaches today is cut back to it.
// compare is whether a comparison is asked for: all time has nothing before it.
func resolvePeriod(l *cardLang, name, fromS, toS string, now, created time.Time, compare bool) cardPeriod {
	loc := now.Location()
	day := func(t time.Time) time.Time { return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc) }
	yesterday := day(now).AddDate(0, 0, -1)
	span := func(p cardPeriod, from, to time.Time) cardPeriod {
		if to.After(yesterday) {
			to = yesterday
		}
		if from.After(to) {
			from = to
		}
		p.from, p.to = from, to
		p.days = int(to.Sub(from).Hours()/24+0.5) + 1
		return p
	}
	vs := func(p cardPeriod) cardPeriod {
		if compare && p.days == 1 {
			p.vs = l.prevDay
		} else if compare {
			p.vs = fmt.Sprintf(l.prevDays, p.days)
		}
		return p
	}
	switch name {
	case "24h":
		p := cardPeriod{days: 2, hours: 24, label: l.last24, post: l.post24}
		if compare {
			p.vs = l.prev24
		}
		return p
	case "all":
		from := day(created.In(loc))
		p := span(cardPeriod{post: l.postAll}, from, yesterday)
		p.label = fmt.Sprintf(l.since, l.monthYear(p.from))
		return p
	case "custom":
		from, e1 := time.ParseInLocation("2006-01-02", fromS, loc)
		to, e2 := time.ParseInLocation("2006-01-02", toS, loc)
		if e1 == nil && e2 == nil && !from.After(to) && !from.After(yesterday) && to.Sub(from) < 20*366*24*time.Hour {
			p := span(cardPeriod{}, from, to)
			p.label = l.datesLabel(p.from, p.to)
			p.post = fmt.Sprintf(l.postRange, p.label)
			return vs(p)
		}
	}
	days := 7
	if name == "30d" {
		days = 30
	}
	p := span(cardPeriod{}, yesterday.AddDate(0, 0, 1-days), yesterday)
	p.label = l.datesLabel(p.from, p.to)
	p.post = fmt.Sprintf(l.postDays, days)
	return vs(p)
}
