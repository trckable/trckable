package ledger

import (
	"context"
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
	if got, want := by["p1"].RefundedAt, time.UnixMilli(at+5000).UTC(); !got.Equal(want) {
		t.Errorf("p1 refunded at %v, want %v (the failed refund does not count)", got, want)
	}
	if got, want := by["p2"].RefundedAt, time.UnixMilli(at+7000).UTC(); !got.Equal(want) {
		t.Errorf("p2 refunded at %v, want %v (a lost dispute)", got, want)
	}
	if !by["p3"].RefundedAt.IsZero() {
		t.Errorf("p3 was never refunded: %v", by["p3"].RefundedAt)
	}
}

func TestRefundsIn(t *testing.T) {
	d := func(day int) time.Time { return time.Date(2026, 9, day, 12, 0, 0, 0, time.UTC) }
	facts := []Fact{
		{Provider: "stripe", ID: "a", Refunded: 500, RefundedAt: d(3), Kind: "one_time", Country: "DE"},
		{Provider: "stripe", ID: "b", Refunded: 1500, RefundedAt: d(5), Kind: "subscription"},
		{Provider: "stripe", ID: "c", Refunded: 0, RefundedAt: d(4)},    // nothing went back
		{Provider: "stripe", ID: "d", Refunded: 100},                    // no time known
		{Provider: "stripe", ID: "e", Refunded: 700, RefundedAt: d(10)}, // after the period
		{Provider: "stripe", ID: "f", Refunded: 800, RefundedAt: d(1)},  // before it
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
