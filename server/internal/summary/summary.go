package summary

import "github.com/trckable/trckable/server/internal/query"

// TopN is how many rows of a list a summary carries. A caller that shows
// fewer slices it; none shows more, so a list is the same list everywhere.
const TopN = 5

// Count is one number against the period before.
type Count struct {
	Now, Prev int64
	Move      Move
}

func count(now, prev int64) Count {
	return Count{Now: now, Prev: prev, Move: Delta(float64(now), float64(prev))}
}

// Row is one line of a top list.
type Row struct {
	Name     string // the value as the data has it (a goal: its name)
	Visitors int64
}

// Money is the period's revenue, when payments are connected and any came.
type Money struct {
	Revenue  Count // minor units
	Payments int64
	Currency string
	Exponent int
	HasPrev  bool // the period before had payments connected, so the revenue change is true
}

// AI is what AI did in the period: the people its assistants sent, and the
// hits its crawlers made (answering and training).
type AI struct{ People, Crawls int64 }

// Summary is one period against the one before it, read once from the
// reports' results.
type Summary struct {
	People      Count
	Pageviews   Count
	BounceRate  float64 // 0..1
	AvgSessionS float64
	Sources     []Row // by channel
	Pages       []Row // entry pages
	Countries   []Row
	Goals       []Row
	Money       *Money
	AI          AI
	Busiest     string // the busiest moment, already worded; empty when none
}

// Build reads the headline numbers and the top lists out of a period's
// result and the one before it (prev may be nil: then every change is new).
func Build(cur, prev *query.Result) Summary {
	if prev == nil {
		prev = &query.Result{}
	}
	s := Summary{
		People:      count(cur.KPIs.Visitors, prev.KPIs.Visitors),
		Pageviews:   count(cur.KPIs.Pageviews, prev.KPIs.Pageviews),
		BounceRate:  cur.KPIs.BounceRate,
		AvgSessionS: cur.KPIs.AvgSessionS,
		Sources:     rows(cur.Dims["channel"]),
		Pages:       rows(cur.Dims["entry_page"]),
		Countries:   rows(cur.Dims["country"]),
		Goals:       goals(cur.Goals),
	}
	for _, r := range cur.Dims["channel"] {
		if r.Value == "AI" {
			s.AI.People = r.Visitors
		}
	}
	if m := cur.Money; m != nil && m.Payments > 0 {
		var was int64
		if prev.Money != nil {
			was = prev.Money.Revenue
		}
		s.Money = &Money{Revenue: count(m.Revenue, was), Payments: m.Payments, Currency: m.Currency, Exponent: m.Exponent, HasPrev: prev.Money != nil}
	}
	return s
}

func rows(rs []query.Row) []Row {
	out := make([]Row, 0, TopN)
	for _, r := range rs {
		if len(out) == TopN {
			break
		}
		out = append(out, Row{Name: r.Value, Visitors: r.Visitors})
	}
	return out
}

func goals(rs []query.Row) []Row {
	out := make([]Row, 0, TopN)
	for _, r := range rs {
		if len(out) == TopN {
			break
		}
		out = append(out, Row{Name: r.Name(), Visitors: r.Visitors})
	}
	return out
}
