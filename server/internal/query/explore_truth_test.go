package query

import (
	"context"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/ledger"
)

// Every figure Explore shows is one of these, so each is counted by hand on the
// golden site (Sep 10: visitors A, B, C; sessions A1, B, C, A3; D is Sep 11):
//
//	channel     Search A,C = 2   AI B = 1   Direct A3 = 1      (A is in two rows: rows add up to more than 3)
//	referrer    google.com A,C = 2   chatgpt.com B = 1
//	entry page  /: A = 1   /blog: B = 1   /pricing: C = 1
//	exit page   /: A,C = 2   /pricing: A = 1   /blog: B = 1
//	page        /: A,C = 2   /pricing: A,C = 2   /blog: B = 1  (every pageview, not just entries)
//	country     US: B,C = 2   DE: A = 1
//	device      Desktop: A,C = 2   Mobile: B = 1
//	browser, os, region, city, language, UTM, version, screen: nothing was recorded, so no row at all
func TestExploreBreakdownsAreTheHandCount(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		p := sep10
		p.Deep = true
		r, err := q.Report(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		want := map[string]map[string]int64{
			"channel":    {"Search": 2, "AI": 1, "Direct": 1},
			"referrer":   {"google.com": 2, "chatgpt.com": 1},
			"entry_page": {"/": 1, "/blog": 1, "/pricing": 1},
			"exit_page":  {"/": 2, "/pricing": 1, "/blog": 1},
			"page":       {"/": 2, "/pricing": 2, "/blog": 1},
			"country":    {"US": 2, "DE": 1},
			"device":     {"Desktop": 2, "Mobile": 1},
		}
		for dim, rows := range want {
			got := rowsOf(r.Dims[dim])
			for v, n := range rows {
				eq(t, dim+" "+v, got[v], n)
			}
			// Nothing else is in the list: a row that was not counted is not there.
			for v, n := range got {
				if _, ok := rows[v]; !ok && v != "" {
					t.Errorf("%s has a row %q (%d) the hand count does not", dim, v, n)
				}
			}
		}
		for _, dim := range []string{"browser", "os", "region", "city", "language", "source", "medium", "campaign", "screen"} {
			if n := len(r.Dims[dim]); n != 0 {
				t.Errorf("%s lists %d rows although nothing was recorded for it: %+v", dim, n, r.Dims[dim])
			}
		}
		// No row has more people than the period had.
		for dim, rows := range r.Dims {
			for _, row := range rows {
				if row.Visitors > r.KPIs.Visitors {
					t.Errorf("%s %q has %d people of %d", dim, row.Value, row.Visitors, r.KPIs.Visitors)
				}
			}
		}
		// A row is listed busiest first, and ties by name.
		for dim, rows := range r.Dims {
			for i := 1; i < len(rows); i++ {
				if rows[i].Visitors > rows[i-1].Visitors {
					t.Errorf("%s is not busiest first at %d", dim, i)
				}
			}
		}
	})
}

// The row limit is the caller's: Explore asks for all a report carries, the default stays ten.
func TestBreakdownLimit(t *testing.T) {
	q := golden(t, false)
	p := sep10
	p.Limit = 1
	one, err := q.Report(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "one channel", len(one.Dims["channel"]), 1)
	eq(t, "the busiest", one.Dims["channel"][0].Value, "Search")
	eq(t, "one page", len(one.Dims["page"]), 1)
	p.Limit = 100
	all, _ := q.Report(context.Background(), p)
	eq(t, "all three channels", len(all.Dims["channel"]), 3)
	eq(t, "all three pages", len(all.Dims["page"]), 3)
	p.Limit = 0
	def, _ := q.Report(context.Background(), p)
	eq(t, "default shows what there is under ten", len(def.Dims["channel"]), 3)
}

// The kinds a period took, before refunds, and the refunds, add up to its net revenue.
func TestMoneyKindsAddUpToTheNet(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		q = withPayments(q)
		p := sep10
		p.Currency, p.Revenue = "USD", true
		res, err := q.Report(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		m := res.Money
		// $50 and $20 and the $10 with no visit were taken new, $7 was a renewal, $5 was refunded.
		eq(t, "new gross", m.NewGross, int64(8000))
		eq(t, "upgrade gross", m.UpgradeGross, int64(0))
		eq(t, "renewal gross", m.RenewalGross, int64(700))
		eq(t, "refunds", m.Refunds, int64(500))
		eq(t, "the kinds less the refunds are the revenue", m.NewGross+m.UpgradeGross+m.RenewalGross-m.Refunds, m.Revenue)
	})
}

func TestAnUpgradeIsItsOwnKind(t *testing.T) {
	q := golden(t, false)
	at := func(h int) time.Time { return time.Date(2026, 9, 10, h, 0, 0, 0, time.UTC) }
	facts := []ledger.Fact{
		{Provider: "stripe", ID: "n", PaidAt: at(12), Amount: 2000, Visitor: 3, Customer: "stripe:c", Kind: "subscription", Change: "new", Converted: true},
		{Provider: "stripe", ID: "u", PaidAt: at(13), Amount: 900, Visitor: 3, Customer: "stripe:c", Kind: "renewal", Change: "upgrade", Converted: true},
		{Provider: "stripe", ID: "r", PaidAt: at(14), Amount: 300, Refunded: 300, Visitor: 2, Customer: "stripe:b", Kind: "one_time", Converted: true},
	}
	q.Payments = func(context.Context, string, string, time.Time, time.Time, bool) ([]ledger.Fact, bool, error) {
		return facts, true, nil
	}
	p := sep10
	p.Currency, p.Revenue = "USD", true
	res, err := q.Report(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	m := res.Money
	eq(t, "new gross (the refunded sale was taken whole)", m.NewGross, int64(2300))
	eq(t, "upgrade gross", m.UpgradeGross, int64(900))
	eq(t, "renewal gross", m.RenewalGross, int64(0))
	eq(t, "refunds", m.Refunds, int64(300))
	eq(t, "revenue", m.Revenue, int64(2900))
	eq(t, "the kinds less the refunds are the revenue", m.NewGross+m.UpgradeGross+m.RenewalGross-m.Refunds, m.Revenue)
}

// Revenue rides on the breakdowns a report attributes it to (the default ones), and on no other: the deep ones carry none, so a client does not show a column of zeros for them.
func TestRevenueIsOnTheAttributedBreakdownsOnly(t *testing.T) {
	q := withPayments(golden(t, false))
	p := sep10
	p.Currency, p.Revenue, p.Deep = "USD", true, true
	res, err := q.Report(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	for _, dim := range []string{"channel", "referrer", "country", "device"} {
		for _, row := range res.Dims[dim] {
			if row.Revenue == nil {
				t.Errorf("%s %q has no revenue although the report attributes it", dim, row.Value)
			}
		}
	}
	for _, dim := range DeepDims {
		for _, row := range res.Dims[dim] {
			if row.Revenue != nil {
				t.Errorf("%s %q has revenue the report does not attribute", dim, row.Value)
			}
		}
		if _, ok := res.RevenueDims[dim]; ok {
			t.Errorf("%s has a revenue list", dim)
		}
	}
	// What the countries earned is what the period took, less what no visit earned.
	var sum int64
	for _, row := range res.RevenueDims["country"] {
		sum += *row.Revenue
	}
	eq(t, "country revenue", sum, int64(5000+1500+700)) // A's $50 (DE), B's $15 net (US), C's $7 (US)
}
