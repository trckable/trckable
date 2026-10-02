package insights

import (
	"reflect"
	"testing"

	"github.com/trckable/trckable/server/internal/query"
)

func row(v string, visitors, payers, revenue int64) query.Row {
	r := query.Row{Value: v, Visitors: visitors, Payers: payers}
	if revenue >= 0 {
		r.Revenue = &revenue
	}
	return r
}

func kinds(is []Insight) []string {
	out := []string{}
	for _, i := range is {
		out = append(out, i.Kind+":"+i.Value)
	}
	return out
}

func TestNothingWhenNothingClearsItsFloor(t *testing.T) {
	in := Input{
		Visitors:     90,
		Channels:     []query.Row{row("Search", 60, 0, 0), row("Direct", 30, 0, 0)},
		PrevChannels: []query.Row{row("Search", 40, 0, 0), row("Direct", 30, 0, 0)},
		HasRevenue:   true,
		Newcomers:    []Newcomer{{"small.example", 5, ""}},
	}
	if got := Find(in); len(got) != 0 {
		t.Fatalf("a small site says nothing, got %+v", got)
	}
}

func TestSourceMovePicksTheBiggestChangeEitherWay(t *testing.T) {
	in := Input{
		Channels:     []query.Row{row("Search", 900, 0, -1), row("AI", 300, 0, -1), row("Social", 50, 0, -1), row("Direct", 1000, 0, -1)},
		PrevChannels: []query.Row{row("Search", 1000, 0, -1), row("AI", 100, 0, -1), row("Social", 400, 0, -1), row("Direct", 980, 0, -1)},
	}
	got := Find(in)
	// Social fell by 350 (88%), AI rose by 200, Search fell by 10% (too small a share), Direct is flat.
	if len(got) != 1 || got[0].Value != "Social" || got[0].Now != 50 || got[0].Was != 400 || got[0].Change != -0.875 {
		t.Fatalf("got %+v", got)
	}
	// With the fall gone, the rise is the news.
	in.Channels[2], in.PrevChannels[2] = row("Social", 400, 0, -1), row("Social", 400, 0, -1)
	got = Find(in)
	if len(got) != 1 || got[0].Value != "AI" || got[0].Change != 2 {
		t.Fatalf("got %+v", got)
	}
}

func TestSourceMoveIgnoresSmallAndNewChannels(t *testing.T) {
	in := Input{
		// 40 to 80 is a doubling of nothing; Paid was not there before.
		Channels:     []query.Row{row("Email", 80, 0, -1), row("Paid", 500, 0, -1)},
		PrevChannels: []query.Row{row("Email", 40, 0, -1)},
	}
	if got := Find(in); len(got) != 0 {
		t.Fatalf("got %+v", got)
	}
}

func TestTopRevenuePerVisitor(t *testing.T) {
	in := Input{
		Visitors:   2000,
		HasRevenue: true,
		Channels: []query.Row{
			row("Search", 1000, 20, 20000), // 20 a visitor
			row("Email", 200, 10, 12000),   // 60 a visitor: the best
			row("Social", 600, 2, 9000),    // 15 a visitor, and only two customers
			row("Paid", 50, 5, 9000),       // too few visitors to say
			row("Direct", 150, 0, 0),
		},
	}
	in.Channels[4].Revenue = nil
	got := Find(in)
	// 50,000 over 2,000 visitors: 25 each on average, Email is 2.4 times that.
	want := Insight{Kind: TopRevenue, Dim: "channel", Value: "Email", Now: 200, Revenue: 12000, PerVisitor: 60, Times: 2.4}
	if len(got) != 1 || !reflect.DeepEqual(got[0], want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	// Nothing beats the average by half again: nothing to say.
	in.Channels[1] = row("Email", 200, 10, 6000) // 30 a visitor: 1.2 times
	in.Visitors = 2000
	if got := Find(in); len(got) != 0 {
		t.Fatalf("got %+v", got)
	}
	// And revenue off means no revenue lines at all.
	in.HasRevenue = false
	in.Channels[1] = row("Email", 200, 10, 12000)
	if got := Find(in); len(got) != 0 {
		t.Fatalf("got %+v", got)
	}
}

func TestConversionDrop(t *testing.T) {
	in := Input{
		HasRevenue: true,
		Pages:      []query.Row{row("/pricing", 1000, 10, 0), row("/", 2000, 40, 0), row("/docs", 300, 0, 0), row("/new", 500, 0, 0)},
		PrevPages:  []query.Row{row("/pricing", 1000, 30, 0), row("/", 2000, 42, 0), row("/docs", 300, 6, 0), row("/new", 100, 0, 0)},
	}
	got := Find(in)
	// /pricing went from 3.0% to 1.0% (20 customers missing); /docs went to zero but it had 300 visitors (6 missing) and so ranks below.
	want := Insight{Kind: ConversionDrop, Dim: "entry_page", Value: "/pricing", Now: 1000, Was: 1000, Rate: 0.01, WasRate: 0.03, Change: (0.01 - 0.03) / 0.03}
	if len(got) != 1 || !reflect.DeepEqual(got[0], want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	// A page with few visitors before, or few customers, is never named.
	in.Pages, in.PrevPages = []query.Row{row("/tiny", 150, 0, 0)}, []query.Row{row("/tiny", 150, 9, 0)}
	if got := Find(in); len(got) != 0 {
		t.Fatalf("got %+v", got)
	}
}

func TestNewReferrerTakesTheBiggest(t *testing.T) {
	in := Input{Newcomers: []Newcomer{{"b.example", 30, ""}, {"a.example", 30, ""}, {"c.example", 12, ""}}}
	got := Find(in)
	if len(got) != 1 || got[0].Kind != NewReferrer || got[0].Value != "a.example" || got[0].Now != 30 {
		t.Fatalf("a tie goes to the first name, got %+v", got)
	}
}

func TestOrderAndAtMostFour(t *testing.T) {
	in := Input{
		Visitors:     3000,
		HasRevenue:   true,
		Channels:     []query.Row{row("Search", 1000, 12, 10000), row("Email", 300, 10, 30000)},
		PrevChannels: []query.Row{row("Search", 500, 0, 0), row("Email", 300, 0, 0)},
		Pages:        []query.Row{row("/pricing", 1000, 10, 0)},
		PrevPages:    []query.Row{row("/pricing", 1000, 30, 0)},
		Newcomers:    []Newcomer{{"new.example", 50, ""}},
	}
	got := kinds(Find(in))
	want := []string{"source_move:Search", "top_revenue:Email", "conversion_drop:/pricing", "new_referrer:new.example"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v", got)
	}
}

func TestNewReferrerSaysItsDay(t *testing.T) {
	got := Find(Input{Newcomers: []Newcomer{{"a.example", 30, "2026-09-12"}, {"b.example", 25, "2026-09-14"}}})
	if len(got) != 1 || got[0].Since != "2026-09-12" {
		t.Fatalf("got %+v", got)
	}
}

func TestDropStartIsWhereTheBuyingRateFell(t *testing.T) {
	// Ten days of 100 visitors: 5 sales a day for six days, then 1 a day.
	visitors := []int64{100, 100, 100, 100, 100, 100, 100, 100, 100, 100}
	sales := []int64{5, 5, 5, 5, 5, 5, 1, 1, 1, 1}
	if got := DropStart(visitors, sales); got != 6 {
		t.Fatalf("the fall starts on day 6, got %d", got)
	}
	// No fall, no day.
	if got := DropStart(visitors, []int64{3, 3, 3, 3, 3, 3, 3, 3, 3, 3}); got != -1 {
		t.Fatalf("flat: %d", got)
	}
	// A rise is not a drop.
	if got := DropStart(visitors, []int64{1, 1, 1, 1, 1, 1, 5, 5, 5, 5}); got != -1 {
		t.Fatalf("rising: %d", got)
	}
	// One quiet day at the end is not a side: each stretch holds a fifth of the visitors.
	if got := DropStart([]int64{100, 100, 100, 100, 5}, []int64{5, 5, 5, 5, 0}); got != -1 {
		t.Fatalf("a tail of 1%% of the visitors: %d", got)
	}
	if got := DropStart(nil, nil); got != -1 {
		t.Fatalf("empty: %d", got)
	}
	if got := DropStart([]int64{1, 2}, []int64{1}); got != -1 {
		t.Fatalf("mismatched: %d", got)
	}
}
