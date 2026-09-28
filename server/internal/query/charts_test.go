package query

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
)

// The golden site, Sep 10 (see golden): four visits by three visitors.
//
//	A1 10:00 Search  / → /pricing → signup     (first seen in January)
//	B  11:00 AI      /blog                     (new)
//	C  12:00 Search  /pricing → /              (new)
//	A3 15:00 Direct  /
func TestSourcesOverTime(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		p := sep10
		p.Bucket = "hour"
		c, err := q.ChartsFor(context.Background(), p, "")
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "hourly buckets", len(c.Labels), 24)
		eq(t, "bands", len(c.Sources), 3)
		eq(t, "busiest band", c.Sources[0].Channel, "Search")
		eq(t, "search visits", c.Sources[0].Total, int64(2))
		eq(t, "search at 10:00", c.Sources[0].Values[10], int64(1))
		eq(t, "search at 12:00", c.Sources[0].Values[12], int64(1))
		by := map[string]SourceBand{}
		var sum int64
		for _, b := range c.Sources {
			by[b.Channel] = b
			sum += b.Total
		}
		eq(t, "AI at 11:00", by["AI"].Values[11], int64(1))
		eq(t, "Direct at 15:00", by["Direct"].Values[15], int64(1))
		eq(t, "bands add up to the visits", sum, int64(4))
	})
}

func TestNewVsReturning(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		c, err := q.ChartsFor(context.Background(), sep10, "")
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "one day", len(c.Labels), 1)
		eq(t, "new", c.Visitors.New[0], int64(2))             // B and C
		eq(t, "returning", c.Visitors.Returning[0], int64(1)) // A, twice, counted once
		eq(t, "unknown", c.Visitors.Unknown, int64(0))
	})
}

func TestPageFlow(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		c, err := q.ChartsFor(context.Background(), sep10, "")
		if err != nil {
			t.Fatal(err)
		}
		f := c.Flow
		eq(t, "visits", f.Visits, int64(4))
		first := map[string]int64{}
		for _, n := range f.Steps[0] {
			first[n.Path] = n.Visits
		}
		eq(t, "entered on /", first["/"], int64(2))
		eq(t, "entered on /pricing", first["/pricing"], int64(1))
		eq(t, "entered on /blog", first["/blog"], int64(1))
		links := map[string]int64{}
		for _, l := range f.Links {
			links[fmt.Sprintf("%s → %s@%d", l.From, l.To, l.Step)] = l.Visits
		}
		eq(t, "/ → /pricing", links["/ → /pricing@0"], int64(1))
		eq(t, "/ → exit", links["/ → (exit)@0"], int64(1))
		eq(t, "/pricing → /", links["/pricing → /@0"], int64(1))
		eq(t, "/blog → exit", links["/blog → (exit)@0"], int64(1))
		eq(t, "/pricing → exit, third step", links["/pricing → (exit)@1"], int64(1))
		eq(t, "/ → exit, third step", links["/ → (exit)@1"], int64(1))
		exits := f.Steps[1][len(f.Steps[1])-1]
		eq(t, "exit sorts last", exits.Kind, FlowExit)
		eq(t, "left after one page", exits.Visits, int64(2))

		// Filters narrow the flow like every other card.
		p := sep10
		p.Filters = []Filter{{Dim: "channel", Value: "AI"}}
		ai, err := q.ChartsFor(context.Background(), p, "")
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "AI visits", ai.Flow.Visits, int64(1))
	})
}

func TestFlowFoldsQuietPagesIntoOther(t *testing.T) {
	rows := [][3]string{{"/a"}, {"/b"}, {"/c"}, {"/d"}, {"/e"}, {"/f"}, {"/a"}}
	f := buildFlow(func(yield func([3]sql.NullString, int64)) {
		for _, r := range rows {
			yield([3]sql.NullString{{String: r[0], Valid: true}}, 1)
		}
	})
	eq(t, "named plus other", len(f.Steps[0]), FlowWidth+1)
	eq(t, "busiest first", f.Steps[0][0].Path, "/a")
	eq(t, "other last", f.Steps[0][FlowWidth].Kind, FlowOther)
	eq(t, "other visits", f.Steps[0][FlowWidth].Visits, int64(2)) // /e and /f
}

func TestConversionAndTimeToConvert(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		q = withPayments(q)
		p := sep10
		p.Revenue = true
		c, err := q.ChartsFor(context.Background(), p, "")
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "steps", len(c.Conversion), 3)
		eq(t, "visitors", c.Conversion[0].Visitors, int64(3))
		eq(t, "goal picked", c.Conversion[1].Value, "signup")
		eq(t, "signed up", c.Conversion[1].Visitors, int64(1))
		eq(t, "then paid", c.Conversion[2].Visitors, int64(1)) // A at 15:05; B paid but never signed up
		eq(t, "sale rate", c.Conversion[2].Rate, 1.0)

		// A first came in January: 15+ days. B paid 30 minutes into their only visit.
		spans := map[string]int64{}
		for _, s := range c.ToConvert {
			spans[s.Span] = s.Sales
		}
		eq(t, "same visit", spans["visit"], int64(1))
		eq(t, "15+ days", spans["more"], int64(1))
		eq(t, "renewals and unknown buyers left out", spans["3d"]+spans["7d"]+spans["14d"], int64(0))

		// Without goals the funnel is visit → sale, over every buyer.
		p.Goals = false
		c, err = q.ChartsFor(context.Background(), p, "")
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "two steps", len(c.Conversion), 2)
		eq(t, "buyers", c.Conversion[1].Visitors, int64(2)) // A and B; C's renewal is not a sale
	})
}

func TestChartsWithoutMoney(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		c, err := q.ChartsFor(context.Background(), sep10, "signup")
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "visit → goal", len(c.Conversion), 2)
		if c.ToConvert != nil {
			t.Error("time to convert without payments")
		}
		p := sep10
		p.Goals = false
		c, err = q.ChartsFor(context.Background(), p, "")
		if err != nil {
			t.Fatal(err)
		}
		if c.Conversion != nil {
			t.Errorf("a one-step funnel: %+v", c.Conversion)
		}
	})
}
