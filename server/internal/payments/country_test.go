package payments

import "testing"

func TestCountryCode(t *testing.T) {
	for in, want := range map[string]string{"de": "DE", " FR ": "FR", "": "", "Germany": "", "D": "", "1A": "", "ÄÖ": ""} {
		if got := CountryCode(in); got != want {
			t.Errorf("CountryCode(%q) = %q, want %q", in, got, want)
		}
	}
}

// Stripe names the billing country on the checkout session and on the invoice;
// Polar on the order. A payload without one leaves it empty.
func TestProvidersNameTheBillingCountry(t *testing.T) {
	cs, err := stripe{}.Parse([]byte(`{"id":"evt_1","type":"checkout.session.completed","created":1758500000,"livemode":true,"data":{"object":{
		"id":"cs_1","mode":"payment","payment_intent":"pi_1","customer_details":{"address":{"country":"nl"}}}}}`))
	if err != nil || len(cs.Hints) != 1 || cs.Hints[0].Country != "NL" {
		t.Fatalf("checkout session: %+v %v", cs.Hints, err)
	}
	none, _ := stripe{}.Parse([]byte(`{"id":"evt_2","type":"checkout.session.completed","created":1758500000,"livemode":true,"data":{"object":{
		"id":"cs_2","mode":"payment","payment_intent":"pi_2","customer_details":{"address":null}}}}`))
	if len(none.Hints) != 1 || none.Hints[0].Country != "" {
		t.Fatalf("no address: %+v", none.Hints)
	}
	inv, err := stripe{}.Parse([]byte(`{"id":"evt_3","type":"invoice.paid","created":1758500000,"livemode":true,"data":{"object":{
		"id":"in_1","billing_reason":"subscription_cycle","customer":"cus_1","customer_address":{"country":"SE"},"lines":{"data":[]}}}}`))
	if err != nil || len(inv.Hints) != 1 || inv.Hints[0].Country != "SE" {
		t.Fatalf("invoice: %+v %v", inv.Hints, err)
	}
	ord, err := polar{}.Parse([]byte(`{"type":"order.paid","timestamp":"2026-09-22T10:00:00Z","data":{
		"id":"ord_1","status":"paid","paid":true,"created_at":"2026-09-22T10:00:00Z","modified_at":"2026-09-22T10:00:00Z",
		"total_amount":4900,"tax_amount":0,"currency":"usd","billing_address":{"country":"ca"}}}`))
	if err != nil || len(ord.Payments) != 1 || ord.Payments[0].Country != "CA" {
		t.Fatalf("polar order: %+v %v", ord.Payments, err)
	}
}
