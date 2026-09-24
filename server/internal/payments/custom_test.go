package payments

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"testing"
	"time"
)

const customSecret = "whsec_trckable_test_secret"

func signCustom(t *testing.T, body string, at time.Time) http.Header {
	t.Helper()
	ts := strconv.FormatInt(at.Unix(), 10)
	m := hmac.New(sha256.New, []byte(customSecret))
	m.Write([]byte(ts + "." + body))
	h := http.Header{}
	h.Set("Trckable-Timestamp", ts)
	h.Set("Trckable-Signature", "v1="+hex.EncodeToString(m.Sum(nil)))
	return h
}

// Anyone can report a sale, as long as they hold the secret.
func TestCustomWebhook(t *testing.T) {
	p := Registry["custom"]
	now := time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC)
	body := `{"id":"evt_1","type":"payment","at":"2026-09-22T11:59:00Z","payment":{
		"id":"ord_1","amount":4900,"tax":800,"currency":"eur","kind":"subscription",
		"customer_id":"cus_9","subscription_id":"sub_9","email":"Them@Company.com","visitor":"trckable_1z_5"}}`

	if err := p.Verify(signCustom(t, body, now), []byte(body), customSecret, now); err != nil {
		t.Fatalf("verify: %v", err)
	}
	// Every way of getting it wrong is still wrong.
	if err := p.Verify(signCustom(t, body, now), []byte(body+" "), customSecret, now); err == nil {
		t.Error("a changed body verified")
	}
	if err := p.Verify(signCustom(t, body, now), []byte(body), "another secret", now); err == nil {
		t.Error("the wrong secret verified")
	}
	if err := p.Verify(signCustom(t, body, now.Add(-time.Hour)), []byte(body), customSecret, now); err != ErrStale {
		t.Error("an hour-old signature was accepted")
	}
	if err := p.Verify(http.Header{}, []byte(body), customSecret, now); err != ErrSignature {
		t.Error("an unsigned request was accepted")
	}
	if err := p.Verify(signCustom(t, body, now), []byte(body), "", now); err != ErrSignature {
		t.Error("an empty secret accepted anything")
	}

	ev, err := p.Parse([]byte(body))
	if err != nil {
		t.Fatal(err)
	}
	if ev.Key != "evt_1" || len(ev.Payments) != 1 {
		t.Fatalf("event: %+v", ev)
	}
	pay := ev.Payments[0]
	if pay.ID != "ord_1" || pay.Gross != 4900 || pay.Tax == nil || *pay.Tax != 800 {
		t.Fatalf("payment: %+v", pay)
	}
	if pay.Currency != "EUR" {
		t.Errorf("currency was not normalised: %q", pay.Currency)
	}
	if pay.Kind != KindSubscription {
		t.Errorf("kind: %q", pay.Kind)
	}
	if pay.Visitor != 71 { // base 36 "1z"
		t.Errorf("visitor: %d", pay.Visitor)
	}
	if pay.PaidAt != time.Date(2026, 9, 22, 11, 59, 0, 0, time.UTC).UnixMilli() {
		t.Errorf("paid at: %d", pay.PaidAt)
	}
	if len(ev.Links) != 2 {
		t.Errorf("the customer and subscription were not linked: %+v", ev.Links)
	}

	// Unix seconds and milliseconds work as well as RFC 3339, and a missing
	// event id still dedupes on what the event is about.
	ev, err = p.Parse([]byte(`{"type":"refund","at":1758542340,"refund":{"id":"re_1","payment_id":"ord_1","amount":1000,"currency":"EUR"}}`))
	if err != nil {
		t.Fatal(err)
	}
	if ev.Key != "refund:re_1" || len(ev.Refunds) != 1 || ev.Refunds[0].Amount != 1000 {
		t.Fatalf("refund: %+v", ev)
	}
	if ev.Refunds[0].At != 1758542340000 {
		t.Errorf("seconds were not read as seconds: %d", ev.Refunds[0].At)
	}
	if ev.Refunds[0].Cumulative {
		t.Error("a custom refund is one refund, never a running total")
	}

	ev, _ = p.Parse([]byte(`{"type":"dispute","at":1758542340000,"dispute":{"id":"dp_1","payment_id":"ord_1","amount":4900,"currency":"EUR","status":"lost"}}`))
	if len(ev.Disputes) != 1 || ev.Disputes[0].Status != DisputeLost {
		t.Fatalf("dispute: %+v", ev)
	}

	// Signed but empty: kept in the inbox, no facts, no error.
	for _, b := range []string{`{"type":"payment"}`, `{"type":"nonsense"}`, `{"type":"payment","payment":{"id":"x","amount":0}}`} {
		ev, err := p.Parse([]byte(b))
		if err != nil || !ev.Empty() {
			t.Errorf("%s -> %+v %v", b, ev, err)
		}
	}
}
