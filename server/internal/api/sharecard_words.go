package api

import (
	"fmt"
	"time"
)

// cardPeriod is what a card covers: one of the dialog's presets, a custom
// range or all time. A preset or custom period resolved by resolvePeriod covers
// the day (and hour) still running, as the dashboard does.
type cardPeriod struct {
	days, hours int
	label       string // the pill: real dates ("25 Oct – 23 Nov 2026"), or "Last 24 hours"
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
// (24h, 7d, 30d, 12mo), "all" (since the site's first data, first), "since" (from
// one day, a link's all time) or a custom from..to (two dates). The last day is today, the one still running, and the
// last hour the one running now, as on the dashboard, so a card never says
// less than the page; the presets' days are the share links' (sharePeriods),
// the one list. A custom range that reaches past today is cut back to it.
// compare is whether a comparison is asked for: all time has nothing before it.
func resolvePeriod(l *cardLang, name, fromS, toS string, now, first time.Time, compare bool) cardPeriod {
	vs := func(p cardPeriod) cardPeriod {
		if compare && p.days == 1 {
			p.vs = l.prevDay
		} else if compare {
			p.vs = fmt.Sprintf(l.prevDays, p.days)
		}
		return p
	}
	if name == "24h" {
		p := cardPeriod{days: 2, hours: 24, label: l.last24, post: l.post24}
		if compare {
			p.vs = l.prev24
		}
		return p
	}
	from, to, ok := periodDays(name, fromS, toS, now, first)
	if !ok {
		name = "7d"
		from, to, _ = periodDays(name, "", "", now, first)
	}
	p := cardPeriod{from: from, to: to, days: int(to.Sub(from).Hours()/24+0.5) + 1}
	switch name {
	case "all", "since":
		p.post = l.postAll
		p.label = fmt.Sprintf(l.since, l.shortDay(p.from, true))
		return p
	case "custom":
		p.label = l.datesLabel(p.from, p.to)
		p.post = fmt.Sprintf(l.postRange, p.label)
		return vs(p)
	case "12mo":
		p.label, p.post = l.datesLabel(p.from, p.to), l.post12
		return vs(p)
	}
	p.label = l.datesLabel(p.from, p.to)
	p.post = fmt.Sprintf(l.postDays, p.days)
	return vs(p)
}
