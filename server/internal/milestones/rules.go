// Package milestones notices when a site reaches something worth a smile
// (1,000 visitors, its first sale, a record day), from the session rollups
// and the ledger, once per finished day. It also draws the card that shares
// one (card.go, png.go).
//
// The rules here are pure: a site's history in, the milestones it reached
// out. The job (job.go) reads the history and stores what is new.
package milestones

import (
	"sort"
	"strconv"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The families. Round numbers only; a small fixed set.
const (
	Visitors  = "visitors"   // lifetime, the sum of each day's unique visitors
	Pageviews = "pageviews"  // lifetime
	RecordDay = "record_day" // a new best day for visitors; step is the day
	Countries = "countries"  // distinct countries, lifetime
	FirstGoal = "first_goal"
	FirstSale = "first_sale"
	Revenue   = "revenue" // lifetime, in the site's own currency
)

// Steps are the thresholds of the counted families.
var Steps = map[string][]float64{
	Visitors:  {100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000},
	Pageviews: {1, 1_000, 100_000, 1_000_000},
	Countries: {10, 25, 50, 100},
	Revenue:   {100, 1_000, 10_000, 100_000, 1_000_000},
}

// Money says whether a family is about revenue: shown only where revenue
// is, and on a shared card only with the amount turned on.
func Money(kind string) bool { return kind == Revenue || kind == FirstSale }

// weight orders the families when several are new at once: only the
// biggest gets the moment.
var weight = map[string]int{Revenue: 7, Visitors: 6, Pageviews: 5, FirstSale: 4, Countries: 3, RecordDay: 2, FirstGoal: 1}

// Bigger says whether a is the bigger moment of two.
func Bigger(a, b sqlite.Milestone) bool {
	if weight[a.Kind] != weight[b.Kind] {
		return weight[a.Kind] > weight[b.Kind]
	}
	if a.Day != b.Day {
		return a.Day > b.Day
	}
	return a.Value > b.Value
}

// The record-day rules: no record before a week of data, none under 50
// visitors, it must beat the old best by a tenth, and at most one a month.
const (
	recordMinDays    = 7
	recordMinVisits  = 50
	recordMargin     = 1.10
	recordSpacingDay = 30
)

// Day is one finished day of history, in the site's own time.
type Day struct {
	Day       string
	Visitors  float64
	Pageviews float64
	Countries float64 // first seen that day
	Goal      bool
	Revenue   float64 // major units of the site's currency
	Sale      bool    // any real payment that day, in any currency
}

// crossings finds the day each step of a counted family was crossed, from
// the running total.
func crossings(kind string, days []Day, of func(Day) float64, currency string) []sqlite.Milestone {
	var out []sqlite.Milestone
	steps := Steps[kind]
	total, i := 0.0, 0
	for _, d := range days {
		total += of(d)
		for i < len(steps) && total >= steps[i] {
			out = append(out, sqlite.Milestone{Kind: kind, Step: stepKey(steps[i]), Value: steps[i], Currency: currency, Day: d.Day})
			i++
		}
	}
	return out
}

func stepKey(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }

// records finds every record day the rules allow, oldest first.
func records(days []Day) []sqlite.Milestone {
	var out []sqlite.Milestone
	best, last := 0.0, ""
	for i, d := range days {
		ok := i >= recordMinDays && d.Visitors >= recordMinVisits && d.Visitors >= best*recordMargin && (last == "" || daysBetween(last, d.Day) >= recordSpacingDay)
		if ok {
			out = append(out, sqlite.Milestone{Kind: RecordDay, Step: d.Day, Value: d.Visitors, Day: d.Day})
			last = d.Day
		}
		best = max(best, d.Visitors)
	}
	return out
}

// first finds the first day that has something.
func first(kind string, days []Day, has func(Day) bool) []sqlite.Milestone {
	for _, d := range days {
		if has(d) {
			return []sqlite.Milestone{{Kind: kind, Step: "1", Value: 1, Day: d.Day}}
		}
	}
	return nil
}

// Reached is every milestone a site's history holds, family by family, each
// family oldest first.
func Reached(days []Day, currency string) [][]sqlite.Milestone {
	return [][]sqlite.Milestone{
		crossings(Visitors, days, func(d Day) float64 { return d.Visitors }, ""),
		crossings(Pageviews, days, func(d Day) float64 { return d.Pageviews }, ""),
		crossings(Countries, days, func(d Day) float64 { return d.Countries }, ""),
		crossings(Revenue, days, func(d Day) float64 { return d.Revenue }, currency),
		records(days),
		first(FirstGoal, days, func(d Day) bool { return d.Goal }),
		first(FirstSale, days, func(d Day) bool { return d.Sale }),
	}
}

// Plan decides what to store. On the first look back (checked == "") every
// milestone is stored quietly except the highest of each family, and only
// the current record day: an old site gets at most one moment per family
// and a full, honest timeline. After that, what was reached after the last
// day checked is new; anything older that turns up (history that changed)
// is stored quietly.
func Plan(families [][]sqlite.Milestone, checked string) []sqlite.Milestone {
	var out []sqlite.Milestone
	for _, fam := range families {
		for i, m := range fam {
			last := i == len(fam)-1
			switch {
			case checked == "" && m.Kind == RecordDay && !last:
				continue
			case checked == "":
				m.Quiet = !last
			case m.Kind == RecordDay && m.Day <= checked:
				continue
			default:
				m.Quiet = m.Day <= checked
			}
			out = append(out, m)
		}
	}
	return out
}

// Next is the next step of a counted family and where the site is now.
type Next struct {
	Kind     string  `json:"kind"`
	Step     float64 `json:"step"`
	Now      float64 `json:"now"`
	Currency string  `json:"currency,omitempty"`
}

// NextSteps says, for each counted family, the next step and the total so
// far. A family past its last step has none.
func NextSteps(days []Day, currency string) []Next {
	var t Day
	for _, d := range days {
		t.Visitors += d.Visitors
		t.Pageviews += d.Pageviews
		t.Countries += d.Countries
		t.Revenue += d.Revenue
	}
	var out []Next
	for _, k := range []struct {
		kind string
		now  float64
		cur  string
	}{{Visitors, t.Visitors, ""}, {Pageviews, t.Pageviews, ""}, {Countries, t.Countries, ""}, {Revenue, t.Revenue, currency}} {
		for _, s := range Steps[k.kind] {
			if k.now < s {
				out = append(out, Next{Kind: k.kind, Step: s, Now: k.now, Currency: k.cur})
				break
			}
		}
	}
	return out
}

func sortDays(days []Day) {
	sort.Slice(days, func(i, j int) bool { return days[i].Day < days[j].Day })
}

// daysBetween counts the days from a to b (both YYYY-MM-DD).
func daysBetween(a, b string) int {
	ta, err1 := time.Parse(time.DateOnly, a)
	tb, err2 := time.Parse(time.DateOnly, b)
	if err1 != nil || err2 != nil {
		return 0
	}
	return int(tb.Sub(ta).Hours() / 24)
}
