package revenue

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"strconv"
	"testing"
	"time"
)

// Standard Webhooks headers (Polar, Dodo): https://www.standardwebhooks.com.
func standardSigned(secret string, body []byte, ts time.Time) http.Header {
	key, _ := base64.StdEncoding.DecodeString(secret[len("whsec_"):])
	m := hmac.New(sha256.New, key)
	fmt.Fprintf(m, "msg_1.%d.%s", ts.Unix(), body)
	h := http.Header{}
	h.Set("webhook-id", "msg_1")
	h.Set("webhook-timestamp", strconv.FormatInt(ts.Unix(), 10))
	h.Set("webhook-signature", "v1,"+base64.StdEncoding.EncodeToString(m.Sum(nil)))
	return h
}

const dodoSecret = "whsec_ZG9kby1zZWNyZXQtZm9yLXRlc3RzLTAxMjM0NQ==" //nolint:gosec // test fixture, not a credential

// Dodo's payment.succeeded, per https://docs.dodopayments.com/developer-resources/webhooks/intents/payment.
func dodoPayment(id string, at time.Time) []byte {
	return []byte(fmt.Sprintf(`{"business_id":"bus_1","type":"payment.succeeded","timestamp":%q,
 "data":{"payload_type":"Payment","payment_id":%q,"status":"succeeded","total_amount":2400,"tax":400,"currency":"USD","created_at":%q,
  "customer":{"customer_id":"cus_1","email":"x@example.com"},"metadata":{"trckable_vid":"dodo1.x"}}}`, at.Format(time.RFC3339), id, at.Format(time.RFC3339)))
}

// A manual setup whose secret is not pasted yet answers 503, so the
// provider keeps the payment and retries; once the secret is in, the same
// delivery is stored. The payment is never lost in between.
func TestDeliveryBeforeTheSecretIsKeptByTheProvider(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "dodo", Mode: "live", PublicBase: "http://localhost:8080"})
	if err != nil || c.HasSecret {
		t.Fatalf("manual connection: %+v %v", c, err)
	}
	body := dodoPayment("pay_1", time.Now())
	path := HookPath("dodo", c.ID)
	if code := g.post(t, path, standardSigned(dodoSecret, body, time.Now()), body); code != http.StatusServiceUnavailable {
		t.Fatalf("delivery without a secret: %d, want 503 so it is retried", code)
	}
	var n int
	if err := g.st.DB.QueryRow(`SELECT count(*) FROM pay_inbox`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatal("an unverifiable delivery was stored")
	}
	if err := g.svc.SetSecret(ctx, g.site, c.ID, "short"); err == nil {
		t.Fatal("a too-short secret was accepted")
	}
	if err := g.svc.SetSecret(ctx, "another-site", c.ID, dodoSecret); err == nil {
		t.Fatal("another site's owner set this connection's secret")
	}
	if err := g.svc.SetSecret(ctx, g.site, c.ID, dodoSecret); err != nil {
		t.Fatal(err)
	}
	if code := g.post(t, path, standardSigned(dodoSecret, body, time.Now()), body); code != 200 {
		t.Fatalf("the retry after the secret: %d", code)
	}
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	f, _ := g.svc.Facts(ctx, g.site, "USD", time.Now().Add(-time.Hour), time.Now().Add(time.Hour), false)
	if len(f) != 1 || f[0].Amount != 2000 {
		t.Fatalf("facts: %+v", f)
	}
}

// A test-mode connection of a provider whose webhooks don't say test or
// live (Dodo, Polar, Paddle) keeps its payments out of the real numbers;
// they show only in the test-payments view.
func TestTestModeConnectionStaysApart(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "dodo", Mode: "test", Secret: dodoSecret, PublicBase: "http://localhost:8080"})
	if err != nil || c.Mode != "test" {
		t.Fatalf("connect: %+v %v", c, err)
	}
	body := dodoPayment("pay_t", time.Now())
	if code := g.post(t, HookPath("dodo", c.ID), standardSigned(dodoSecret, body, time.Now()), body); code != 200 {
		t.Fatalf("webhook: %d", code)
	}
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	from, to := time.Now().Add(-time.Hour), time.Now().Add(time.Hour)
	if f, _ := g.svc.Facts(ctx, g.site, "USD", from, to, false); len(f) != 0 {
		t.Fatalf("test money in real numbers: %+v", f)
	}
	if f, _ := g.svc.Facts(ctx, g.site, "USD", from, to, true); len(f) != 1 {
		t.Fatalf("test view: %+v", f)
	}
	list, _ := g.svc.Connections(ctx, g.site, "")
	if list[0].LastTest == nil || list[0].LastEvent != nil || list[0].Payments != 0 {
		t.Fatalf("status: %+v", list[0])
	}
}

// A body that verifies but can't be parsed is still stored (200, so the
// provider doesn't retry forever) with the error, and a later reprocess
// with a fixed parser picks it up. Disconnecting and connecting again
// counts the same payments once.
func TestUnparsableDeliveryAndReconnect(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, _ := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	bad := []byte(`{"id":"evt_bad","type":"payment_intent.succeeded","data":{"object":{"amount_received":"not a number"}}}`)
	if code := g.post(t, HookPath("stripe", c.ID), stripeSigned("whsec_test", bad, time.Now()), bad); code != 200 {
		t.Fatalf("unparsable but signed: %d", code)
	}
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	var msg string
	if err := g.st.DB.QueryRow(`SELECT error FROM pay_inbox WHERE event_key = 'evt_bad'`).Scan(&msg); err != nil {
		t.Fatal(err)
	}
	if msg == "" {
		t.Fatal("the parse error was not recorded")
	}
	body := []byte(fmt.Sprintf(piBody, time.Now().Unix()))
	g.post(t, HookPath("stripe", c.ID), stripeSigned("whsec_test", body, time.Now()), body)
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	if err := g.svc.Disconnect(ctx, g.site, c.ID); err != nil {
		t.Fatal(err)
	}
	c2, _ := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test2", PublicBase: "http://localhost:8080"}) //nolint:gosec // test fixture, not a credential
	if code := g.post(t, HookPath("stripe", c2.ID), stripeSigned("whsec_test2", body, time.Now()), body); code != 200 {
		t.Fatalf("after reconnecting: %d", code)
	}
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := g.svc.Reprocess(ctx, g.site); err != nil {
		t.Fatal(err)
	}
	f, _ := g.svc.Facts(ctx, g.site, "USD", time.Now().Add(-time.Hour), time.Now().Add(time.Hour), false)
	if len(f) != 1 || f[0].Amount != 4900 {
		t.Fatalf("one payment through two connections: %+v", f)
	}
}

// After Start over, the forgotten secrets make every delivery wait (503)
// instead of failing for good, until the owner reconnects or pastes the
// secret again.
func TestStartOverKeepsDeliveriesRetrying(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, _ := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	if _, err := g.svc.StartOver(ctx); err != nil {
		t.Fatal(err)
	}
	body := []byte(fmt.Sprintf(piBody, time.Now().Unix()))
	if code := g.post(t, HookPath("stripe", c.ID), stripeSigned("whsec_test", body, time.Now()), body); code != http.StatusServiceUnavailable {
		t.Fatalf("delivery after Start over: %d, want 503", code)
	}
	if err := g.svc.SetSecret(ctx, g.site, c.ID, "whsec_test"); err != nil {
		t.Fatal(err)
	}
	if code := g.post(t, HookPath("stripe", c.ID), stripeSigned("whsec_test", body, time.Now()), body); code != 200 {
		t.Fatalf("after pasting the secret again: %d", code)
	}
}
