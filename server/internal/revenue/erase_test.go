package revenue

import (
	"context"
	"fmt"
	"testing"
	"time"
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
 "data":{"object":{"id":%q,"amount_received":4900,"currency":"usd","receipt_email":"Ada@Example.com","metadata":{"trckable_vid":"abc123.x"}}}}`, evt, time.Now().Unix(), pi))
		if code := g.post(t, path, stripeSigned("whsec_test", body, time.Now()), body); code != 200 {
			t.Fatalf("webhook %s: %d", evt, code)
		}
		if _, err := g.svc.Process(ctx); err != nil {
			t.Fatal(err)
		}
	}
	linked := func() (n int) {
		g.st.DB.QueryRow(`SELECT count(*) FROM pay_payments WHERE site_id = ? AND (visitor_id <> 0 OR email_hash <> '')`, g.site).Scan(&n)
		return
	}
	notices := func() (n int) {
		g.st.DB.QueryRow(`SELECT count(*) FROM pay_inbox WHERE instr(lower(CAST(body AS TEXT)), 'ada@example.com') > 0`).Scan(&n)
		return
	}
	send("evt_1", "pi_1")
	visitor, err := g.svc.VisitorForEmail(ctx, g.site, "ada@example.com")
	if err != nil || visitor == 0 || linked() != 1 || notices() != 1 {
		t.Fatalf("before: visitor=%d err=%v linked=%d notices=%d", visitor, err, linked(), notices())
	}

	unlinked, dropped, err := g.svc.ErasePayer(ctx, g.site, visitor, "ada@example.com")
	if err != nil || unlinked != 1 || dropped != 1 {
		t.Fatalf("erase: unlinked=%d dropped=%d err=%v", unlinked, dropped, err)
	}
	if linked() != 0 || notices() != 0 {
		t.Fatalf("after erase: linked=%d notices=%d", linked(), notices())
	}

	// The same person pays again: counted, not linked, notice not kept.
	send("evt_2", "pi_2")
	if linked() != 0 || notices() != 0 {
		t.Fatalf("after a renewal: linked=%d notices=%d", linked(), notices())
	}
	if _, err := g.svc.Reprocess(ctx, g.site); err != nil {
		t.Fatal(err)
	}
	if linked() != 0 {
		t.Fatalf("after reprocess: linked=%d", linked())
	}
	var payments int
	g.st.DB.QueryRow(`SELECT count(*) FROM pay_payments WHERE site_id = ?`, g.site).Scan(&payments)
	if payments != 2 {
		t.Fatalf("the money must stay counted: %d payments", payments)
	}
	if v, _ := g.svc.VisitorForEmail(ctx, g.site, "ada@example.com"); v != 0 {
		t.Fatalf("the address still finds a visitor: %d", v)
	}
}
