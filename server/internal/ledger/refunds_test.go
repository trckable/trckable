package ledger

import (
	"context"
	"math"
	"math/rand"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/payments"
)

// The billing country a provider names reaches the fact, from the payment or
// from a hint, and is empty when it was no country code; the refund time is
// the latest refund that did not fail, or a lost dispute.
func TestFactsCarryCountryAndRefundTime(t *testing.T) {
	db, rates := fresh(t)
	ctx := context.Background()
	at := int64(1758500000000)
	evs := []payments.Event{
		{Key: "e1", At: at, Payments: []payments.Payment{
			{ID: "p1", PaidAt: at, Currency: "USD", Gross: 5000, Tax: ptr(0), Country: "de"},
			{ID: "p2", PaidAt: at, Currency: "USD", Gross: 2000, Tax: ptr(0)},
			{ID: "p3", PaidAt: at, Currency: "USD", Gross: 900, Tax: ptr(0), Country: "Germany"},
		}},
		{Key: "e2", At: at, Hints: []payments.Hint{{PaymentID: "p2", Source: "checkout:cs_1", Country: "fr"}}},
		{Key: "e3", At: at, Refunds: []payments.Refund{
			{ID: "r1", PaymentID: "p1", Amount: 1000, Currency: "USD", Status: payments.RefundSucceeded, At: at + 1000},
			{ID: "r2", PaymentID: "p1", Amount: 500, Currency: "USD", Status: payments.RefundSucceeded, At: at + 5000},
			{ID: "r3", PaymentID: "p1", Amount: 300, Currency: "USD", Status: payments.RefundFailed, At: at + 9000},
		}},
		{Key: "e4", At: at, Disputes: []payments.Dispute{{ID: "d1", PaymentID: "p2", Amount: 2000, Currency: "USD", Status: "lost", At: at + 7000}}},
	}
	apply(t, db, "stripe", evs, seq(len(evs)))
	if _, err := db.Exec(`INSERT INTO fx_rates (day, currency, per_eur) VALUES ('2025-09-22', 'USD', 1.2)`); err != nil {
		t.Fatal(err)
	}
	if err := rates.Reload(ctx); err != nil {
		t.Fatal(err)
	}
	facts, err := Facts(ctx, db, rates, "site1", "USD", time.Unix(0, 0), time.UnixMilli(at).Add(24*time.Hour), false)
	if err != nil {
		t.Fatal(err)
	}
	by := map[string]Fact{}
	for _, f := range facts {
		by[f.ID] = f
	}
	for id, want := range map[string]string{"p1": "DE", "p2": "FR", "p3": ""} {
		if by[id].Country != want {
			t.Errorf("%s country = %q, want %q", id, by[id].Country, want)
		}
	}
	// Each refund at its own time: p1 gave back $10 then $5 (the failed one never counts), p2 lost $20 in a dispute.
	rows := func(id string) (out []int64) {
		for _, r := range by[id].Refunds {
			out = append(out, r.At.UnixMilli()-at, r.Amount)
		}
		return
	}
	for id, want := range map[string][]int64{"p1": {1000, 1000, 5000, 500}, "p2": {7000, 2000}, "p3": nil} {
		got := rows(id)
		if len(got) != len(want) {
			t.Fatalf("%s refunds %v, want %v", id, got, want)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Errorf("%s refunds %v, want %v", id, got, want)
				break
			}
		}
	}
}

// One sale, two refunds in different months: each month gets its own, not the
// whole of it dated by the last.
func TestRefundsLandInTheirOwnPeriod(t *testing.T) {
	db, rates := fresh(t)
	ctx := context.Background()
	d := func(m time.Month, day int) int64 { return time.Date(2025, m, day, 12, 0, 0, 0, time.UTC).UnixMilli() }
	if _, err := db.Exec(`INSERT INTO fx_rates (day, currency, per_eur) VALUES ('2025-08-20', 'USD', 1.2)`); err != nil {
		t.Fatal(err)
	}
	if err := rates.Reload(ctx); err != nil {
		t.Fatal(err)
	}
	evs := []payments.Event{
		{Key: "e1", At: d(8, 20), Payments: []payments.Payment{{ID: "p1", PaidAt: d(8, 20), Currency: "USD", Gross: 5000, Tax: ptr(0)}}},
		{Key: "e2", At: d(9, 5), Refunds: []payments.Refund{{ID: "r1", PaymentID: "p1", Amount: 2000, Currency: "USD", Status: payments.RefundSucceeded, At: d(9, 5)}}},
		{Key: "e3", At: d(10, 3), Refunds: []payments.Refund{{ID: "r2", PaymentID: "p1", Amount: 1000, Currency: "USD", Status: payments.RefundSucceeded, At: d(10, 3)}}},
	}
	apply(t, db, "stripe", evs, seq(len(evs)))
	m := func(mo time.Month) time.Time { return time.UnixMilli(d(mo, 1)).UTC().Truncate(24 * time.Hour) }
	for name, c := range map[string]struct {
		from, to time.Time
		want     int64
	}{"September": {m(9), m(10), 2000}, "October": {m(10), m(11), 1000}, "August": {m(8), m(9), 0}} {
		facts, err := FactsRefundedIn(ctx, db, rates, "site1", "USD", c.from, c.to, false)
		if err != nil {
			t.Fatal(err)
		}
		var got int64
		for _, r := range RefundsIn("site1", facts, c.from, c.to) {
			got += r.Amount
		}
		if got != c.want {
			t.Errorf("%s: %d went back, want %d", name, got, c.want)
		}
	}
	all, _ := Facts(ctx, db, rates, "site1", "USD", time.Unix(0, 0), time.UnixMilli(d(12, 1)), false)
	if len(all) != 1 || all[0].Refunded != 3000 {
		t.Fatalf("the sale's own total is untouched: %+v", all)
	}
}

func TestRefundsIn(t *testing.T) {
	d := func(day int) time.Time { return time.Date(2026, 9, day, 12, 0, 0, 0, time.UTC) }
	facts := []Fact{
		{Provider: "stripe", ID: "a", Kind: "one_time", Country: "DE", Refunds: []RefundAt{{At: d(3), Amount: 500}, {At: d(1), Amount: 800}}},
		{Provider: "stripe", ID: "b", Kind: "subscription", Refunds: []RefundAt{{At: d(5), Amount: 1500}}},
		{Provider: "stripe", ID: "c", Refunds: []RefundAt{{At: d(4), Amount: 0}}}, // nothing went back
		{Provider: "stripe", ID: "d"},
		{Provider: "stripe", ID: "e", Refunds: []RefundAt{{At: d(10), Amount: 700}}}, // after the period
	}
	got := RefundsIn("s1", facts, d(2).Add(-12*time.Hour), d(8))
	if len(got) != 2 || got[0].Amount != 1500 || got[1].Amount != 500 {
		t.Fatalf("got %+v, want the two refunds in range, newest first", got)
	}
	if got[1].Country != "DE" || got[0].Kind != "subscription" {
		t.Errorf("country and kind lost: %+v", got)
	}
	if got[0].ID == "" || got[0].ID == got[1].ID || got[0].ID == "b" {
		t.Errorf("ids must tell rows apart without naming the payment: %+v", got)
	}
	if len(RefundsIn("s1", nil, d(1), d(8))) != 0 {
		t.Error("no facts, no refunds")
	}
}

// A refund that fails after the running total was reported lowers it: that
// moment is a negative row, and the rows still add up to what is refunded.
func TestFailedRefundIsItsOwnNegativeRow(t *testing.T) {
	evs := []refEv{
		{at: 1, amount: 100, cum: true, version: 1},
		{at: 2, amount: 40, failed: true, version: 2},
		{at: 3, amount: 120, cum: true, version: 3},
	}
	rows := refundSteps(evs, func(b int64) int64 { return b })
	var got []int64
	var sum int64
	for _, r := range rows {
		got = append(got, r.Amount)
		sum += r.Amount
	}
	if len(got) != 3 || got[0] != 100 || got[1] != -40 || got[2] != 60 || sum != 120 {
		t.Fatalf("rows %v (sum %d), want [100 -40 60] adding up to 120", got, sum)
	}
}

// Whatever the events and in whatever order they come, the rows add up to the
// payment's refunded total.
func TestRefundRowsAlwaysAddUp(t *testing.T) {
	rnd := rand.New(rand.NewSource(7))
	conv := func(b int64) int64 { return MulDiv(min(b, 1000), 5, 7) } // capped and rounded, like the real conversion
	for n := 0; n < 2000; n++ {
		var evs []refEv
		for i := rnd.Intn(8); i >= 0; i-- {
			evs = append(evs, refEv{at: int64(rnd.Intn(6)), amount: int64(rnd.Intn(400)), version: int64(rnd.Intn(8)),
				cum: rnd.Intn(3) == 0, failed: rnd.Intn(4) == 0, lost: rnd.Intn(8) == 0})
		}
		var sum int64
		for _, r := range refundSteps(evs, conv) {
			sum += r.Amount
		}
		if want := conv(refundedAt(evs, math.MaxInt64)); sum != want {
			t.Fatalf("%+v: rows add up to %d, refunded is %d", evs, sum, want)
		}
	}
}
