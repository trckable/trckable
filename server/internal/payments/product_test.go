package payments

import (
	"strings"
	"testing"
)

func firstPayment(t *testing.T, provider string, body string) Payment {
	t.Helper()
	ev, err := Registry[provider].Parse([]byte(body))
	if err != nil || len(ev.Payments) != 1 {
		t.Fatalf("%s parse: %v %+v", provider, err, ev)
	}
	return ev.Payments[0]
}

func TestMethodCode(t *testing.T) {
	for in, want := range map[string]string{
		"": "", "card": "card", "Credit": "card", "visa": "card", "paypal": "paypal", "apple_pay": "apple_pay", "Google Pay": "google_pay",
		"sepa_debit": "bank", "bancontact_card": "bank", "przelewy24": "bank", "unknown": "", "None": "", "offline": "", "us_bank_account": "bank", "ideal": "bank", "crypto": "crypto", "upi": "other", "link": "other",
	} {
		if got := MethodCode(in); got != want {
			t.Errorf("MethodCode(%q) = %q, want %q", in, got, want)
		}
	}
	if got := ProductName("  Pro \n plan  "); got != "Pro plan" {
		t.Errorf("ProductName = %q", got)
	}
	if got := ProductName(strings.Repeat("é", 200)); len([]rune(got)) != ProductMax {
		t.Errorf("ProductName kept %d characters", len([]rune(got)))
	}
}

func TestDodoNamesProductAndMethod(t *testing.T) {
	p := firstPayment(t, "dodo", `{"type":"payment.succeeded","timestamp":"2026-11-04T06:37:00Z","data":{"payment_id":"pay_1","status":"succeeded",
		"total_amount":1000,"currency":"USD","created_at":"2026-11-04T06:37:00Z","payment_method":"google_pay",
		"product_cart":[{"product_id":"pdt_1","name":"Starter","quantity":1}],"metadata":{}}}`)
	if p.Product != "Starter" || p.Method != "google_pay" {
		t.Fatalf("got %q %q", p.Product, p.Method)
	}
	p = firstPayment(t, "dodo", `{"type":"payment.succeeded","timestamp":"2026-11-04T06:37:00Z","data":{"payment_id":"pay_2","status":"succeeded",
		"total_amount":1000,"currency":"USD","created_at":"2026-11-04T06:37:00Z","product_cart":[{"product_id":"pdt_1","quantity":1}],"metadata":{}}}`)
	if p.Product != "" || p.Method != "" {
		t.Fatalf("a payload that doesn't say stays empty: %q %q", p.Product, p.Method)
	}
}

func TestStripeNamesMethodAndLineProduct(t *testing.T) {
	p := firstPayment(t, "stripe", `{"id":"evt_1","type":"payment_intent.succeeded","created":1758500000,"livemode":true,"data":{"object":
		{"id":"pi_1","amount_received":1000,"currency":"usd","payment_method_types":["card"]}}}`)
	if p.Method != "card" {
		t.Fatalf("method %q", p.Method)
	}
	p = firstPayment(t, "stripe", `{"id":"evt_2","type":"payment_intent.succeeded","created":1758500000,"livemode":true,"data":{"object":
		{"id":"pi_2","amount_received":1000,"currency":"usd","payment_method_types":["card","link"]}}}`)
	if p.Method != "" {
		t.Fatalf("several allowed types name no method: %q", p.Method)
	}
	ev, err := Registry["stripe"].Parse([]byte(`{"id":"evt_3","type":"invoice.paid","created":1758500000,"livemode":true,"data":{"object":
		{"id":"in_1","billing_reason":"subscription_cycle","customer":"cus_1","lines":{"data":[{"amount":1000,"description":"2 × Pro plan (at $5.00 / month)"}]}}}}`))
	if err != nil || len(ev.Hints) != 1 || ev.Hints[0].Product != "Pro plan" {
		t.Fatalf("invoice product: %v %+v", err, ev.Hints)
	}
	ev, err = Registry["stripe"].Parse([]byte(`{"id":"evt_4","type":"invoice.paid","created":1758500000,"livemode":true,"data":{"object":
		{"id":"in_2","billing_reason":"subscription_update","customer":"cus_1","amount_paid":2000,"lines":{"data":[
		{"amount":-900,"description":"Unused time on 1 × Pro (at $9.00 / month) after 16 Oct"},
		{"amount":2900,"description":"Remaining time on 1 × Business (at $29.00 / month) after 16 Oct"}]}}}}`))
	if err != nil || len(ev.Hints) != 1 || ev.Hints[0].Product != "Business" {
		t.Fatalf("proration product: %v %+v", err, ev.Hints)
	}
	p = firstPayment(t, "stripe", `{"id":"evt_5","type":"payment_intent.succeeded","created":1758500000,"livemode":true,"data":{"object":
		{"id":"pi_3","amount_received":1000,"currency":"usd","payment_method_types":["card","link"],"latest_charge":{"id":"ch_1","payment_method_details":{"type":"paypal"}}}}}`)
	if p.Method != "paypal" {
		t.Fatalf("an expanded charge names the method: %q", p.Method)
	}
	for in, want := range map[string]string{"Pro (at home)": "Pro (at home)", "1 × Team (at $9.00 / year)": "Team", "": "Plan"} {
		if got := lineProduct(in, "Plan"); got != want {
			t.Errorf("lineProduct(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestLemonSqueezyNamesProductAndMethod(t *testing.T) {
	p := firstPayment(t, "lemonsqueezy", `{"meta":{"event_name":"order_created"},"data":{"type":"orders","id":"7","attributes":{"currency":"USD","total":1000,"tax":0,"status":"paid",
		"created_at":"2026-11-04T06:37:00Z","updated_at":"2026-11-04T06:37:00Z","first_order_item":{"product_name":"Ebook"}}}}`)
	if p.Product != "Ebook" || p.Method != "" {
		t.Fatalf("order: %q %q", p.Product, p.Method)
	}
	p = firstPayment(t, "lemonsqueezy", `{"meta":{"event_name":"subscription_payment_success"},"data":{"type":"subscription-invoices","id":"9","attributes":{"currency":"USD","total":1000,"tax":0,
		"status":"paid","billing_reason":"renewal","card_brand":"visa","created_at":"2026-11-04T06:37:00Z","updated_at":"2026-11-04T06:37:00Z"}}}`)
	if p.Method != "card" {
		t.Fatalf("invoice method %q", p.Method)
	}
}

func TestGumroadNamesProductAndMethod(t *testing.T) {
	p := firstPayment(t, "gumroad", `{"resource_name":"sale","sale_id":"s1","price":500,"currency":"usd","sale_timestamp":"2026-11-04T06:37:00Z","product_name":"Course","card":{"type":"paypal"}}`)
	if p.Product != "Course" || p.Method != "paypal" {
		t.Fatalf("got %q %q", p.Product, p.Method)
	}
	p = firstPayment(t, "gumroad", "resource_name=sale&sale_id=s2&price=500&currency=usd&sale_timestamp=2026-11-04T06%3A37%3A00Z&product_name=Course&card%5Btype%5D=visa")
	if p.Product != "Course" || p.Method != "card" {
		t.Fatalf("form ping: %q %q", p.Product, p.Method)
	}
}

func TestPaddleNamesProductAndMethod(t *testing.T) {
	p := firstPayment(t, "paddle", `{"event_id":"e1","event_type":"transaction.completed","occurred_at":"2026-11-04T06:37:00Z","data":{"id":"txn_1","status":"completed","currency_code":"USD",
		"billed_at":"2026-11-04T06:37:00Z","items":[{"price":{"name":"Monthly"}}],
		"payments":[{"status":"error","method_details":{"type":"card"}},{"status":"captured","method_details":{"type":"apple_pay"}}],
		"details":{"line_items":[{"product":{"name":"Pro"}}],"totals":{"tax":"0","total":"1000","grand_total":"1000"}}}}`)
	if p.Product != "Pro" || p.Method != "apple_pay" {
		t.Fatalf("got %q %q", p.Product, p.Method)
	}
}

func TestPolarNamesProduct(t *testing.T) {
	p := firstPayment(t, "polar", `{"type":"order.paid","timestamp":"2026-11-04T06:37:00Z","data":{"id":"o1","status":"paid","paid":true,"total_amount":1000,"currency":"usd",
		"created_at":"2026-11-04T06:37:00Z","product":{"name":"Pro"}}}`)
	if p.Product != "Pro" {
		t.Fatalf("got %q", p.Product)
	}
}

func TestPayPalSaleUnderAnAgreementIsPaidWithPayPal(t *testing.T) {
	p := firstPayment(t, "paypal", `{"id":"WH-1","event_type":"PAYMENT.SALE.COMPLETED","create_time":"2026-11-04T06:37:00Z","resource":{"id":"S1","state":"completed",
		"amount":{"total":"10.00","currency":"USD"},"billing_agreement_id":"I-1","create_time":"2026-11-04T06:37:00Z"}}`)
	if p.Method != "paypal" || p.Product != "" {
		t.Fatalf("got %q %q", p.Method, p.Product)
	}
}
