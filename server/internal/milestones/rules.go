// Package milestones notices when a site reaches something worth a smile
// (1,000 visitors, its first sale, a record day), from the session rollups
// and the ledger, once per finished day. It also draws the card that shares
// one (card.go, png.go).
//
// The rules here are pure: a site's history in, the milestones it reached
// out. The job (job.go) reads the history and stores what is new.
package milestones

import (
	"math"
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

	// SearchClicks: Google Search clicks over a rolling 28 days (Search
	// Console, only while it is connected), dated by the data's own last day.
	SearchClicks = "search_clicks"
	// AIVisits: visitors AI assistants sent, lifetime (the AI & search tab's
	// classification).
	AIVisits = "ai_visits"
)

// Steps are the thresholds of the counted families.
// The ladder counts 1, 2.5, 5 per power of ten; only the powers of ten
// are celebrated (see Celebrated), the steps between are recorded quietly.
var Steps = map[string][]float64{
	Visitors:  {100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000},
	Pageviews: {1, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000},
	Countries: {10, 25, 50, 100},
	Revenue:   {100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000},
	// Google's own steps in its Achievements list: every thousand up to 10K.
	SearchClicks: {100, 250, 500, 1_000, 2_500, 5_000, 6_000, 7_000, 8_000, 9_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000},
	AIVisits:     {10, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000},
}

// Celebrated says whether a milestone gets its moment (and the notice).
// The counted ladders celebrate their powers of ten (100, 1,000, ...) and
// the first pageview; the steps between are recorded and shown, quietly.
// Countries, the firsts, record days and the two search families (whose
// ladders are already sparse) are always celebrated.
func Celebrated(kind string, v float64) bool {
	switch kind {
	case Visitors, Pageviews, Revenue:
		return v >= 1 && math.Abs(math.Log10(v)-math.Round(math.Log10(v))) < 1e-9
	}
	return true
}

// Money says whether a family is about revenue: shown only where revenue
// is, and on a shared card only with the amount turned on.
func Money(kind string) bool { return kind == Revenue || kind == FirstSale }

// weight orders the families when several are new at once: only the
// biggest gets the moment.
var weight = map[string]int{Revenue: 9, Visitors: 8, Pageviews: 7, FirstSale: 6, SearchClicks: 5, AIVisits: 4, Countries: 3, RecordDay: 2, FirstGoal: 1}

// Lagged says whether a family's days arrive late (Search Console is two or
// three days behind), so it is dated by the data's own last day and can never
// be told apart from older history by the day it was checked.
func Lagged(kind string) bool { return kind == SearchClicks }

// Looked says whether a family is judged on its own first look back: the new
// search families start after a site already has a history, so the site's
// day checked says nothing about them. Without stored rows of the kind, the
// family is looked back over as a whole (one moment, the rest quiet).
func Looked(kind string) bool { return kind == SearchClicks || kind == AIVisits }

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
	AI        float64 // visitors AI assistants sent that day
}

// ClickDay is Google Search's clicks on one day, in the site's time.
type ClickDay struct {
	Day    string
	Clicks float64
}

// searchWindow is how many days of clicks one reading adds up.
const searchWindow = 28

// windowed gives, for every calendar day from the first with clicks to the
// last, the clicks of the 28 days ending that day. A day Google has no row
// for counts as none. The last day is the data's own, not today.
func windowed(clicks []ClickDay) []ClickDay {
	if len(clicks) == 0 {
		return nil
	}
	per := map[string]float64{}
	first, last := clicks[0].Day, clicks[0].Day
	for _, c := range clicks {
		per[c.Day] += c.Clicks
		first, last = min(first, c.Day), max(last, c.Day)
	}
	start, err := time.Parse(time.DateOnly, first)
	if err != nil {
		return nil
	}
	n := daysBetween(first, last)
	out := make([]ClickDay, 0, n+1)
	run := 0.0
	for i := 0; i <= n; i++ {
		run += per[start.AddDate(0, 0, i).Format(time.DateOnly)]
		if i >= searchWindow {
			run -= per[start.AddDate(0, 0, i-searchWindow).Format(time.DateOnly)]
		}
		out = append(out, ClickDay{Day: start.AddDate(0, 0, i).Format(time.DateOnly), Clicks: run})
	}
	return out
}

// searchCrossings finds the first day each step was reached by the 28-day
// reading, oldest first. The reading can fall back; a step once reached stays.
func searchCrossings(clicks []ClickDay) []sqlite.Milestone {
	var out []sqlite.Milestone
	win := windowed(clicks)
	for _, s := range Steps[SearchClicks] {
		for _, d := range win {
			if d.Clicks >= s {
				out = append(out, sqlite.Milestone{Kind: SearchClicks, Step: stepKey(s), Value: s, Day: d.Day})
				break
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Day < out[j].Day })
	return out
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
func Reached(days []Day, currency string, clicks []ClickDay) [][]sqlite.Milestone {
	return [][]sqlite.Milestone{
		crossings(Visitors, days, func(d Day) float64 { return d.Visitors }, ""),
		crossings(Pageviews, days, func(d Day) float64 { return d.Pageviews }, ""),
		crossings(Countries, days, func(d Day) float64 { return d.Countries }, ""),
		crossings(Revenue, days, func(d Day) float64 { return d.Revenue }, currency),
		crossings(AIVisits, days, func(d Day) float64 { return d.AI }, ""),
		searchCrossings(clicks),
		records(days),
		first(FirstGoal, days, func(d Day) bool { return d.Goal }),
		first(FirstSale, days, func(d Day) bool { return d.Sale }),
	}
}

// Plan decides what to store. On the first look back (checked == "") every
// milestone is stored quietly except the highest of each family, and only
// the current record day: an old site gets at most one moment per family
// and a full, honest timeline. Steps that are not celebrated (Celebrated)
// are always quiet, so steps added to a ladder later arrive already seen. After that, what was reached after the last
// day checked is new; anything older that turns up (history that changed)
// is stored quietly. stored says which families already have rows: a family
// of Looked starts its own first look back when it has none, and a Lagged
// one is new whenever it is not stored yet, whatever day it is dated.
func Plan(families [][]sqlite.Milestone, checked string, stored map[string]bool) []sqlite.Milestone {
	var out []sqlite.Milestone
	for _, fam := range families {
		if len(fam) == 0 {
			continue
		}
		since := checked
		if Looked(fam[0].Kind) && !stored[fam[0].Kind] {
			since = ""
		}
		// The moment of a first look back goes to the highest celebrated one.
		top := -1
		for i, m := range fam {
			if Celebrated(m.Kind, m.Value) {
				top = i
			}
		}
		for i, m := range fam {
			last := i == top
			if m.Kind == RecordDay {
				last = i == len(fam)-1
			}
			switch {
			case since == "" && m.Kind == RecordDay && !last:
				continue
			case since == "":
				m.Quiet = !last
			case m.Kind == RecordDay && m.Day <= since:
				continue
			default:
				m.Quiet = m.Day <= since && !Lagged(m.Kind)
			}
			m.Quiet = m.Quiet || !Celebrated(m.Kind, m.Value)
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
	// PerDay is the recent daily average (the last 30 days), 0 when none.
	PerDay float64 `json:"per_day"`
}

// paceDays is the window the pace is measured over.
const paceDays = 30

// NextSteps says, for each counted family, the next step and the total so
// far. A family past its last step has none.
func NextSteps(days []Day, currency, today string, clicks []ClickDay) []Next {
	var t, r Day
	cutoff := ""
	if td, err := time.Parse(time.DateOnly, today); err == nil {
		cutoff = td.AddDate(0, 0, -paceDays).Format(time.DateOnly)
	}
	for _, d := range days {
		t.Visitors += d.Visitors
		t.Pageviews += d.Pageviews
		t.Countries += d.Countries
		t.Revenue += d.Revenue
		t.AI += d.AI
		if d.Day >= cutoff {
			r.Visitors += d.Visitors
			r.Pageviews += d.Pageviews
			r.Countries += d.Countries
			r.Revenue += d.Revenue
			r.AI += d.AI
		}
	}
	// A young site is averaged over the days it has had, not over 30.
	span := float64(paceDays)
	if len(days) > 0 && cutoff != "" {
		if n := float64(daysBetween(days[0].Day, today)); n < span {
			span = max(n, 1)
		}
	}
	var out []Next
	for _, k := range []struct {
		kind string
		now  float64
		cur  string
		rate float64
	}{{Visitors, t.Visitors, "", r.Visitors}, {Pageviews, t.Pageviews, "", r.Pageviews}, {Countries, t.Countries, "", r.Countries}, {Revenue, t.Revenue, currency, r.Revenue}, {AIVisits, t.AI, "", r.AI}} {
		// A site no assistant has sent anyone to has no ladder to show.
		if k.kind == AIVisits && k.now == 0 {
			continue
		}
		for _, s := range Steps[k.kind] {
			if k.now < s {
				out = append(out, Next{Kind: k.kind, Step: s, Now: k.now, Currency: k.cur, PerDay: k.rate / span})
				break
			}
		}
	}
	if n, ok := nextSearch(clicks); ok {
		out = append(out, n)
	}
	return out
}

// nextSearch is the next step of the 28-day reading and where it stands on
// the data's last day. Its pace is how fast the reading itself grew over the
// last 28 days (0 when it did not), not the daily average of clicks: a
// rolling window that holds level never gets there.
func nextSearch(clicks []ClickDay) (Next, bool) {
	win := windowed(clicks)
	if len(win) == 0 {
		return Next{}, false
	}
	now := win[len(win)-1].Clicks
	before := 0.0
	if i := len(win) - 1 - searchWindow; i >= 0 {
		before = win[i].Clicks
	}
	for _, s := range Steps[SearchClicks] {
		if now < s {
			return Next{Kind: SearchClicks, Step: s, Now: now, PerDay: max(0, (now-before)/searchWindow)}, true
		}
	}
	return Next{}, false
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
