package query

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/ledger"
	"github.com/trckable/trckable/server/internal/store/duck"
)

type slowVisit struct {
	id      int
	page    string
	pvs     int
	goals   int
	channel string
	lcp     []int // one page view per entry; none = not measured
}

// slowSite seeds visits straight into the store, each with one page view per
// LCP it lists (the first on the visit's page).
func slowSite(t *testing.T, visits []slowVisit) Q {
	t.Helper()
	ctx := context.Background()
	st, err := duck.Open(ctx, filepath.Join(t.TempDir(), "s.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	seq := 0
	for _, v := range visits {
		if _, err := st.DB.ExecContext(ctx, `INSERT INTO sessions (site_id, session_id, visitor_id, start, last, channel, entry_page, device, pvs, goals, engaged_ms, dur)
			VALUES ('s1', ?, ?, TIMESTAMP '2026-09-20 10:00:00', TIMESTAMP '2026-09-20 10:01:00', ?, ?, 'Desktop', ?, ?, 0, 60)`, v.id, v.id, v.channel, v.page, v.pvs, v.goals); err != nil {
			t.Fatal(err)
		}
		for _, ms := range v.lcp {
			seq++
			pv := seq
			if _, err := st.DB.ExecContext(ctx, `INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, pageview_id, path)
				VALUES (?, 's1', TIMESTAMP '2026-09-20 10:00:00', 1, ?, ?, ?, ?)`, seq*10+1, v.id, v.id, pv, v.page); err != nil {
				t.Fatal(err)
			}
			// Two reports of the same view: the larger one is the final one.
			for _, m := range []int{ms / 2, ms} {
				seq++
				if _, err := st.DB.ExecContext(ctx, `INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, pageview_id, lcp_ms)
					VALUES (?, 's1', TIMESTAMP '2026-09-20 10:00:05', 3, ?, ?, ?, ?)`, seq*10+3, v.id, v.id, pv, m); err != nil {
					t.Fatal(err)
				}
			}
		}
	}
	return Q{DB: st.DB}
}

var slowPeriod = Params{Site: "s1", TZ: "UTC", Currency: "USD", From: time.Date(2026, 9, 20, 0, 0, 0, 0, time.UTC), To: time.Date(2026, 9, 21, 0, 0, 0, 0, time.UTC)}

func slowVisits() []slowVisit {
	return []slowVisit{
		// Slow: /heavy, 5 s. One visit read a fast page after it, which does not make it fast.
		{1, "/heavy", 1, 0, "Search", []int{5000}},
		{2, "/heavy", 1, 0, "Search", []int{5000}},
		{3, "/heavy", 2, 0, "Search", []int{5000, 800}},
		{4, "/heavy", 1, 1, "Search", []int{5000}},
		// Needs work: /mid, 3 s.
		{5, "/mid", 1, 0, "Direct", []int{3000}},
		{6, "/mid", 2, 0, "Direct", []int{3000}},
		{7, "/mid", 1, 0, "Direct", []int{3000}},
		// Fast: /quick, 1 s.
		{8, "/quick", 2, 1, "Direct", []int{1000}},
		{9, "/quick", 3, 0, "Direct", []int{1000}},
		{10, "/quick", 1, 0, "Direct", []int{1000}},
		// Not measured: in no band.
		{11, "/none", 1, 0, "Direct", nil},
	}
}

func band(c *SlowCost, name string) SlowBand {
	for _, b := range c.Bands {
		if b.Band == name {
			return b
		}
	}
	return SlowBand{}
}

func TestSlowCostBands(t *testing.T) {
	q := slowSite(t, slowVisits())
	c, err := q.SlowCostFor(context.Background(), slowPeriod)
	if err != nil {
		t.Fatal(err)
	}
	if c.Money {
		t.Fatal("money without a payment provider")
	}
	eq(t, "bands", len(c.Bands), 3)
	eq(t, "slowest first", c.Bands[0].Band, "slow")
	s, m, f := band(c, "slow"), band(c, "mid"), band(c, "fast")
	eq(t, "slow visits", s.Visits, int64(4))
	eq(t, "slow goals", s.Goals, int64(1))
	eq(t, "slow engaged", s.Engaged, int64(2)) // the two-page visit and the goal
	eq(t, "mid visits", m.Visits, int64(3))
	eq(t, "mid engaged", m.Engaged, int64(1))
	eq(t, "fast visits", f.Visits, int64(3))
	eq(t, "fast goals", f.Goals, int64(1))
	eq(t, "fast engaged", f.Engaged, int64(2))
	// The page of each band is the band its 75th percentile falls in; /heavy's
	// 800 ms view belongs to a visit that is slow, not to a page that is fast.
	eq(t, "slow pages", len(s.Pages), 1)
	eq(t, "slow page", s.Pages[0], "/heavy")
	eq(t, "mid page", m.Pages[0], "/mid")
	eq(t, "fast page", f.Pages[0], "/quick")
}

func TestSlowCostFilters(t *testing.T) {
	q := slowSite(t, slowVisits())
	p := slowPeriod
	p.Filters = []Filter{{Dim: "channel", Value: "Direct"}}
	c, err := q.SlowCostFor(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "slow visits from Direct", band(c, "slow").Visits, int64(0))
	eq(t, "mid visits from Direct", band(c, "mid").Visits, int64(3))
}

func TestSlowCostMoney(t *testing.T) {
	q := slowSite(t, slowVisits())
	at := time.Date(2026, 9, 20, 11, 0, 0, 0, time.UTC)
	facts := []ledger.Fact{
		{Provider: "stripe", ID: "a", PaidAt: at, Amount: 5000, Refunded: 1000, Visitor: 4, Customer: "c1", Kind: "one_time", Converted: true},
		{Provider: "stripe", ID: "b", PaidAt: at, Amount: 3000, Visitor: 8, Customer: "c2", Kind: "one_time", Converted: true},
		{Provider: "stripe", ID: "c", PaidAt: at, Amount: 2000, Visitor: 8, Customer: "c2", Kind: "one_time", Converted: true},
		{Provider: "stripe", ID: "d", PaidAt: at, Amount: 700, Customer: "c3", Kind: "one_time", Converted: true}, // no visit known
	}
	q.Payments = func(_ context.Context, _, _ string, from, to time.Time, test bool) ([]ledger.Fact, bool, error) {
		if test {
			return nil, true, nil
		}
		var out []ledger.Fact
		for _, f := range facts {
			if !f.PaidAt.Before(from) && f.PaidAt.Before(to) {
				out = append(out, f)
			}
		}
		return out, true, nil
	}
	p := slowPeriod
	p.Revenue = true
	c, err := q.SlowCostFor(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	if !c.Money {
		t.Fatal("no money with payments connected")
	}
	eq(t, "currency", c.Currency, "USD")
	eq(t, "exponent", c.Exponent, 2)
	s, f := band(c, "slow"), band(c, "fast")
	eq(t, "slow paid", s.Paid, int64(1))
	eq(t, "slow revenue (net of the refund)", s.Revenue, int64(4000))
	eq(t, "slow orders", s.Orders, int64(1))
	eq(t, "fast paid (one visit, two payments)", f.Paid, int64(1))
	eq(t, "fast revenue", f.Revenue, int64(5000))
	eq(t, "fast orders", f.Orders, int64(2))
	eq(t, "mid revenue", band(c, "mid").Revenue, int64(0))

	// The test switch reads the test payments, as the report does.
	p.Test = true
	c, err = q.SlowCostFor(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "test: money still on", c.Money, true)
	eq(t, "test: no test payments", band(c, "fast").Revenue, int64(0))

	// Money only while the revenue module is on.
	p.Test, p.Revenue = false, false
	c, err = q.SlowCostFor(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "module off: no money", c.Money, false)
	eq(t, "module off: no revenue", band(c, "fast").Revenue, int64(0))
}

func TestSlowCostNoVitals(t *testing.T) {
	q := slowSite(t, []slowVisit{{1, "/", 1, 0, "Direct", nil}})
	c, err := q.SlowCostFor(context.Background(), slowPeriod)
	if err != nil {
		t.Fatal(err)
	}
	for _, b := range c.Bands {
		eq(t, b.Band+" visits", b.Visits, int64(0))
	}
}
