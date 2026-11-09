package api

import (
	"fmt"
	"time"
)

// The share card's words, in one place for when translations come.
var cardWords = struct {
	visitors, pageviews, revenue, topPages, noVisits, counted string
	engaged, avgTime, topCountry                              string
	engagedVisits, statPageviews, statVisitors, bounce        string
	topPage, topSource, statRevenue                           string
	gridTitle                                                 map[string]string // by period
}{
	visitors:   "visitors",
	pageviews:  "pageviews",
	revenue:    "revenue",
	topPages:   "Top pages",
	noVisits:   "No visits yet",
	counted:    "Counted with trckable",
	engaged:    "Engaged visits",
	avgTime:    "Avg time",
	topCountry: "Top country",

	engagedVisits: "engaged visits",
	statPageviews: "Pageviews",
	statVisitors:  "Visitors",
	bounce:        "Bounce rate",
	topPage:       "Top page",
	topSource:     "Top source",
	statRevenue:   "Revenue",
	gridTitle:     map[string]string{"24h": "Today in numbers", "7d": "This week in numbers", "30d": "This month in numbers", "all": "All time in numbers", "custom": "Your numbers"},
}

// cardPeriod is what a card covers: one of the dialog's presets, a custom
// range or all time. A preset or custom period resolved by resolvePeriod ends
// on the last full day (or hour), never on the one still running.
type cardPeriod struct {
	days, hours int
	label       string // the pill: real dates, or "Last 24 hours"
	post        string // how the post says it
	vs          string // what a comparison is against ("previous 30 days"); "" when there is none to make
	// from and to are the first and last day covered, in the site's zone; set by resolvePeriod, not by the presets.
	from, to time.Time
}

var cardPeriods = map[string]cardPeriod{
	"24h": {days: 2, hours: 24, label: "Last 24 hours", post: "the last 24 hours"},
	"7d":  {days: 7, label: "Last 7 days", post: "the last 7 days"},
	"30d": {days: 30, label: "Last 30 days", post: "the last 30 days"},
}

func cardPeriodOf(s string) cardPeriod {
	if p, ok := cardPeriods[s]; ok {
		return p
	}
	return cardPeriods["7d"]
}

func cardTemplateOf(s string) string {
	switch s {
	case "leaderboard", "numbers", "grid":
		return s
	}
	return "overview"
}

// cardPost is a short text update: the picked number first, then the
// others that are not money (money only when it is the pick).
func cardPost(n cardNumbers, p cardPeriod) string {
	if !n.HasData && n.Metric != "revenue" {
		return fmt.Sprintf("%s: counting has begun. %s", n.domain, cardWords.counted)
	}
	head := fmt.Sprintf("%s %s", n.Big, n.Label)
	rest := fmt.Sprintf("%s %s", number(n.pageviews), cardWords.pageviews)
	if n.Metric != "visitors" {
		rest = fmt.Sprintf("%s %s", number(n.visitors), cardWords.visitors)
	}
	top := ""
	if len(n.rows) > 0 {
		top = fmt.Sprintf(" Top page: %s.", n.rows[0].Name)
	}
	return fmt.Sprintf("%s in %s: %s, %s.%s %s", n.domain, p.post, head, rest, top, cardWords.counted)
}

// shortDay is a day as the pill writes it: "9 Oct", with the year when asked.
func shortDay(d time.Time, year bool) string {
	if year {
		return d.Format("2 Jan 2006")
	}
	return d.Format("2 Jan")
}

// datesLabel is a run of days in words: "9 Oct – 8 Nov 2026", the year said
// once when both ends are in it, and a single day on its own.
func datesLabel(from, to time.Time) string {
	switch {
	case from.Equal(to):
		return shortDay(to, true)
	case from.Year() == to.Year():
		return shortDay(from, false) + " – " + shortDay(to, true)
	}
	return shortDay(from, true) + " – " + shortDay(to, true)
}

// resolvePeriod is the period the card asks for, at the site's now: a preset
// (24h, 7d, 30d), "all" (since the site began) or a custom from..to (two
// dates). The last day is yesterday, never the one still running, so a chart
// does not end in a dip; a custom range that reaches today is cut back to it.
// compare is whether a comparison is asked for: all time has nothing before it.
func resolvePeriod(name, fromS, toS string, now, created time.Time, compare bool) cardPeriod {
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
			p.vs = "previous day"
		} else if compare {
			p.vs = fmt.Sprintf("previous %d days", p.days)
		}
		return p
	}
	switch name {
	case "24h":
		p := cardPeriods["24h"]
		if compare {
			p.vs = "previous 24 hours"
		}
		return p
	case "all":
		from := day(created.In(loc))
		p := span(cardPeriod{post: "all time"}, from, yesterday)
		p.label = "Since " + p.from.Format("Jan 2006")
		return p
	case "custom":
		from, e1 := time.ParseInLocation("2006-01-02", fromS, loc)
		to, e2 := time.ParseInLocation("2006-01-02", toS, loc)
		if e1 == nil && e2 == nil && !from.After(to) && !from.After(yesterday) && to.Sub(from) < 20*366*24*time.Hour {
			p := span(cardPeriod{}, from, to)
			p.label = datesLabel(p.from, p.to)
			p.post = p.label
			return vs(p)
		}
	}
	days := 7
	if name == "30d" {
		days = 30
	}
	p := span(cardPeriod{}, yesterday.AddDate(0, 0, 1-days), yesterday)
	p.label = datesLabel(p.from, p.to)
	p.post = fmt.Sprintf("the last %d days", days)
	return vs(p)
}
