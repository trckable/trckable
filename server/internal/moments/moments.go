// Package moments finds what happened in a period, for Replay to tell as a
// story: spikes, firsts, sales, milestones and notes, each at the bucket it
// happened in. It works on aggregates only (a bucket's count, a country, a
// channel); it never sees a visitor.
package moments

import (
	"math"
	"sort"
	"strconv"
)

// Moment is one thing worth a pop on the timeline, at bucket T (the site's
// own clock, "2026-09-27T20:00", the same keys as the report's series).
type Moment struct {
	T    string `json:"t"`
	Kind string `json:"kind"` // spike | sale | country | ai | milestone | note

	Factor   float64 `json:"factor,omitempty"`   // spike: times the usual; absent for new traffic (see Quiet)
	Referrer string  `json:"referrer,omitempty"` // spike: who sent them
	Visitors int64   `json:"visitors,omitempty"` // spike: visitors in the bucket
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
	// Quiet: the usual it was measured against is too small, or too young, to
	// be worth a multiplier ("230×" of one visitor a day says nothing). It is
	// new traffic, told as a count and a source.
	Quiet bool
}

const (
	// MinUsual is the least a day's usual may be for a multiplier to mean
	// anything: under it a spike is new traffic.
	MinUsual = 10
	// MinUsualHour is the same floor for one hour of the day (about 50 visitors a day).
	MinUsualHour = 2
	// MinHistory is how many cycles (days) a site must have had before a
	// multiplier is told.
	MinHistory = 7
)

// minUsual is the floor for buckets of this period (1: a day, 24: an hour).
func minUsual(period int) float64 {
	if period > 1 {
		return MinUsualHour
	}
	return MinUsual
}

// Round writes a factor the way it is told: one decimal under ten, whole
// numbers from ten on (2.4, 3, 12), never 230.0.
func Round(f float64) float64 {
	if r := math.Round(f*10) / 10; r < 10 {
		return r
	}
	return math.Round(f)
}

// Times is Round as words: "2.4×", "3×", "12×". The dashboard writes it the
// same way, so a line reads the same in the card, the email and an alert.
func Times(f float64) string {
	return strconv.FormatFloat(Round(f), 'f', -1, 64) + "×"
}

// Spikes finds the buckets from start on at least factor times their
// baseline, and at least min visitors. The baseline is the mean of the same
// bucket over the window cycles before (period 1: the days before; period
// 24 by the hour: the same hour on the days before, so an afternoon is not a
// spike against the night). It needs two cycles; a zero baseline is one
// visitor, so a quiet site's first dozen is a spike and its first one is not.
// A spike whose baseline is under the floor (MinUsual a day), or on a site
// whose first visitor came less than MinHistory cycles before it, is Quiet.
func Spikes(values []int64, start, period, window int, factor float64, min int64) []Spike {
	var out []Spike
	first := -1 // the first bucket with anybody: before it the site did not exist
	for i, v := range values {
		if v > 0 {
			first = i
			break
		}
	}
	floor := minUsual(period)
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
		quiet := base < floor || first < 0 || (i-first+period-1)/period < MinHistory
		if base < 1 {
			base = 1
		}
		f := float64(values[i]) / base
		if values[i] >= min && f >= factor {
			out = append(out, Spike{I: i, Factor: f, Quiet: quiet})
		}
	}
	return out
}

// Top keeps the biggest spikes only: n of them, back in time order. A spike
// with a real baseline outranks new traffic, whatever its multiplier says.
func Top(s []Spike, n int) []Spike {
	if len(s) <= n {
		return s
	}
	c := append([]Spike(nil), s...)
	sort.SliceStable(c, func(a, b int) bool {
		if c[a].Quiet != c[b].Quiet {
			return !c[a].Quiet
		}
		return c[a].Factor > c[b].Factor
	})
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

// Burst is a bucket with far more sales than the buckets that had any.
type Burst struct {
	I      int
	Factor float64 // times the usual busy bucket
}

// Bursts finds the buckets with at least min sales and at least factor times
// the median of the buckets that had any sale at all. The "usual" is a
// median so one big day cannot raise its own bar, and it needs three buckets
// with sales: two are not a pattern, so a site's first sales are never a burst.
func Bursts(counts []int64, min int64, factor float64) []Burst {
	var some []int64
	for _, c := range counts {
		if c > 0 {
			some = append(some, c)
		}
	}
	if len(some) < 3 {
		return nil
	}
	sort.Slice(some, func(a, b int) bool { return some[a] < some[b] })
	med := float64(some[len(some)/2])
	if len(some)%2 == 0 {
		med = float64(some[len(some)/2-1]+some[len(some)/2]) / 2
	}
	var out []Burst
	for i, c := range counts {
		if f := float64(c) / med; c >= min && f >= factor {
			out = append(out, Burst{I: i, Factor: f})
		}
	}
	return out
}
