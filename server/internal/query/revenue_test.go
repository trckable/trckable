package query

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/ledger"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/wal"
	"github.com/trckable/trckable/server/internal/writer"
)

// Payments on the golden site (USD, minor units), all worked out by hand:
//
//	A  15:05  $50.00          last non-direct visit: A1 Search (A3 at 15:00 was Direct)
//	B  11:30  $20.00, $5 refunded                     AI
//	?  12:30  $10.00          no visitor: unattributed
//	C  13:00  $7.00  renewal                          Search
//	D  Sep 11 $30.00          outside the Sep 10 report
func withPayments(q Q) Q {
	at := func(d, h, m int) time.Time { return time.Date(2026, 9, d, h, m, 0, 0, time.UTC) }
	facts := []ledger.Fact{
		{Provider: "stripe", ID: "pa", PaidAt: at(10, 15, 5), Amount: 5000, Visitor: 1, Customer: "stripe:ca", Kind: "one_time", Converted: true},
		{Provider: "stripe", ID: "pb", PaidAt: at(10, 11, 30), Amount: 2000, Refunded: 500, Visitor: 2, Customer: "stripe:cb", Kind: "subscription", Converted: true},
		{Provider: "stripe", ID: "px", PaidAt: at(10, 12, 30), Amount: 1000, Customer: "stripe:cx", Kind: "one_time", Converted: true},
		{Provider: "paddle", ID: "pc", PaidAt: at(10, 13, 0), Amount: 700, Visitor: 3, Customer: "paddle:cc", Kind: "renewal", Converted: true},
		{Provider: "stripe", ID: "pd", PaidAt: at(11, 3, 0), Amount: 3000, Visitor: 4, Customer: "stripe:cd", Kind: "one_time", Converted: true},
		// B's renewal 200 days later is still earned by B's AI visit.
		{Provider: "stripe", ID: "pb2", PaidAt: at(10, 11, 30).AddDate(0, 0, 200), TouchAt: at(10, 11, 30), Amount: 2000, Visitor: 2, Customer: "stripe:cb", Kind: "renewal", Converted: true},
	}
	q.Payments = func(_ context.Context, site, cur string, from, to time.Time, test bool) ([]ledger.Fact, bool, error) {
		var out []ledger.Fact
		for _, f := range facts {
			if !f.PaidAt.Before(from) && f.PaidAt.Before(to) {
				out = append(out, f)
			}
		}
		return out, true, nil
	}
	return q
}

func TestRevenueAttribution(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		q = withPayments(q)
		p := sep10
		p.Bucket, p.Currency, p.Revenue, p.Goals = "hour", "USD", true, true
		res, err := q.Report(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		m := res.Money
		if m == nil {
			t.Fatal("no money in the report")
		}
		eq(t, "revenue", m.Revenue, int64(8200))
		eq(t, "refunds", m.Refunds, int64(500))
		eq(t, "payments", m.Payments, int64(4))
		eq(t, "customers", m.Customers, int64(4))
		eq(t, "new revenue", m.NewRevenue, int64(7500))
		eq(t, "renewal revenue", m.RenewalRevenue, int64(700))
		eq(t, "unattributed", m.Unattributed, int64(1000))
		eq(t, "paying visitors", m.PayingVisitors, int64(3))
		eq(t, "conversion", m.Conversion, 1.0)
		eq(t, "exponent", m.Exponent, 2)

		ch := map[string]int64{}
		for _, r := range res.Dims["channel"] {
			if r.Revenue != nil {
				ch[r.Value] = *r.Revenue
			}
		}
		eq(t, "Search revenue (A's last non-direct visit + C)", ch["Search"], int64(5700))
		eq(t, "AI revenue", ch["AI"], int64(1500))
		eq(t, "Direct revenue", ch["Direct"], int64(0))
		eq(t, "top by revenue", res.RevenueDims["channel"][0].Value, "Search")
		eq(t, "Search payers", res.RevenueDims["channel"][0].Payers, int64(2))

		byHour := map[string]int64{}
		for _, pt := range res.Series {
			byHour[pt.T] = pt.Revenue
		}
		eq(t, "15:00 revenue", byHour["2026-09-10T15:00"], int64(5000))
		eq(t, "11:00 revenue", byHour["2026-09-10T11:00"], int64(1500))
		eq(t, "10:00 revenue", byHour["2026-09-10T10:00"], int64(0))

		// Filters narrow revenue to what the filtered visits earned.
		p.Filters = []Filter{{Dim: "channel", Value: "AI"}}
		ai, _ := q.Report(context.Background(), p)
		eq(t, "AI-filtered revenue", ai.Money.Revenue, int64(1500))
		eq(t, "AI-filtered unattributed", ai.Money.Unattributed, int64(0))
		p.Filters = []Filter{{Dim: "country", Value: "DE"}}
		de, _ := q.Report(context.Background(), p)
		eq(t, "DE-filtered revenue", de.Money.Revenue, int64(5000))
		p.Filters = []Filter{{Dim: "page", Value: "/blog"}}
		blog, _ := q.Report(context.Background(), p)
		eq(t, "/blog-filtered revenue", blog.Money.Revenue, int64(1500))

		// Per-day money for the scrubber, including a sale-only day.
		p.Filters, p.Bucket, p.Daily = nil, "day", true
		p.To = time.Date(2026, 9, 12, 0, 0, 0, 0, time.UTC)
		two, _ := q.Report(context.Background(), p)
		days := map[string]*DayMoney{}
		for _, d := range two.Days {
			if d.Money != nil {
				days[d.Date] = d.Money
			}
		}
		eq(t, "Sep 10", days["2026-09-10"].Revenue, int64(8200))
		eq(t, "Sep 11 (D, Email)", days["2026-09-11"].Revenue, int64(3000))
		// A day splits the same way the period does: C's $7 renewal, the rest new.
		eq(t, "Sep 10 renewal", days["2026-09-10"].Renewal, int64(700))
		eq(t, "Sep 10 new", days["2026-09-10"].New, int64(7500))
		eq(t, "the split adds up", days["2026-09-10"].New+days["2026-09-10"].Renewal, days["2026-09-10"].Revenue)
	})
}

func TestRenewalFollowsTheSubscriptionsVisit(t *testing.T) {
	q := withPayments(golden(t, false))
	p := Params{Site: "s1", From: time.Date(2027, 3, 1, 0, 0, 0, 0, time.UTC), To: time.Date(2027, 4, 30, 0, 0, 0, 0, time.UTC), Currency: "USD", Revenue: true, Goals: true, Bucket: "day"}
	res, err := q.Report(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "renewal revenue", res.Money.RenewalRevenue, int64(2000))
	eq(t, "unattributed", res.Money.Unattributed, int64(0))
	eq(t, "AI earned the renewal", *res.RevenueDims["channel"][0].Revenue, int64(2000))
	eq(t, "channel", res.RevenueDims["channel"][0].Value, "AI")
}

func TestNoPaymentsConnected(t *testing.T) {
	q := golden(t, false)
	q.Payments = func(context.Context, string, string, time.Time, time.Time, bool) ([]ledger.Fact, bool, error) {
		return nil, false, nil
	}
	res, err := q.Report(context.Background(), sep10)
	if err != nil || res.Money != nil {
		t.Fatalf("money without a connection: %+v %v", res.Money, err)
	}
}

// Which visit gets the credit. One visitor, found by Search in the morning and
// back through an AI assistant in the afternoon, then pays: first touch says
// Search found them, last touch says AI closed it. Same money either way.
func TestFirstTouchAndLastTouch(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	st, err := duck.Open(ctx, filepath.Join(dir, "a.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	lg, err := wal.Open(filepath.Join(dir, "wal"), wal.Options{NoSync: true})
	if err != nil {
		t.Fatal(err)
	}
	defer lg.Close()

	at := func(h, m int) time.Time { return time.Date(2026, 9, 10, h, m, 0, 0, time.UTC) }
	pv := func(h, m int, v uint64, id uint64, ch, ref string) event.Event {
		return event.Event{Site: "s1", Kind: event.KindPageview, TS: at(h, m).UnixMilli(), Visitor: v, Pageview: id, Path: "/", Channel: ch, RefHost: ref, Country: "DE", Device: "Desktop", FirstSeen: at(h, m).UnixMilli()}
	}
	evs := []event.Event{
		pv(9, 0, 1, 1, "Search", "google.com"), // found them
		pv(14, 0, 1, 2, "AI", "chatgpt.com"),   // brought them back
		pv(15, 0, 1, 3, "Direct", ""),          // and they returned by themselves
	}
	for i := range evs {
		evs[i].EventID = uint64(i + 1)
		b, _ := evs[i].Marshal()
		if _, err := lg.Append(ctx, b); err != nil {
			t.Fatal(err)
		}
	}
	clock := at(23, 0)
	w := writer.New(lg, st, writer.Options{FlushEvery: 10 * time.Millisecond, IdleClose: 30 * time.Millisecond, Now: func() time.Time { return clock }})
	wctx, cancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() { done <- w.Run(wctx) }()
	for w.Applied() < uint64(len(evs)) {
		time.Sleep(5 * time.Millisecond)
	}
	time.Sleep(100 * time.Millisecond)
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}

	q := Q{DB: st.DB, Open: w.OpenSessions}
	q.Payments = func(_ context.Context, _, _ string, _, _ time.Time, _ bool) ([]ledger.Fact, bool, error) {
		return []ledger.Fact{{Provider: "stripe", ID: "p1", PaidAt: at(16, 0), Amount: 9900, Visitor: 1, Customer: "stripe:c1", Kind: "one_time", Converted: true}}, true, nil
	}

	credited := func(model string) (map[string]int64, int64) {
		p := sep10
		p.Currency, p.Revenue, p.Attribution = "USD", true, model
		res, err := q.Report(ctx, p)
		if err != nil {
			t.Fatal(err)
		}
		ch := map[string]int64{}
		for _, r := range res.Dims["channel"] {
			if r.Revenue != nil && *r.Revenue > 0 {
				ch[r.Value] = *r.Revenue
			}
		}
		return ch, res.Money.Revenue
	}

	last, lastTotal := credited(LastTouch)
	first, firstTotal := credited(FirstTouch)
	if lastTotal != 9900 || firstTotal != 9900 {
		t.Fatalf("the model changed the money: last %d, first %d", lastTotal, firstTotal)
	}
	if last["AI"] != 9900 || len(last) != 1 {
		t.Errorf("last touch credited %v, want all of it to AI", last)
	}
	if first["Search"] != 9900 || len(first) != 1 {
		t.Errorf("first touch credited %v, want all of it to Search", first)
	}
	// Direct is never the answer while anything else is available.
	if last["Direct"]+first["Direct"] != 0 {
		t.Errorf("Direct took the credit: last %v, first %v", last, first)
	}
}
