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
	if got["visitors/100"].Day != "2026-01-03" || got["visitors/1000"].Day != "2026-01-25" || len(got) != 2 {
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
	want := map[string]string{Visitors: "10000", Pageviews: "1000", RecordDay: h[200].Day, FirstGoal: "1", FirstSale: "1", Revenue: "100"}
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
	next := NextSteps(h, "USD")
	want := "[{visitors 10000 7410 } {pageviews 100000 14820 } {countries 25 12 } {revenue 100 80 USD}]"
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
