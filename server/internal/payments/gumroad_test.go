package payments

import (
	"net/http"
	"net/url"
	"testing"
	"time"
)

// A Gumroad sale ping, form-encoded the way Gumroad posts it (brackets nest).
func gumroadForm(extra url.Values) []byte {
	v := url.Values{
		"seller_id": {"sel1"}, "product_id": {"pr1"}, "product_name": {"Guide"}, "email": {"a@b.co"},
		"price": {"4900"}, "gumroad_fee": {"590"}, "currency": {"usd"}, "quantity": {"1"},
		"sale_id": {"gs_1"}, "sale_timestamp": {"2026-09-01T09:00:00Z"},
		"url_params[trckable_vid]": {"gum42.q"}, "card[type]": {"visa"},
		"refunded": {"false"}, "disputed": {"false"}, "dispute_won": {"false"},
	}
	for k, vs := range extra {
		v[k] = vs
	}
	return []byte(v.Encode())
}

func TestGumroadVerifyComparesTheUrlToken(t *testing.T) {
	g := gumroad{}
	ok := http.Header{PingTokenHeader: {"s3cret-token"}}
	if err := g.Verify(ok, nil, "s3cret-token", time.Now()); err != nil {
		t.Fatalf("right token refused: %v", err)
	}
	for name, c := range map[string]struct {
		h      http.Header
		secret string
	}{
		"wrong token":      {http.Header{PingTokenHeader: {"s3cret-tokex"}}, "s3cret-token"},
		"shorter token":    {http.Header{PingTokenHeader: {"s3cret"}}, "s3cret-token"},
		"no token":         {http.Header{}, "s3cret-token"},
		"no secret stored": {ok, ""},
		"empty both":       {http.Header{PingTokenHeader: {""}}, ""},
	} {
		if err := g.Verify(c.h, []byte("price=1"), c.secret, time.Now()); err != ErrSignature {
			t.Errorf("%s: err = %v, want ErrSignature", name, err)
		}
	}
}

func TestGumroadSaleFormPing(t *testing.T) {
	ev, err := (gumroad{}).Parse(gumroadForm(nil))
	if err != nil || len(ev.Payments) != 1 || len(ev.Refunds) != 0 || len(ev.Disputes) != 0 {
		t.Fatalf("%+v %v", ev, err)
	}
	p := ev.Payments[0]
	if p.ID != "gs_1" || p.Gross != 4900 || p.Currency != "USD" || p.Visitor != ParseVisitor("gum42.q") || p.Kind != KindOneTime || p.Email != "a@b.co" || ev.Key != "sale:gs_1" || ev.Test {
		t.Fatalf("payment: %+v key %q", p, ev.Key)
	}
	if p.PaidAt != time.Date(2026, 9, 1, 9, 0, 0, 0, time.UTC).UnixMilli() {
		t.Fatalf("paid at %d", p.PaidAt)
	}
}

func TestGumroadRefundDisputeAndOrdering(t *testing.T) {
	sale, _ := (gumroad{}).Parse(gumroadForm(nil))
	refund, _ := (gumroad{}).Parse(gumroadForm(url.Values{"resource_name": {"refund"}, "refunded": {"true"}}))
	lost, _ := (gumroad{}).Parse(gumroadForm(url.Values{"resource_name": {"dispute"}, "disputed": {"true"}}))
	won, _ := (gumroad{}).Parse(gumroadForm(url.Values{"resource_name": {"dispute_won"}, "disputed": {"true"}, "dispute_won": {"true"}}))
	if len(refund.Refunds) != 1 || refund.Refunds[0].Amount != 4900 || !refund.Refunds[0].Cumulative || refund.Refunds[0].PaymentID != "gs_1" {
		t.Fatalf("refund %+v", refund.Refunds)
	}
	if len(lost.Disputes) != 1 || lost.Disputes[0].Status != DisputeLost || len(won.Disputes) != 1 || won.Disputes[0].Status != DisputeWon || won.Disputes[0].ID != lost.Disputes[0].ID {
		t.Fatalf("disputes %+v %+v", lost.Disputes, won.Disputes)
	}
	// Every state follows the one before it in time, whatever order they arrive in.
	if !(sale.At < refund.At && refund.At < lost.At && lost.At < won.At) {
		t.Fatalf("times %d %d %d %d", sale.At, refund.At, lost.At, won.At)
	}
	// A retry is the same event key: stored once.
	again, _ := (gumroad{}).Parse(gumroadForm(url.Values{"resource_name": {"refund"}, "refunded": {"true"}}))
	if again.Key != refund.Key || refund.Key == sale.Key {
		t.Fatalf("keys %q %q %q", again.Key, refund.Key, sale.Key)
	}
}

func TestGumroadSubscriptionAndTestSale(t *testing.T) {
	first, _ := (gumroad{}).Parse(gumroadForm(url.Values{"subscription_id": {"gsub_1"}, "purchaser_id": {"gp_1"}}))
	renewal, _ := (gumroad{}).Parse(gumroadForm(url.Values{"sale_id": {"gs_2"}, "subscription_id": {"gsub_1"}, "is_recurring_charge": {"true"}, "url_params[trckable_vid]": {""}}))
	if first.Payments[0].Kind != KindSubscription || renewal.Payments[0].Kind != KindRenewal || first.Payments[0].SubscriptionID != "gsub_1" {
		t.Fatalf("%+v %+v", first.Payments, renewal.Payments)
	}
	if len(first.Links) != 2 {
		t.Fatalf("links %+v", first.Links)
	}
	test, _ := (gumroad{}).Parse(gumroadForm(url.Values{"test": {"true"}}))
	if !test.Test {
		t.Fatal("the seller's own purchase is test money")
	}
}

func TestGumroadIgnoresWhatIsNotMoney(t *testing.T) {
	for name, extra := range map[string]url.Values{
		"free sale":         {"price": {"0"}},
		"negative price":    {"price": {"-5"}},
		"no price":          {"price": {""}},
		"no currency":       {"currency": {""}},
		"currency garbage":  {"currency": {"us"}},
		"currency digits":   {"currency": {"u5d"}},
		"cancellation ping": {"resource_name": {"cancellation"}},
		"no sale id":        {"sale_id": {""}},
	} {
		ev, err := (gumroad{}).Parse(gumroadForm(extra))
		if err != nil || len(ev.Payments)+len(ev.Refunds)+len(ev.Disputes) != 0 {
			t.Errorf("%s: %+v %v", name, ev, err)
		}
	}
	// Someone else's reference is no visitor.
	ev, _ := (gumroad{}).Parse(gumroadForm(url.Values{"url_params[trckable_vid]": {""}, "url_params[reference_id]": {"order_77"}}))
	if len(ev.Payments) != 1 || ev.Payments[0].Visitor != 0 {
		t.Fatalf("%+v", ev.Payments)
	}
	if _, err := (gumroad{}).Parse([]byte(`{"price":`)); err == nil {
		t.Fatal("broken JSON accepted")
	}
}

func TestGumroadJSONPing(t *testing.T) {
	ev, err := (gumroad{}).Parse([]byte(`{"sale_id":"gs_9","price":1500,"currency":"eur","sale_timestamp":"2026-09-01T09:00:00Z","url_params":{"trckable_vid":"abc12"},"refunded":false}`))
	if err != nil || len(ev.Payments) != 1 || ev.Payments[0].Gross != 1500 || ev.Payments[0].Currency != "EUR" || ev.Payments[0].Visitor == 0 {
		t.Fatalf("%+v %v", ev, err)
	}
}
