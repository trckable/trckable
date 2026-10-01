// Package insights picks the few things worth saying about a period against
// the one before it: a source that moved, the source that pays best per
// visitor, a page whose buyers fell away, a referrer that is new. The rules
// are plain and deterministic, and every one has a floor on volume: a number
// that is small is noise, and noise is never shown. When nothing clears its
// floor, nothing is returned.
//
// It works on the report's own rows, so what it says is what the lists under
// it say, and it never sees a visitor.
package insights

import (
	"math"
	"sort"

	"github.com/trckable/trckable/server/internal/query"
)

// The four kinds, in the order they are shown.
const (
	SourceMove     = "source_move"     // the channel whose visitors changed most
	TopRevenue     = "top_revenue"     // the channel that earns most per visitor
	ConversionDrop = "conversion_drop" // an entry page whose visitors buy less than before
	NewReferrer    = "new_referrer"    // a site that never sent anyone before
)

// The floors. Below them a figure is chance, not news.
const (
	MoveMinVisitors  = 100  // a source needs this many in one of the two periods
	MoveMinChange    = 50   // and to have moved by this many visitors...
	MoveMinShare     = 0.25 // ...and by a quarter
	RevenueMinVisits = 100  // a source needs this many visitors to have a per-visitor figure
	RevenueMinPayers = 3    // and this many customers
	RevenueMinTimes  = 1.5  // and to beat the average per visitor by half again
	DropMinVisitors  = 200  // a page needs this many visitors in both periods
	DropMinPayersWas = 5    // and to have had this many customers before
	DropMinShare     = 0.3  // and its buying rate to have fallen by 30%
	DropMinMissing   = 3    // which is at least this many customers it would have had
	NewMinVisitors   = 20   // a new referrer has to have sent this many
)

// Insight is one line. Every figure is the report's own, unrounded: the
// dashboard words it. Dim and Value are the filter a click applies.
type Insight struct {
	Kind  string `json:"kind"`
	Dim   string `json:"dim"`
	Value string `json:"value"`

	Now    int64   `json:"now"`              // visitors this period
	Was    int64   `json:"was,omitempty"`    // visitors the period before
	Change float64 `json:"change,omitempty"` // 0.25 is up a quarter, -0.4 down two fifths

	Revenue    int64   `json:"revenue,omitempty"`     // top_revenue: minor units
	PerVisitor float64 `json:"per_visitor,omitempty"` // top_revenue: minor units
	Times      float64 `json:"times,omitempty"`       // top_revenue: times the average per visitor

	Rate    float64 `json:"rate,omitempty"`     // conversion_drop: customers per visitor now
	WasRate float64 `json:"was_rate,omitempty"` // and before
}

// Newcomer is a referrer first seen in the period.
type Newcomer struct {
	Referrer string
	Visitors int64
}

// Input is the two periods' breakdowns, as the report returns them.
type Input struct {
	Visitors     int64 // this period's visitors
	Channels     []query.Row
	PrevChannels []query.Row
	Pages        []query.Row // entry pages, with their customers
	PrevPages    []query.Row
	HasRevenue   bool
	Newcomers    []Newcomer
}

// Find returns up to four insights, in a fixed order, and none when nothing
// clears its floor.
func Find(in Input) []Insight {
	out := []Insight{}
	if i, ok := sourceMove(in); ok {
		out = append(out, i)
	}
	if in.HasRevenue {
		if i, ok := topRevenue(in); ok {
			out = append(out, i)
		}
		if i, ok := conversionDrop(in); ok {
			out = append(out, i)
		}
	}
	if i, ok := newReferrer(in); ok {
		out = append(out, i)
	}
	return out
}

func byValue(rows []query.Row) map[string]query.Row {
	m := make(map[string]query.Row, len(rows))
	for _, r := range rows {
		m[r.Value] = r
	}
	return m
}

func revenueOf(r query.Row) int64 {
	if r.Revenue == nil {
		return 0
	}
	return *r.Revenue
}

// sourceMove is the channel with the biggest change in visitors, up or down.
// A channel that was not there before is left to the new-referrer line: a
// change from nothing has no size.
func sourceMove(in Input) (Insight, bool) {
	was := byValue(in.PrevChannels)
	var best Insight
	var bestAbs int64
	for _, r := range in.Channels {
		p, ok := was[r.Value]
		if !ok || p.Visitors == 0 {
			continue
		}
		d := r.Visitors - p.Visitors
		abs := d
		if abs < 0 {
			abs = -abs
		}
		if max(r.Visitors, p.Visitors) < MoveMinVisitors || abs < MoveMinChange {
			continue
		}
		change := float64(d) / float64(p.Visitors)
		if math.Abs(change) < MoveMinShare {
			continue
		}
		if abs > bestAbs || (abs == bestAbs && r.Value < best.Value) {
			best, bestAbs = Insight{Kind: SourceMove, Dim: "channel", Value: r.Value, Now: r.Visitors, Was: p.Visitors, Change: change}, abs
		}
	}
	return best, bestAbs > 0
}

// topRevenue is the channel whose visitors pay most each, when it clearly
// beats the average of all of them.
func topRevenue(in Input) (Insight, bool) {
	var total int64
	for _, r := range in.Channels {
		total += revenueOf(r)
	}
	if in.Visitors <= 0 || total <= 0 {
		return Insight{}, false
	}
	avg := float64(total) / float64(in.Visitors)
	var best Insight
	for _, r := range in.Channels {
		rev := revenueOf(r)
		if rev <= 0 || r.Visitors < RevenueMinVisits || r.Payers < RevenueMinPayers {
			continue
		}
		pv := float64(rev) / float64(r.Visitors)
		if pv/avg < RevenueMinTimes {
			continue
		}
		if pv > best.PerVisitor || (pv == best.PerVisitor && r.Value < best.Value) {
			best = Insight{Kind: TopRevenue, Dim: "channel", Value: r.Value, Now: r.Visitors, Revenue: rev, PerVisitor: pv, Times: pv / avg}
		}
	}
	return best, best.Kind != ""
}

// conversionDrop is the entry page that lost the most customers: the ones its
// visitors would have brought at the buying rate it had before.
func conversionDrop(in Input) (Insight, bool) {
	was := byValue(in.PrevPages)
	var best Insight
	var bestMissing float64
	for _, r := range in.Pages {
		p, ok := was[r.Value]
		if !ok || r.Visitors < DropMinVisitors || p.Visitors < DropMinVisitors || p.Payers < DropMinPayersWas {
			continue
		}
		rate, wasRate := float64(r.Payers)/float64(r.Visitors), float64(p.Payers)/float64(p.Visitors)
		if rate > wasRate*(1-DropMinShare) {
			continue
		}
		missing := (wasRate - rate) * float64(r.Visitors)
		if missing < DropMinMissing {
			continue
		}
		if missing > bestMissing || (missing == bestMissing && r.Value < best.Value) {
			best, bestMissing = Insight{Kind: ConversionDrop, Dim: "entry_page", Value: r.Value, Now: r.Visitors, Was: p.Visitors, Rate: rate, WasRate: wasRate, Change: (rate - wasRate) / wasRate}, missing
		}
	}
	return best, best.Kind != ""
}

// newReferrer is the new site that sent the most visitors.
func newReferrer(in Input) (Insight, bool) {
	ns := append([]Newcomer(nil), in.Newcomers...)
	sort.Slice(ns, func(a, b int) bool {
		if ns[a].Visitors != ns[b].Visitors {
			return ns[a].Visitors > ns[b].Visitors
		}
		return ns[a].Referrer < ns[b].Referrer
	})
	if len(ns) == 0 || ns[0].Visitors < NewMinVisitors {
		return Insight{}, false
	}
	return Insight{Kind: NewReferrer, Dim: "referrer", Value: ns[0].Referrer, Now: ns[0].Visitors}, true
}
