package api

import "fmt"

// The share card's words, in one place for when translations come.
var cardWords = struct {
	visitors, pageviews, revenue, topPages, noVisits, counted string
}{
	visitors:  "visitors",
	pageviews: "pageviews",
	revenue:   "revenue",
	topPages:  "Top pages",
	noVisits:  "No visits yet",
	counted:   "Counted with trckable",
}

// cardPeriod is one of the dialog's three periods.
type cardPeriod struct {
	days, hours int
	label       string
	post        string // how the post says it
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
	case "leaderboard", "dashboard":
		return s
	}
	return "spotlight"
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
