package ledger

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/payments"
)

// A Dodo sale charged in pesos and settled in dollars is stored in dollars,
// while its refunds and disputes arrive in pesos: they remove the same share
// of the sale, never the peso number read as dollars.
func TestDodoRefundsInTheChargeCurrency(t *testing.T) {
	sale := `{"type":"payment.succeeded","timestamp":"2026-11-04T06:37:00Z","data":{"payment_id":"%s","status":"succeeded",
		"total_amount":11694,"tax":0,"currency":"MXN","settlement_amount":599,"settlement_tax":0,"settlement_currency":"USD",
		"created_at":"2026-11-04T06:37:00Z","customer":{"customer_id":"cus_1"},"metadata":{}}}`
	refund := `{"type":"refund.succeeded","timestamp":"2026-11-05T06:37:00Z","data":{"refund_id":"re_%s","payment_id":"%s","amount":%d,"currency":"%s","status":"succeeded","created_at":"2026-11-05T06:37:00Z"}}`
	lost := `{"type":"dispute.lost","timestamp":"2026-11-05T06:37:00Z","data":{"dispute_id":"dp_%s","payment_id":"%s","amount":"%d","currency":"%s","dispute_status":"dispute_lost"}}`
	cases := []struct {
		name string
		body string
		want int64
	}{
		{"partial refund in the charge currency", fmt.Sprintf(refund, "a", "a", 2000, "MXN"), 102},
		{"full refund in the charge currency", fmt.Sprintf(refund, "a", "a", 11694, "MXN"), 599},
		{"more than the charge stops at the sale", fmt.Sprintf(refund, "a", "a", 20000, "MXN"), 599},
		{"refund in the stored currency", fmt.Sprintf(refund, "a", "a", 200, "USD"), 200},
		{"dispute lost in the charge currency", fmt.Sprintf(lost, "a", "a", 2000, "MXN"), 102},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			db, rates := fresh(t)
			var evs []payments.Event
			for _, b := range []string{fmt.Sprintf(sale, "a"), c.body} {
				ev, err := payments.Registry["dodo"].Parse([]byte(b))
				if err != nil {
					t.Fatal(err)
				}
				evs = append(evs, ev)
			}
			apply(t, db, "dodo", evs, seq(len(evs)))
			facts, err := Facts(context.Background(), db, rates, "site1", "USD", time.Unix(0, 0), time.Now().AddDate(2, 0, 0), false)
			if err != nil || len(facts) != 1 {
				t.Fatalf("facts: %v %v", err, facts)
			}
			f := facts[0]
			if f.Refunded != c.want || f.Amount != 599 {
				t.Fatalf("amount %d refunded %d, want 599 and %d", f.Amount, f.Refunded, c.want)
			}
		})
	}
}

// A refund in a currency that is neither the stored one nor the charge is
// converted at the rate of the day it happened.
func TestRefundInAnotherCurrencyIsConverted(t *testing.T) {
	db, rates := fresh(t)
	ctx := context.Background()
	at := time.Date(2026, 11, 4, 10, 0, 0, 0, time.UTC).UnixMilli()
	evs := []payments.Event{
		{Key: "e1", At: at, Payments: []payments.Payment{{ID: "p1", PaidAt: at, Currency: "USD", Gross: 1000, Tax: ptr(0)}}},
		{Key: "e2", At: at, Refunds: []payments.Refund{{ID: "r1", PaymentID: "p1", Amount: 4000, Currency: "EUR", Status: payments.RefundSucceeded, At: at}}},
	}
	apply(t, db, "dodo", evs, seq(len(evs)))
	if _, err := db.Exec(`INSERT INTO fx_rates (day, currency, per_eur) VALUES ('2026-11-04', 'USD', 1.25)`); err != nil {
		t.Fatal(err)
	}
	if err := rates.Reload(ctx); err != nil {
		t.Fatal(err)
	}
	facts, err := Facts(ctx, db, rates, "site1", "USD", time.Unix(0, 0), time.Now().AddDate(2, 0, 0), false)
	if err != nil || len(facts) != 1 {
		t.Fatalf("facts: %v %v", err, facts)
	}
	if facts[0].Refunded != 1000 { // EUR 40.00 is USD 50.00, capped at the sale
		t.Fatalf("refunded %d, want 1000", facts[0].Refunded)
	}
}
