package payments

import "testing"

// A buyer charged in their own currency: the revenue is what the merchant
// receives (the settlement), not the local total converted back later.
func TestDodoCountsTheSettlement(t *testing.T) {
	body := []byte(`{"type":"payment.succeeded","timestamp":"2026-11-04T06:37:00Z","data":{"payment_id":"pay_mx","status":"succeeded",
		"total_amount":11694,"tax":0,"currency":"MXN","settlement_amount":599,"settlement_tax":0,"settlement_currency":"USD",
		"created_at":"2026-11-04T06:37:00Z","customer":{"customer_id":"cus_1"},"metadata":{}}}`)
	ev, err := Registry["dodo"].Parse(body)
	if err != nil || len(ev.Payments) != 1 {
		t.Fatalf("parse: %v %+v", err, ev)
	}
	p := ev.Payments[0]
	if p.Currency != "USD" || p.Gross != 599 || p.Tax == nil || *p.Tax != 0 {
		t.Fatalf("got %s %d %v, want USD 599 tax 0", p.Currency, p.Gross, p.Tax)
	}

	// Without a settlement (older payloads), the buyer's total stays.
	body = []byte(`{"type":"payment.succeeded","timestamp":"2026-11-04T06:37:00Z","data":{"payment_id":"pay_us","status":"succeeded",
		"total_amount":1000,"tax":100,"currency":"USD","created_at":"2026-11-04T06:37:00Z","metadata":{}}}`)
	ev, _ = Registry["dodo"].Parse(body)
	if p := ev.Payments[0]; p.Currency != "USD" || p.Gross != 1000 || *p.Tax != 100 {
		t.Fatalf("fallback: got %s %d %v", p.Currency, p.Gross, p.Tax)
	}
}
