package server

import (
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/insights"
	"github.com/trckable/trckable/server/internal/query"
)

func money(n int64) *int64 { return &n }

// A week that clears the floors: the email says what moved, who pays best and
// who is new, after the numbers and before the link.
func TestWeeklyCarriesTheFindingsThatClearTheirFloors(t *testing.T) {
	from := time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)
	cur := &query.Result{
		KPIs: query.KPIs{Visitors: 1260, Pageviews: 3000},
		Dims: map[string][]query.Row{
			"channel": {
				{Value: "Search", Visitors: 610, Revenue: money(30000), Payers: 5},
				{Value: "Direct", Visitors: 650, Revenue: money(3000), Payers: 1},
			},
		},
		Money:        &query.Money{Currency: "USD", Exponent: 2, Revenue: 33000, Payments: 6},
		NewReferrers: []query.NewReferrer{{Referrer: "news.example.org", Visitors: 40}},
	}
	prev := &query.Result{KPIs: query.KPIs{Visitors: 1000}, Dims: map[string][]query.Row{"channel": {{Value: "Search", Visitors: 400}, {Value: "Direct", Visitors: 600}}}}
	_, msg, _ := weeklyText("demo.example.com", from, from.AddDate(0, 0, 7), cur, prev, aiWeek{}, "", "https://stats.example.com/demo.example.com?from=2026-09-14&to=2026-09-20&compare=previous")

	lines := strings.Split(msg, "\n")
	at := func(want string) int {
		for i, l := range lines {
			if strings.Contains(l, want) {
				return i
			}
		}
		t.Fatalf("missing %q in:\n%s", want, msg)
		return -1
	}
	move, pays, fresh, link := at("Search up 52% · 400 → 610 visitors"), at("Search earns $0.49 a visitor, 1.9× the average"), at("New referrer: news.example.org sent 40 visitors"), at("https://stats.example.com/")
	if at("1,260 visitors") >= move || move >= pays || pays >= fresh || fresh >= link {
		t.Errorf("order: numbers, then findings, then the link:\n%s", msg)
	}
	if link != len(lines)-1 {
		t.Errorf("the link is the last line:\n%s", msg)
	}
}

func TestWeeklySaysNothingWhenNothingClearsTheFloors(t *testing.T) {
	from := time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)
	cur := &query.Result{
		KPIs: query.KPIs{Visitors: 90, Pageviews: 120},
		Dims: map[string][]query.Row{"channel": {{Value: "Search", Visitors: 60, Revenue: money(9000), Payers: 2}, {Value: "Direct", Visitors: 30}}},
		// Payments are connected, but the sample is too small to name a winner.
		Money:        &query.Money{Currency: "USD", Exponent: 2, Revenue: 9000, Payments: 2},
		NewReferrers: []query.NewReferrer{{Referrer: "tiny.example.org", Visitors: 3}},
	}
	prev := &query.Result{KPIs: query.KPIs{Visitors: 50}, Dims: map[string][]query.Row{"channel": {{Value: "Search", Visitors: 20}}}}
	_, msg, _ := weeklyText("demo.example.com", from, from.AddDate(0, 0, 7), cur, prev, aiWeek{}, "", "https://stats.example.com/demo.example.com")
	for _, no := range []string{"earns", "New referrer", "Search up", "→", "converts"} {
		if strings.Contains(msg, no) {
			t.Errorf("%q with nothing to say:\n%s", no, msg)
		}
	}
	if got := weeklyInsights(cur, prev); len(got) != 0 {
		t.Errorf("findings: %v", got)
	}
}

// Without payments connected there is no money line, however well a source does.
func TestWeeklyMoneyLinesNeedPayments(t *testing.T) {
	cur := &query.Result{
		KPIs: query.KPIs{Visitors: 1260},
		Dims: map[string][]query.Row{"channel": {{Value: "Search", Visitors: 610, Revenue: money(30000), Payers: 5}, {Value: "Direct", Visitors: 650, Revenue: money(0)}}},
	}
	prev := &query.Result{KPIs: query.KPIs{Visitors: 1000}, Dims: map[string][]query.Row{"channel": {{Value: "Search", Visitors: 400}}}}
	for _, line := range weeklyInsights(cur, prev) {
		if strings.Contains(line, "earns") {
			t.Errorf("a money line with no payments connected: %s", line)
		}
	}
}

func TestWeeklyKeepsToThreeLines(t *testing.T) {
	cur := &query.Result{
		KPIs: query.KPIs{Visitors: 5000},
		Dims: map[string][]query.Row{
			"channel":    {{Value: "Search", Visitors: 2000, Revenue: money(90000), Payers: 9}, {Value: "Direct", Visitors: 3000, Revenue: money(1000), Payers: 1}},
			"entry_page": {{Value: "/pricing", Visitors: 900, Payers: 5}},
		},
		Money:        &query.Money{Currency: "USD", Exponent: 2, Revenue: 91000, Payments: 10},
		NewReferrers: []query.NewReferrer{{Referrer: "news.example.org", Visitors: 80}},
	}
	prev := &query.Result{
		KPIs: query.KPIs{Visitors: 4000},
		Dims: map[string][]query.Row{
			"channel":    {{Value: "Search", Visitors: 1000}, {Value: "Direct", Visitors: 3000}},
			"entry_page": {{Value: "/pricing", Visitors: 900, Payers: 30}},
		},
	}
	got := weeklyInsights(cur, prev)
	if len(got) != 3 || !strings.Contains(got[2], "/pricing converts") {
		t.Fatalf("three lines, in the dashboard's order: %v", got)
	}
}

func TestAWeekIsReportedOnlyForASiteThatHadOne(t *testing.T) {
	end := time.Date(2026, 9, 21, 0, 0, 0, 0, time.UTC)
	before, after := end.AddDate(0, 0, -10).Unix(), end.AddDate(0, 0, 2).Unix()
	if hadAWeek(before, 0, end) {
		t.Error("a site that never sent anything has no week")
	}
	if hadAWeek(after, after+60, end) {
		t.Error("a site made after the week ended has no week")
	}
	if !hadAWeek(before, before+60, end) {
		t.Error("a site that sent something in its first week has one")
	}
}

// The multiplier is written the way the dashboard writes it: a decimal only
// under ten, never "230.0×".
func TestInsightLineTimes(t *testing.T) {
	for in, want := range map[float64]string{1.9: "1.9× the average", 3.0: "3× the average", 12.3: "12× the average"} {
		line := insightLine(insights.Insight{Kind: insights.TopRevenue, Dim: "channel", Value: "Search", PerVisitor: 49, Times: in}, &query.Money{Currency: "USD", Exponent: 2})
		if !strings.HasSuffix(line, want) {
			t.Errorf("%v: %q", in, line)
		}
	}
}
