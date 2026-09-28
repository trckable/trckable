package revenue

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/payments"
)

// A data request erases a payer for good: the money stays counted, but no
// payment points at them, no raw notice in the inbox names them, and neither
// a later webhook (a renewal paid with the same address) nor a reprocess of
// the whole ledger links them back.
func TestErasedPayerStaysErased(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	path := HookPath("stripe", c.ID)
	send := func(evt, pi string) {
		t.Helper()
		body := []byte(fmt.Sprintf(`{"id":%q,"type":"payment_intent.succeeded","created":%d,"livemode":true,
 "data":{"object":{"id":%q,"amount_received":4900,"currency":"usd","customer":"cus_ada","receipt_email":"Ada@Example.com","metadata":{"trckable_vid":"abc123.x"}}}}`, evt, time.Now().Unix(), pi))
		if code := g.post(t, path, stripeSigned("whsec_test", body, time.Now()), body); code != 200 {
			t.Fatalf("webhook %s: %d", evt, code)
		}
		if _, err := g.svc.Process(ctx); err != nil {
			t.Fatal(err)
		}
	}
	linked := func() (n int) {
		if err := g.st.DB.QueryRow(`SELECT count(*) FROM pay_payments WHERE site_id = ? AND (visitor_id <> 0 OR email_hash <> '')`, g.site).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return
	}
	links := func() (n int) {
		if err := g.st.DB.QueryRow(`SELECT count(*) FROM pay_links WHERE site_id = ? AND key = 'cus_ada'`, g.site).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return
	}
	notices := func() (n int) {
		if err := g.st.DB.QueryRow(`SELECT count(*) FROM pay_inbox WHERE instr(lower(CAST(body AS TEXT)), 'ada@example.com') > 0`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return
	}
	send("evt_1", "pi_1")
	visitor, err := g.svc.VisitorForEmail(ctx, g.site, "ada@example.com")
	if err != nil || visitor == 0 || linked() != 1 || notices() != 1 || links() != 1 {
		t.Fatalf("before: visitor=%d err=%v linked=%d notices=%d links=%d", visitor, err, linked(), notices(), links())
	}

	unlinked, dropped, err := g.svc.ErasePayer(ctx, g.site, visitor, "ada@example.com")
	if err != nil || unlinked != 1 || dropped != 1 {
		t.Fatalf("erase: unlinked=%d dropped=%d err=%v", unlinked, dropped, err)
	}
	if linked() != 0 || notices() != 0 || links() != 0 {
		t.Fatalf("after erase: linked=%d notices=%d links=%d", linked(), notices(), links())
	}

	// The same person pays again: counted, not linked, notice not kept.
	send("evt_2", "pi_2")
	if linked() != 0 || notices() != 0 || links() != 0 {
		t.Fatalf("after a renewal: linked=%d notices=%d links=%d", linked(), notices(), links())
	}
	if _, err := g.svc.Reprocess(ctx, g.site); err != nil {
		t.Fatal(err)
	}
	if linked() != 0 || links() != 0 {
		t.Fatalf("after reprocess: linked=%d links=%d", linked(), links())
	}
	var payments int
	if err := g.st.DB.QueryRow(`SELECT count(*) FROM pay_payments WHERE site_id = ?`, g.site).Scan(&payments); err != nil {
		t.Fatal(err)
	}
	if payments != 2 {
		t.Fatalf("the money must stay counted: %d payments", payments)
	}
	if v, _ := g.svc.VisitorForEmail(ctx, g.site, "ada@example.com"); v != 0 {
		t.Fatalf("the address still finds a visitor: %d", v)
	}
}

// Lemon Squeezy's ids are not the ledger's ("order:101" is order 101), and
// its renewals carry no visitor at all, only the subscription. Erasing a
// visitor, with no address given, still removes every raw notice about
// them: the order, the subscription that links them, and the renewal the
// link credited to them. Someone else's order stays. Payloads shaped per
// https://docs.lemonsqueezy.com/help/webhooks/example-payloads.
func TestEraseByVisitorDropsLemonSqueezyNotices(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	const secret = "ls-signing-secret" //nolint:gosec // test fixture, not a credential
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "lemonsqueezy", Secret: secret, PublicBase: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	send := func(body string) {
		t.Helper()
		h := http.Header{}
		m := hmac.New(sha256.New, []byte(secret))
		m.Write([]byte(body))
		h.Set("X-Signature", hex.EncodeToString(m.Sum(nil)))
		if code := g.post(t, HookPath("lemonsqueezy", c.ID), h, []byte(body)); code != 200 {
			t.Fatalf("webhook: %d", code)
		}
	}
	send(`{"meta":{"event_name":"order_created","custom_data":{"trckable_vid":"lsvis1.x"}},"data":{"type":"orders","id":"101","attributes":{"store_id":1,"customer_id":55,"user_email":"ada@example.com","currency":"USD","subtotal":2000,"tax":200,"total":2200,"refunded_amount":0,"status":"paid","created_at":"2026-09-01T10:00:00.000000Z","updated_at":"2026-09-01T10:00:00.000000Z","test_mode":false}}}`)
	send(`{"meta":{"event_name":"subscription_created","custom_data":{"trckable_vid":"lsvis1.x"}},"data":{"type":"subscriptions","id":"900","attributes":{"store_id":1,"customer_id":55,"order_id":101,"user_email":"ada@example.com","status":"active","created_at":"2026-09-01T10:00:01.000000Z","updated_at":"2026-09-01T10:00:01.000000Z","test_mode":false}}}`)
	send(`{"meta":{"event_name":"subscription_payment_success"},"data":{"type":"subscription-invoices","id":"7002","attributes":{"store_id":1,"subscription_id":900,"customer_id":55,"user_email":"ada@example.com","billing_reason":"renewal","currency":"USD","subtotal":2000,"tax":200,"total":2200,"refunded_amount":0,"status":"paid","created_at":"2026-10-01T10:00:00.000000Z","updated_at":"2026-10-01T10:00:00.000000Z","test_mode":false}}}`)
	send(`{"meta":{"event_name":"order_created","custom_data":{"trckable_vid":"other1.x"}},"data":{"type":"orders","id":"1010","attributes":{"store_id":1,"customer_id":77,"user_email":"bob@example.com","currency":"USD","subtotal":101,"tax":0,"total":101,"refunded_amount":0,"status":"paid","created_at":"2026-09-02T10:00:00.000000Z","updated_at":"2026-09-02T10:00:00.000000Z","test_mode":false}}}`)
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	_, dropped, err := g.svc.ErasePayer(ctx, g.site, payments.ParseVisitor("lsvis1"), "")
	if err != nil {
		t.Fatal(err)
	}
	var ada, bob int
	if err := g.st.DB.QueryRow(`SELECT count(*) FROM pay_inbox WHERE instr(CAST(body AS TEXT), 'ada@example.com') > 0`).Scan(&ada); err != nil {
		t.Fatal(err)
	}
	if err := g.st.DB.QueryRow(`SELECT count(*) FROM pay_inbox WHERE instr(CAST(body AS TEXT), 'bob@example.com') > 0`).Scan(&bob); err != nil {
		t.Fatal(err)
	}
	if dropped != 3 || ada != 0 || bob != 1 {
		t.Fatalf("dropped %d notices; left about them %d, about someone else %d (want 3, 0, 1)", dropped, ada, bob)
	}
	var linked int
	if err := g.st.DB.QueryRow(`SELECT count(*) FROM pay_payments WHERE site_id = ? AND id IN ('order:101', 'sinv:7002') AND (visitor_id <> 0 OR email_hash <> '')`, g.site).Scan(&linked); err != nil {
		t.Fatal(err)
	}
	if linked != 0 {
		t.Fatalf("%d of their payments still point at them", linked)
	}
	facts, _ := g.svc.Facts(ctx, g.site, "USD", time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC), false)
	var total int64
	for _, f := range facts {
		total += f.Amount
		if f.ID != "order:1010" && f.Visitor != 0 {
			t.Errorf("%s is still attributed to visitor %d", f.ID, f.Visitor)
		}
	}
	if len(facts) != 3 || total != 4101 {
		t.Fatalf("the money must stay: %d payments, %d total", len(facts), total)
	}
}

// Erasing bob@x.com must not touch jimbob@x.com: the address is matched as a
// whole value, never as a substring of someone else's.
func TestEraseMatchesTheWholeAddress(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, _ := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	for i, email := range []string{"bob@x.com", "jimbob@x.com"} {
		body := []byte(fmt.Sprintf(`{"id":"evt_%d","type":"payment_intent.succeeded","created":%d,"livemode":true,
 "data":{"object":{"id":"pi_%d","amount_received":4900,"currency":"usd","receipt_email":%q,"metadata":{}}}}`, i, time.Now().Unix(), i, email))
		if code := g.post(t, HookPath("stripe", c.ID), stripeSigned("whsec_test", body, time.Now()), body); code != 200 {
			t.Fatalf("webhook: %d", code)
		}
	}
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	_, dropped, err := g.svc.ErasePayer(ctx, g.site, 0, "BOB@x.com")
	if err != nil {
		t.Fatal(err)
	}
	var jim int
	if err := g.st.DB.QueryRow(`SELECT count(*) FROM pay_inbox WHERE instr(CAST(body AS TEXT), 'jimbob@x.com') > 0`).Scan(&jim); err != nil {
		t.Fatal(err)
	}
	if dropped != 1 || jim != 1 {
		t.Fatalf("dropped %d notices, jimbob's left: %d (want 1, 1)", dropped, jim)
	}
}
