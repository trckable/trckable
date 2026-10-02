package revenue

import (
	"context"
	"fmt"
	"testing"
	"time"
)

// The provider's raw notice carries the payer's email and address. Once it is
// in the ledger and old enough, the body is emptied: the money, the ids and the
// hashed link stay, the key stays so a replay is still recognised, and a
// rebuild of the ledger does not lose what the emptied notices once said.
func TestOldPaymentNoticesAreEmptied(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	path := HookPath("stripe", c.ID)
	send := func(evt, pi string) []byte {
		t.Helper()
		body := []byte(fmt.Sprintf(`{"id":%q,"type":"payment_intent.succeeded","created":%d,"livemode":true,
 "data":{"object":{"id":%q,"amount_received":4900,"currency":"usd","customer":"cus_ada","receipt_email":"Ada@Example.com","metadata":{"trckable_vid":"abc123.x"}}}}`, evt, g.svc.Now().Unix(), pi))
		if code := g.post(t, path, stripeSigned("whsec_test", body, g.svc.Now()), body); code != 200 {
			t.Fatalf("webhook %s: %d", evt, code)
		}
		return body
	}
	count := func(q string, args ...any) (n int) {
		t.Helper()
		if err := g.st.DB.QueryRow(q, args...).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return
	}
	withEmail := func() int {
		return count(`SELECT count(*) FROM pay_inbox WHERE instr(lower(CAST(body AS TEXT)), 'ada@example.com') > 0`)
	}

	first := send("evt_old", "pi_old")
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	// Twenty days on, a second payment arrives and is processed.
	g.svc.Now = func() time.Time { return time.Now().Add(20 * 24 * time.Hour) }
	send("evt_new", "pi_new")
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	// A third one is in the inbox but not read yet: it must survive any prune.
	g.svc.Now = func() time.Time { return time.Now().Add(100 * 24 * time.Hour) }
	if _, err := g.st.DB.Exec(`INSERT INTO pay_inbox (connection_id, event_key, received_at, source, body) VALUES (?, 'evt_pending', 1, 'webhook', ?)`, c.ID, first); err != nil {
		t.Fatal(err)
	}

	// Thirty-one days after the first notice: only that one has aged out.
	g.svc.Now = func() time.Time { return time.Now().Add(31 * 24 * time.Hour) }
	n, err := g.svc.PruneNotices(ctx, DefaultNoticeDays, nil)
	if err != nil || n != 1 {
		t.Fatalf("emptied %d, err %v; want 1", n, err)
	}
	if got := withEmail(); got != 2 { // the newer notice and the pending one
		t.Fatalf("notices naming the payer: %d, want 2", got)
	}
	if got := count(`SELECT count(*) FROM pay_inbox WHERE event_key = 'evt_old' AND length(body) = 0 AND processed_at IS NOT NULL`); got != 1 {
		t.Fatal("the emptied notice should stay as a row, with its key")
	}
	// The ledger is untouched, links included.
	if got := count(`SELECT count(*) FROM pay_payments WHERE site_id = ? AND email_hash <> '' AND visitor_id <> 0`, g.site); got != 2 {
		t.Fatalf("linked payments: %d, want 2", got)
	}
	// A replay of the emptied notice is still recognised and stores nothing.
	if code := g.post(t, path, stripeSigned("whsec_test", first, g.svc.Now()), first); code != 200 {
		t.Fatalf("replay: %d", code)
	}
	if got := count(`SELECT count(*) FROM pay_inbox WHERE event_key = 'evt_old' AND length(body) > 0`); got != 0 {
		t.Fatal("a replay put the payer's notice back")
	}
	// A rebuild must not delete what the emptied notice built.
	if _, err := g.svc.Reprocess(ctx, g.site); err != nil {
		t.Fatal(err)
	}
	if got := count(`SELECT count(*) FROM pay_payments WHERE site_id = ?`, g.site); got != 2 {
		t.Fatalf("payments after a rebuild: %d, want 2", got)
	}
	// Nothing left to empty, and running it again changes nothing.
	if n, _ := g.svc.PruneNotices(ctx, DefaultNoticeDays, nil); n != 0 {
		t.Fatalf("second pass emptied %d", n)
	}
}

// A site that keeps data for a shorter time than the default gets its notices
// emptied on its own clock; 0 days with no site retention keeps everything.
func TestNoticesFollowTheSitesRetention(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	body := []byte(fmt.Sprintf(`{"id":"evt_1","type":"payment_intent.succeeded","created":%d,"livemode":true,
 "data":{"object":{"id":"pi_1","amount_received":4900,"currency":"usd","receipt_email":"ada@example.com"}}}`, time.Now().Unix()))
	if code := g.post(t, HookPath("stripe", c.ID), stripeSigned("whsec_test", body, time.Now()), body); code != 200 {
		t.Fatal(code)
	}
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	g.svc.Now = func() time.Time { return time.Now().Add(10 * 24 * time.Hour) }
	empty := func() int {
		var n int
		g.st.DB.QueryRow(`SELECT count(*) FROM pay_inbox WHERE length(body) = 0`).Scan(&n)
		return n
	}
	if n, _ := g.svc.PruneNotices(ctx, 0, nil); n != 0 || empty() != 0 {
		t.Fatal("0 days and no site retention must keep every notice")
	}
	if n, _ := g.svc.PruneNotices(ctx, 30, nil); n != 0 || empty() != 0 {
		t.Fatal("ten days old is inside the 30-day window")
	}
	if n, _ := g.svc.PruneNotices(ctx, 30, map[string]int{"another-site": 7}); n != 0 || empty() != 0 {
		t.Fatal("another site's retention changed this site's notices")
	}
	if n, err := g.svc.PruneNotices(ctx, 30, map[string]int{g.site: 7}); err != nil || n != 1 || empty() != 1 {
		t.Fatalf("a 7-day retention should empty a 10-day-old notice: n=%d err=%v", n, err)
	}
}

// A notice the parser could not read is the only copy of that payment. It is
// kept, whatever its age, until a fix can read it.
func TestUnreadableNoticesAreKept(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	body := []byte(fmt.Sprintf(`{"id":"evt_bad","type":"payment_intent.succeeded","created":%d,"livemode":true,
 "data":{"object":{"id":"pi_bad","amount_received":"oops","currency":"usd","receipt_email":"ada@example.com"}}}`, time.Now().Unix()))
	if code := g.post(t, HookPath("stripe", c.ID), stripeSigned("whsec_test", body, time.Now()), body); code != 200 {
		t.Fatal(code)
	}
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	var msg string
	if err := g.st.DB.QueryRow(`SELECT error FROM pay_inbox WHERE event_key = 'evt_bad'`).Scan(&msg); err != nil || msg == "" {
		t.Fatalf("the notice should have failed to parse: %q, %v", msg, err)
	}
	g.svc.Now = func() time.Time { return time.Now().Add(400 * 24 * time.Hour) }
	if n, err := g.svc.PruneNotices(ctx, DefaultNoticeDays, map[string]int{g.site: 7}); err != nil || n != 0 {
		t.Fatalf("emptied %d unreadable notices, %v", n, err)
	}
}
