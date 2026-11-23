package server

import (
	"fmt"
	"math"

	"github.com/trckable/trckable/server/internal/insights"
	"github.com/trckable/trckable/server/internal/moments"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/reports"
)

// How many of the week's findings the email carries. The dashboard's
// Highlights show up to four; an email is read in one glance.
const weeklyInsightLines = 3

// weeklyInsights are the few things about the week worth a line, from the
// rules in package insights (which has a floor on volume for every one: a quiet
// week says nothing). Money lines come only when payments are connected.
func weeklyInsights(w reports.Words, cur, prev *query.Result) []string {
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
		out = append(out, insightLine(w, i, cur.Money))
	}
	return out
}

// insightLine words one finding, the way the dashboard's Highlights do.
func insightLine(w reports.Words, i insights.Insight, m *query.Money) string {
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
		return fmt.Sprintf("%s %s %s · %s → %s visitors", name, dir, w.Say.Percent(math.Abs(i.Change)), w.Number(i.Was), w.Number(i.Now))
	case insights.TopRevenue:
		return fmt.Sprintf("%s earns %s a visitor, %s the average", name, each(w, i.PerVisitor, m), moments.Times(i.Times))
	case insights.ConversionDrop:
		return fmt.Sprintf("%s converts %s, was %s", name, w.Say.Percent(i.Rate), w.Say.Percent(i.WasRate))
	}
	return fmt.Sprintf("New referrer: %s sent %s", name, plural(w, i.Now, "visitor"))
}

// each writes a small amount (minor units, a fraction of a unit is normal for
// money per visitor) with its decimals.
func each(w reports.Words, minor float64, m *query.Money) string {
	exp, cur := 2, "USD"
	if m != nil {
		exp, cur = m.Exponent, m.Currency
	}
	return w.Say.MoneyFine(minor, cur, exp)
}

func plural(w reports.Words, n int64, one string) string {
	if n == 1 {
		return "1 " + one
	}
	return w.Number(n) + " " + one + "s"
}
