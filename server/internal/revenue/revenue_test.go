package revenue

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/payments"
	"github.com/trckable/trckable/server/internal/secrets"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

type rig struct {
	svc  *Service
	st   *sqlite.Store
	site string
	srv  *httptest.Server
}

func newRig(t *testing.T, dir string, key string) *rig {
	t.Helper()
	ctx := context.Background()
	st, err := sqlite.Open(ctx, filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	box, _ := secrets.New([]byte(key))
	svc, err := New(ctx, st.DB, box)
	if err != nil {
		t.Fatal(err)
	}
	site, _, _ := st.EnsureSite(ctx, sqlite.DefaultAccount, "shop.example")
	mux := http.NewServeMux()
	mux.HandleFunc("POST /webhooks/{provider}/{conn}", svc.Webhook)
	srv := httptest.NewServer(mux)
	t.Cleanup(func() { srv.Close(); st.Close() })
	return &rig{svc: svc, st: st, site: site, srv: srv}
}

func stripeSigned(secret string, body []byte, ts time.Time) http.Header {
	m := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(m, "%d.%s", ts.Unix(), body)
	h := http.Header{}
	h.Set("Stripe-Signature", fmt.Sprintf("t=%d,v1=%s", ts.Unix(), hex.EncodeToString(m.Sum(nil))))
	return h
}

func (g *rig) post(t *testing.T, path string, h http.Header, body []byte) int {
	t.Helper()
	req, _ := http.NewRequest("POST", g.srv.URL+path, bytes.NewReader(body))
	for k, v := range h {
		req.Header[k] = v
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	return res.StatusCode
}

const piBody = `{"id":"evt_1","type":"payment_intent.succeeded","created":%d,"livemode":true,
 "data":{"object":{"id":"pi_1","amount_received":4900,"currency":"usd","metadata":{"trckable_vid":"abc123.x"}}}}`

func TestWebhookToLedger(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	if c.Managed || !strings.HasSuffix(c.WebhookURL, "/webhooks/stripe/"+c.ID) {
		t.Fatalf("connection: %+v", c)
	}
	body := []byte(fmt.Sprintf(piBody, time.Now().Unix()))
	path := HookPath("stripe", c.ID)
	if code := g.post(t, path, stripeSigned("whsec_wrong", body, time.Now()), body); code != 400 {
		t.Fatalf("forged webhook: %d", code)
	}
	for i := 0; i < 3; i++ { // Stripe retries: stored once
		if code := g.post(t, path, stripeSigned("whsec_test", body, time.Now()), body); code != 200 {
			t.Fatalf("webhook: %d", code)
		}
	}
	if code := g.post(t, "/webhooks/stripe/pc_nope", stripeSigned("whsec_test", body, time.Now()), body); code != 404 {
		t.Fatalf("unknown connection: %d", code)
	}
	if code := g.post(t, "/webhooks/paddle/"+c.ID, http.Header{}, body); code != 404 {
		t.Fatalf("provider mismatch: %d", code)
	}
	var n int
	g.st.DB.QueryRow(`SELECT count(*) FROM pay_inbox`).Scan(&n)
	if n != 1 {
		t.Fatalf("inbox rows: %d", n)
	}
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	facts, _ := g.svc.Facts(ctx, g.site, "USD", time.Now().Add(-time.Hour), time.Now().Add(time.Hour), false)
	if len(facts) != 1 || facts[0].Amount != 4900 || facts[0].Visitor == 0 {
		t.Fatalf("facts: %+v", facts)
	}
	list, _ := g.svc.Connections(ctx, g.site, "https://stats.example")
	if len(list) != 1 || list[0].LastEvent == nil || list[0].Payments != 1 || list[0].Pending != 0 {
		t.Fatalf("status: %+v", list)
	}
	if n, err := g.svc.Reprocess(ctx, g.site); err != nil || n != 1 {
		t.Fatalf("reprocess: %d %v", n, err)
	}
	if f, _ := g.svc.Facts(ctx, g.site, "USD", time.Now().Add(-time.Hour), time.Now().Add(time.Hour), false); len(f) != 1 || f[0] != facts[0] {
		t.Fatalf("after reprocess: %+v", f)
	}
}

func TestForgedWebhookBurstIsTurnedAway(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	c, err := g.svc.Connect(context.Background(), ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test"})
	if err != nil {
		t.Fatal(err)
	}
	body := []byte(fmt.Sprintf(piBody, time.Now().Unix()))
	path := HookPath("stripe", c.ID)
	limited := 0
	for i := 0; i < badSigBurst+5; i++ {
		if code := g.post(t, path, stripeSigned("whsec_wrong", body, time.Now()), body); code == http.StatusTooManyRequests {
			limited++
		}
	}
	if limited == 0 {
		t.Fatal("a flood of forged webhooks was never rate limited")
	}
	// A real delivery still gets through (the counter is per connection and
	// resets as soon as a signature verifies).
	g.svc.bad.ok(c.ID)
	if code := g.post(t, path, stripeSigned("whsec_test", body, time.Now()), body); code != 200 {
		t.Fatalf("valid webhook after the burst: %d", code)
	}
}

func TestWrongKeyRefusesWithRetry(t *testing.T) {
	dir := t.TempDir()
	g := newRig(t, dir, "the original instance key")
	ctx := context.Background()
	c, _ := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test"})
	g.srv.Close()
	g.st.Close()

	g2 := newRig(t, dir, "a different key after a bad redeploy")
	if g2.svc.KeyErr == nil {
		t.Fatal("changed key not detected")
	}
	body := []byte(fmt.Sprintf(piBody, time.Now().Unix()))
	if code := g2.post(t, HookPath("stripe", c.ID), stripeSigned("whsec_test", body, time.Now()), body); code != http.StatusServiceUnavailable {
		t.Fatalf("webhook with wrong key: %d, want 503 so the provider retries", code)
	}
}

// fakeStripe is a tiny Stripe API: create endpoint, account, list events.
func fakeStripe(t *testing.T, events []string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer sk_live_ok" {
			w.WriteHeader(401)
			io.WriteString(w, `{"error":{"message":"Invalid API Key provided"}}`)
			return
		}
		switch {
		case r.Method == "POST" && r.URL.Path == "/v1/webhook_endpoints":
			r.ParseForm()
			if r.Form.Get("api_version") != payments.StripeAPIVersion || len(r.Form["enabled_events[]"]) != len(payments.StripeEvents) {
				t.Errorf("endpoint form: %v", r.Form)
			}
			if !strings.HasPrefix(r.Form.Get("url"), "https://stats.example/webhooks/stripe/pc_") {
				t.Errorf("hook url: %s", r.Form.Get("url"))
			}
			io.WriteString(w, `{"id":"we_1","secret":"whsec_created","livemode":true}`)
		case r.URL.Path == "/v1/account":
			io.WriteString(w, `{"settings":{"dashboard":{"display_name":"Acme Inc"}}}`)
		case r.URL.Path == "/v1/events":
			json.NewEncoder(w).Encode(map[string]any{"data": json.RawMessage("[" + strings.Join(events, ",") + "]"), "has_more": false})
		default:
			w.WriteHeader(404)
		}
	}))
}

func TestOneKeySetupAndReconciliation(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	now := time.Now().Unix()
	delivered := fmt.Sprintf(piBody, now)
	missed := fmt.Sprintf(`{"id":"evt_2","type":"payment_intent.succeeded","created":%d,"livemode":true,"data":{"object":{"id":"pi_2","amount_received":1500,"currency":"usd","metadata":{}}}}`, now)
	api := fakeStripe(t, []string{delivered, missed})
	defer api.Close()
	payments.Remotes["stripe"] = &payments.StripeAPI{BaseURL: api.URL}
	defer func() { payments.Remotes["stripe"] = &payments.StripeAPI{} }()

	if _, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", APIKey: "sk_live_ok", PublicBase: "http://localhost"}); err == nil || !strings.Contains(err.Error(), "TRCKABLE_BASE_URL") {
		t.Fatalf("local base URL: %v", err)
	}
	if _, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", APIKey: "sk_live_bad", PublicBase: "https://stats.example"}); err == nil || !strings.Contains(err.Error(), "Invalid API Key") {
		t.Fatalf("bad key: %v", err)
	}
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", APIKey: "sk_live_ok", PublicBase: "https://stats.example"})
	if err != nil {
		t.Fatal(err)
	}
	if !c.Managed || c.Label != "Acme Inc" {
		t.Fatalf("managed connection: %+v", c)
	}
	// The created secret verifies real deliveries.
	body := []byte(delivered)
	if code := g.post(t, HookPath("stripe", c.ID), stripeSigned("whsec_created", body, time.Now()), body); code != 200 {
		t.Fatalf("webhook with the created secret: %d", code)
	}
	time.Sleep(50 * time.Millisecond) // the connect-time backfill runs in the background
	if _, err := g.svc.Sync(ctx, c.ID, 24*time.Hour); err != nil {
		t.Fatal(err)
	}
	g.svc.Process(ctx)
	facts, _ := g.svc.Facts(ctx, g.site, "USD", time.Now().Add(-time.Hour), time.Now().Add(time.Hour), false)
	var total int64
	for _, f := range facts {
		total += f.Amount
	}
	if len(facts) != 2 || total != 6400 {
		t.Fatalf("reconciled facts: %d payments, %d total (want 2, 6400: the missed one added, the delivered one once)", len(facts), total)
	}
	if err := g.svc.Disconnect(ctx, g.site, c.ID); err != nil {
		t.Fatal(err)
	}
	if code := g.post(t, HookPath("stripe", c.ID), stripeSigned("whsec_created", body, time.Now()), body); code != 404 {
		t.Fatalf("webhook after disconnect: %d", code)
	}
	if f, _ := g.svc.Facts(ctx, g.site, "USD", time.Now().Add(-time.Hour), time.Now().Add(time.Hour), false); len(f) != 2 {
		t.Fatal("disconnect erased history")
	}
}

// A sale is announced live once: when a real payment first reaches the ledger.
// Another event about the same payment, a test-mode payment, or one a sync
// found from hours ago are all facts for the ledger and none of them is news.
func TestSalesAreAnnouncedOnceAndOnlyWhenNew(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	var sales []Sale
	g.svc.OnSale = func(site string, s Sale) {
		if site != g.site {
			t.Errorf("sale for the wrong site: %s", site)
		}
		sales = append(sales, s)
	}
	path := HookPath("stripe", c.ID)
	send := func(evt, pi string, live bool, created time.Time) {
		t.Helper()
		body := []byte(fmt.Sprintf(`{"id":%q,"type":"payment_intent.succeeded","created":%d,"livemode":%t,
			"data":{"object":{"id":%q,"amount_received":4900,"currency":"usd","created":%d}}}`, evt, created.Unix(), live, pi, created.Unix()))
		if code := g.post(t, path, stripeSigned("whsec_test", body, time.Now()), body); code != 200 {
			t.Fatalf("webhook %s: %d", evt, code)
		}
		if _, err := g.svc.Process(ctx); err != nil {
			t.Fatal(err)
		}
	}

	send("evt_1", "pi_1", true, time.Now())
	if len(sales) != 1 || sales[0].Amount != 4900 || sales[0].Currency != "USD" || sales[0].Exponent != 2 {
		t.Fatalf("a new sale: %+v", sales)
	}
	send("evt_2", "pi_1", true, time.Now())                   // the same payment again
	send("evt_3", "pi_2", false, time.Now())                  // test mode
	send("evt_4", "pi_3", true, time.Now().Add(-3*time.Hour)) // found by a sync, not arriving now
	if len(sales) != 1 {
		t.Fatalf("announced %d sales, want 1: %+v", len(sales), sales)
	}
	// All four are still in the ledger, of course; only the news is filtered.
	var n int
	g.st.DB.QueryRow(`SELECT count(*) FROM pay_payments`).Scan(&n)
	if n != 3 {
		t.Fatalf("ledger payments: %d, want 3", n)
	}
}
