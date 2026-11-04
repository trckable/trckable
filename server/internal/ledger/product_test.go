package ledger

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/payments"
)

// The product and the method reach the fact, from the payment or from a hint;
// an unknown method code is "other", a long name is cut, and a later event that
// doesn't say never blanks what an earlier one did.
func TestFactsCarryProductAndMethod(t *testing.T) {
	db, rates := fresh(t)
	ctx := context.Background()
	at := int64(1758500000000)
	evs := []payments.Event{
		{Key: "e1", At: at, Payments: []payments.Payment{
			{ID: "p1", PaidAt: at, Currency: "USD", Gross: 5000, Tax: ptr(0), Product: "Pro plan", Method: "apple_pay"},
			{ID: "p2", PaidAt: at, Currency: "USD", Gross: 2000, Tax: ptr(0), Method: "upi"},
			{ID: "p3", PaidAt: at, Currency: "USD", Gross: 900, Tax: ptr(0), Product: strings.Repeat("x", 300)},
		}},
		{Key: "e2", At: at, Hints: []payments.Hint{{PaymentID: "p2", Source: "invoice:in_1", Product: "Team", Method: "card"}}},
		{Key: "e3", At: at + 1, Payments: []payments.Payment{{ID: "p1", PaidAt: at, Currency: "USD", Gross: 5000, Tax: ptr(0)}}},
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
	got := map[string][2]string{}
	for _, f := range facts {
		got[f.ID] = [2]string{f.Product, f.Method}
	}
	want := map[string][2]string{
		"p1": {"Pro plan", "apple_pay"}, // the later event said nothing: kept
		"p2": {"Team", "other"},         // the payment's own method wins over the hint's
		"p3": {strings.Repeat("x", payments.ProductMax), ""},
	}
	for id, w := range want {
		if got[id] != w {
			t.Errorf("%s = %q, want %q", id, got[id], w)
		}
	}
}
