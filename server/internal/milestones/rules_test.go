package milestones

import (
	"fmt"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// days builds n days of history from start, each with v visitors.
func days(start string, n int, v float64) []Day {
	t0, _ := time.Parse(time.DateOnly, start)
	out := make([]Day, n)
	for i := range out {
		out[i] = Day{Day: t0.AddDate(0, 0, i).Format(time.DateOnly), Visitors: v, Pageviews: v * 2}
	}
	return out
}

func keys(ms []sqlite.Milestone) map[string]sqlite.Milestone {
	out := map[string]sqlite.Milestone{}
	for _, m := range ms {
		out[m.Kind+"/"+m.Step] = m
	}
	return out
}

// The day a step is crossed is the day the running total passes it, not the
// day anything ran.
func TestCrossingsFindTheDay(t *testing.T) {
	h := days("2026-01-01", 30, 40) // 40 a day: 100 on day 3, 1,000 on day 25
	got := keys(crossings(Visitors, h, func(d Day) float64 { return d.Visitors }, ""))
	if got["visitors/100"].Day != "2026-01-03" || got["visitors/250"].Day != "2026-01-07" || got["visitors/500"].Day != "2026-01-13" || got["visitors/1000"].Day != "2026-01-25" || len(got) != 4 {
		t.Fatalf("crossings: %+v", got)
	}
	pv := keys(crossings(Pageviews, h, func(d Day) float64 { return d.Pageviews }, ""))
	if pv["pageviews/1"].Day != "2026-01-01" || pv["pageviews/1000"].Day != "2026-01-13" {
		t.Fatalf("pageviews: %+v", pv)
	}
}

// A record day needs a week of data, 50 visitors, a tenth more than the old
// best, and a month since the last one.
func TestRecordDayRules(t *testing.T) {
	h := days("2026-01-01", 60, 40)
	h[3].Visitors = 500 // too early: under a week of data
	if r := records(h); len(r) != 0 {
		t.Fatalf("a record in the first week: %+v", r)
	}
	h = days("2026-01-01", 60, 40)
	h[10].Visitors = 49 // the best, but under 50
	if r := records(h); len(r) != 0 {
		t.Fatalf("a record under 50: %+v", r)
	}
	h = days("2026-01-01", 90, 40)
	h[10].Visitors = 100
	h[20].Visitors = 109 // under 10 % more
	h[25].Visitors = 150 // 10 % more, but 15 days after the last
	h[45].Visitors = 170 // a month on and more than 10 % over 150
	r := records(h)
	if len(r) != 2 || r[0].Day != h[10].Day || r[1].Day != h[45].Day || r[1].Value != 170 {
		t.Fatalf("records: %+v", r)
	}
}

// The first look back stores everything, but only the highest step of each
// family and the current record get a moment.
func TestFirstLookBackIsQuiet(t *testing.T) {
	h := days("2025-01-01", 400, 40)
	h[100].Visitors = 200
	h[200].Visitors = 300
	h[150].Goal = true
	h[300].Sale, h[300].Revenue = true, 150
	plan := Plan(Reached(h, "EUR"), "")
	loud := map[string]string{}
	records := 0
	for _, m := range plan {
		if m.Kind == RecordDay {
			records++
		}
		if !m.Quiet {
			if prev, ok := loud[m.Kind]; ok {
				t.Fatalf("two moments for %s: %s and %s", m.Kind, prev, m.Step)
			}
			loud[m.Kind] = m.Step
		}
	}
	want := map[string]string{Visitors: "10000", Pageviews: "10000", RecordDay: h[200].Day, FirstGoal: "1", FirstSale: "1", Revenue: "100"}
	if fmt.Sprint(loud) != fmt.Sprint(want) {
		t.Fatalf("moments: %v, want %v", loud, want)
	}
	if records != 1 {
		t.Fatalf("%d record days stored; only the current one should be", records)
	}
	if k := keys(plan); k["visitors/100"].Quiet != true || k["revenue/100"].Currency != "EUR" {
		t.Fatalf("plan: %+v", k)
	}
}

// After that, only what was reached after the last day checked is new:
// anything older that shows up is stored quietly, and old record days are
// not stored at all.
func TestLaterChecksOnlyAddTheNew(t *testing.T) {
	h := days("2026-01-01", 40, 20)
	h[39].Visitors = 400 // 780 before it: 1,000 is crossed on the last day
	plan := keys(Plan(Reached(h, ""), h[38].Day))
	if plan["visitors/1000"].Quiet != false || plan["visitors/100"].Quiet != true {
		t.Fatalf("plan: %+v", plan)
	}
	if m, ok := plan["record_day/"+h[39].Day]; !ok || m.Quiet {
		t.Fatalf("the new record day: %+v", plan)
	}
	// The same history checked again a day later adds no record day.
	again := keys(Plan(Reached(h, ""), h[39].Day))
	if _, ok := again["record_day/"+h[39].Day]; ok {
		t.Fatalf("a record day stored twice: %+v", again)
	}
}

func TestNextSteps(t *testing.T) {
	h := days("2026-01-01", 10, 741)
	h[0].Countries, h[0].Revenue = 12, 80
	next := NextSteps(h, "USD", "2026-01-11")
	want := "[{visitors 10000 7410  741} {pageviews 25000 14820  1482} {countries 25 12  1.2} {revenue 100 80 USD 8}]"
	if fmt.Sprint(next) != want {
		t.Fatalf("next: %v", next)
	}
}

// A money milestone's amount is left out unless asked for.
func TestSayHidesTheAmount(t *testing.T) {
	m := sqlite.Milestone{Kind: Revenue, Step: "1000", Value: 1000, Currency: "EUR", Day: "2026-09-21"}
	if w := Say(m, false); w.Line() != "Revenue milestone" || w.Day != "Sep 21, 2026" {
		t.Fatalf("hidden: %+v", w)
	}
	if w := Say(m, true); w.Line() != "€1,000 revenue" {
		t.Fatalf("shown: %+v", w)
	}
	if w := Say(sqlite.Milestone{Kind: Revenue, Value: 100000, Currency: "CHF"}, true); w.Big != "100,000 CHF" {
		t.Fatalf("no sign: %+v", w)
	}
	if w := Say(sqlite.Milestone{Kind: Visitors, Value: 1_000_000}, false); w.Line() != "1,000,000 visitors" {
		t.Fatalf("visitors: %+v", w)
	}
}

// The biggest moment wins when several are new at once.
func TestBigger(t *testing.T) {
	v := sqlite.Milestone{Kind: Visitors, Value: 1000, Day: "2026-09-01"}
	g := sqlite.Milestone{Kind: FirstGoal, Value: 1, Day: "2026-09-20"}
	if !Bigger(v, g) || Bigger(g, v) {
		t.Fatal("visitors should beat a first goal")
	}
}

// Only the powers of ten (and the first pageview) get a moment on the
// counted ladders; every other family celebrates every step.
func TestCelebrated(t *testing.T) {
	cases := []struct {
		kind string
		v    float64
		want bool
	}{
		{Visitors, 100, true}, {Visitors, 250, false}, {Visitors, 500, false}, {Visitors, 1_000, true},
		{Visitors, 2_500, false}, {Visitors, 10_000_000, true}, {Visitors, 5_000_000, false},
		{Pageviews, 1, true}, {Pageviews, 1_000, true}, {Pageviews, 25_000, false},
		{Revenue, 1_000, true}, {Revenue, 50_000, false}, {Revenue, 1_000_000, true},
		{Countries, 25, true}, {FirstSale, 1, true}, {RecordDay, 120, true},
	}
	for _, c := range cases {
		if got := Celebrated(c.kind, c.v); got != c.want {
			t.Errorf("Celebrated(%s, %v) = %v, want %v", c.kind, c.v, got, c.want)
		}
	}
}

// A site that passed in-between steps before they existed gets them stored
// quietly: nothing new, nothing to notify.
func TestUpgradeDoesNotFlood(t *testing.T) {
	h := days("2026-01-01", 100, 100) // 10,000 visitors: 250, 500, 2.5k, 5k all passed
	checked := h[98].Day
	for _, m := range Plan(Reached(h, ""), checked) {
		if m.Kind == RecordDay {
			continue
		}
		if m.Day <= checked && !m.Quiet {
			t.Errorf("%s/%s from %s would notify after an upgrade", m.Kind, m.Step, m.Day)
		}
		if !Celebrated(m.Kind, m.Value) && !m.Quiet {
			t.Errorf("%s/%s is in between and must be quiet", m.Kind, m.Step)
		}
	}
	// The one crossed on the last day is a round step: still a moment.
	if k := keys(Plan(Reached(h, ""), checked)); k["visitors/10000"].Quiet {
		t.Fatalf("a round step crossed after the last check must be loud: %+v", k["visitors/10000"])
	}
	// An in-between step crossed after the last check is quiet too.
	g := days("2026-01-01", 40, 20)
	g[39].Visitors = 1800 // 780 -> 2,560: crosses 1,000 and 2,500 on the last day
	k := keys(Plan(Reached(g, ""), g[38].Day))
	if k["visitors/2500"].Quiet != true || k["visitors/1000"].Quiet != false {
		t.Fatalf("plan: %+v", k)
	}
}

// The first look back gives the moment to the highest celebrated step.
func TestFirstLookBackPicksARoundStep(t *testing.T) {
	h := days("2026-01-01", 60, 60) // 3,600 visitors: 2,500 is the top step, 1,000 the top round one
	for _, m := range Plan(Reached(h, ""), "") {
		if m.Kind == Visitors && !m.Quiet && m.Step != "1000" {
			t.Fatalf("moment on %s", m.Step)
		}
	}
}
