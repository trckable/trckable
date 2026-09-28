// Package moments finds what happened in a period, for Replay to tell as a
// story: spikes, firsts, sales, milestones and notes, each at the bucket it
// happened in. It works on aggregates only (a bucket's count, a country, a
// channel); it never sees a visitor.
package moments

import "sort"

// Moment is one thing worth a pop on the timeline, at bucket T (the site's
// own clock, "2026-09-27T20:00", the same keys as the report's series).
type Moment struct {
	T    string `json:"t"`
	Kind string `json:"kind"` // spike | sale | country | ai | milestone | note

	Factor   float64 `json:"factor,omitempty"`   // spike: times the usual
	Referrer string  `json:"referrer,omitempty"` // spike: who sent them
	Count    int64   `json:"count,omitempty"`    // sale: payments in the bucket
	Amount   int64   `json:"amount,omitempty"`   // sale: net, minor units
	Channel  string  `json:"channel,omitempty"`  // sale: the channel that earned most of it
	Country  string  `json:"country,omitempty"`  // country: its first visit ever
	Bot      string  `json:"bot,omitempty"`      // ai: the assistant
	Step     string  `json:"step,omitempty"`     // milestone: its step ("1k")
	Family   string  `json:"family,omitempty"`   // milestone: its kind (visitors, revenue, ...)
	Value    float64 `json:"value,omitempty"`    // milestone: the round number reached
	Currency string  `json:"currency,omitempty"` // milestone: revenue's currency
	Text     string  `json:"text,omitempty"`     // note: its words
}

// Spike is a bucket far above the ones before it.
type Spike struct {
	I      int
	Factor float64
}

// Spikes finds the buckets from start on at least factor times their
// baseline, and at least min visitors. The baseline is the mean of the same
// bucket over the window cycles before (period 1: the days before; period
// 24 by the hour: the same hour on the days before, so an afternoon is not a
// spike against the night). It needs two cycles; a zero baseline is one
// visitor, so a quiet site's first dozen is a spike and its first one is not.
func Spikes(values []int64, start, period, window int, factor float64, min int64) []Spike {
	var out []Spike
	for i := start; i < len(values); i++ {
		var sum int64
		n := 0
		for k := 1; k <= window && i-k*period >= 0; k++ {
			sum += values[i-k*period]
			n++
		}
		if n < 2 {
			continue
		}
		base := float64(sum) / float64(n)
		if base < 1 {
			base = 1
		}
		f := float64(values[i]) / base
		if values[i] >= min && f >= factor {
			out = append(out, Spike{I: i, Factor: f})
		}
	}
	return out
}

// Top keeps the biggest spikes only: n of them, back in time order.
func Top(s []Spike, n int) []Spike {
	if len(s) <= n {
		return s
	}
	c := append([]Spike(nil), s...)
	sort.SliceStable(c, func(a, b int) bool { return c[a].Factor > c[b].Factor })
	c = c[:n]
	sort.Slice(c, func(a, b int) bool { return c[a].I < c[b].I })
	return c
}

// Sort puts moments in time order; within a bucket, a fixed order of kinds so
// the story reads the same every time.
func Sort(ms []Moment) {
	rank := map[string]int{"note": 0, "milestone": 1, "spike": 2, "country": 3, "ai": 4, "sale": 5}
	sort.SliceStable(ms, func(a, b int) bool {
		if ms[a].T != ms[b].T {
			return ms[a].T < ms[b].T
		}
		return rank[ms[a].Kind] < rank[ms[b].Kind]
	})
}
