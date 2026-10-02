package server

import (
	"fmt"
	"math"

	"github.com/trckable/trckable/server/internal/insights"
	"github.com/trckable/trckable/server/internal/query"
)

// How many of the week's findings the email carries. The dashboard's
// Highlights show up to four; an email is read in one glance.
const weeklyInsightLines = 3

// weeklyInsights are the few things about the week worth a line, from the
// rules in package insights (which has a floor on volume for every one: a quiet
// week says nothing). Money lines come only when payments are connected.
func weeklyInsights(cur, prev *query.Result) []string {
	in := insights.Input{
		Visitors: cur.KPIs.Visitors, Channels: cur.Dims["channel"], PrevChannels: prev.Dims["channel"],
		Pages: cur.Dims["entry_page"], PrevPages: prev.Dims["entry_page"],
		HasRevenue: cur.Money != nil && cur.Money.Payments > 0,
	}
	for _, n := range cur.NewReferrers {
		in.Newcomers = append(in.Newcomers, insights.Newcomer{Referrer: n.Referrer, Visitors: n.Visitors})
	}
	found := insights.Find(in)
	if len(found) > weeklyInsightLines {
		found = found[:weeklyInsightLines]
	}
	var out []string
	for _, i := range found {
		out = append(out, insightLine(i, cur.Money))
	}
	return out
}

// insightLine words one finding, the way the dashboard's Highlights do.
func insightLine(i insights.Insight, m *query.Money) string {
	name := i.Value
	switch i.Dim {
	case "channel":
		if n, ok := channelNames[i.Value]; ok {
			name = n
		}
	default:
		if name == "" {
			name = "/"
		}
	}
	switch i.Kind {
	case insights.SourceMove:
		dir := "up"
		if i.Change < 0 {
			dir = "down"
		}
		return fmt.Sprintf("%s %s %s · %s → %s visitors", name, dir, percent(math.Abs(i.Change)), number(i.Was), number(i.Now))
	case insights.TopRevenue:
		return fmt.Sprintf("%s earns %s a visitor, %.1f× the average", name, each(i.PerVisitor, m), i.Times)
	case insights.ConversionDrop:
		return fmt.Sprintf("%s converts %s, was %s", name, percent(i.Rate), percent(i.WasRate))
	}
	return fmt.Sprintf("New referrer: %s sent %s", name, plural(i.Now, "visitor"))
}

// percent keeps one decimal below ten percent, as the dashboard does.
func percent(x float64) string {
	if x > 0 && x < 0.1 {
		return fmt.Sprintf("%.1f%%", x*100)
	}
	return fmt.Sprintf("%.0f%%", x*100)
}

// each writes a small amount (minor units, a fraction of a unit is normal for
// money per visitor) with its decimals.
func each(minor float64, m *query.Money) string {
	exp, cur := 2, "USD"
	if m != nil {
		exp, cur = m.Exponent, m.Currency
	}
	sym := map[string]string{"USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥"}[cur]
	v := minor / math.Pow10(exp)
	if sym == "" {
		return fmt.Sprintf("%.2f %s", v, cur)
	}
	return fmt.Sprintf("%s%.2f", sym, v)
}

func plural(n int64, one string) string {
	if n == 1 {
		return "1 " + one
	}
	return number(n) + " " + one + "s"
}
