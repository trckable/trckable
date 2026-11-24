// Package standsout decides whether a goal stands out: the one rule the bell's goals card, the goals list and a goal's
// own page all use, so they never disagree. A goal stands out when it was reached for the first time ever, or when it
// was reached at least Factor times as often as on a usual day.
package standsout

import (
	"sort"
	"time"
)

const (
	// Window is how many days before a period say what a usual day is.
	Window = 28
	// Factor is how many times a usual day makes a goal stand out.
	Factor = 3
	// UsualFloor is the least a usual day is taken as, so a goal reached once in a blue moon needs Factor
	// reaches, not one, to stand out.
	UsualFloor = 1
)

// Why is what makes a goal stand out.
type Why string

const (
	// None: the goal is as usual.
	None Why = ""
	// First: reached for the first time ever.
	First Why = "first"
	// Times: reached many times as often as on a usual day.
	Times Why = "times"
)

// In is what the rule reads of one goal over one period.
type In struct {
	// Count is how many times the goal was reached in the period, and Days how many days the period spans.
	Count int64
	Days  int
	// History is how many times it was reached on each of the Window days before the period.
	History []int64
	// Seen is whether it was ever reached before the period; Known is whether the site had any data before it (a
	// site on its first day has no "first time" to tell).
	Seen, Known bool
}

// Verdict is the rule's answer.
type Verdict struct {
	Out bool `json:"out"`
	Why Why  `json:"why,omitempty"`
	// Factor is how many times a usual period it was, rounded down (for Times).
	Factor int `json:"factor,omitempty"`
	// Usual is a usual day: the median of the days it was reached in the window, 0 when it was on none.
	Usual float64 `json:"usual"`
}

// Usual is the median of the days with at least one reach.
func Usual(history []int64) float64 {
	var on []int64
	for _, n := range history {
		if n > 0 {
			on = append(on, n)
		}
	}
	if len(on) == 0 {
		return 0
	}
	sort.Slice(on, func(i, j int) bool { return on[i] < on[j] })
	mid := len(on) / 2
	if len(on)%2 == 1 {
		return float64(on[mid])
	}
	return float64(on[mid-1]+on[mid]) / 2
}

// Judge applies the rule.
func Judge(in In) Verdict {
	usual := Usual(in.History)
	v := Verdict{Usual: usual}
	if in.Count <= 0 {
		return v
	}
	if !in.Seen && in.Known {
		v.Out, v.Why = true, First
		return v
	}
	days := max(in.Days, 1)
	per := max(usual, UsualFloor) * float64(days)
	if float64(in.Count) >= Factor*per {
		v.Out, v.Why, v.Factor = true, Times, int(float64(in.Count)/per)
	}
	return v
}

// History reads the Window days before `start` from daily counts keyed by date ("2026-11-24", the site's own days).
func History(counts map[string]int64, start time.Time) []int64 {
	out := make([]int64, Window)
	for i := range out {
		out[i] = counts[start.AddDate(0, 0, -(Window-i)).Format(time.DateOnly)]
	}
	return out
}
