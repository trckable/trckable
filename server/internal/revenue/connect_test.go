package revenue

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/payments"
)

// stripeAccount is a fake Stripe account holding webhook endpoints, shaped
// per https://docs.stripe.com/api/webhook_endpoints.
type stripeAccount struct {
	mu        sync.Mutex
	endpoints map[string]string // id -> url
	next      int
	livemode  bool
	noSecret  bool
	events    string // /v1/events answer
	eventsErr int    // status to fail /v1/events with
	sinces    []string
	onCreate  func() // called after an endpoint is stored, without the lock
}

func (a *stripeAccount) serve(t *testing.T) *httptest.Server {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		defer a.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == "POST" && r.URL.Path == "/v1/webhook_endpoints":
			if err := r.ParseForm(); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			a.next++
			id := "we_" + strconv.Itoa(a.next)
			a.endpoints[id] = r.Form.Get("url")
			secret := `"whsec_created"` //nolint:gosec // test fixture, not a credential
			if a.noSecret {
				secret = `null`
			}
			answer := `{"id":"` + id + `","object":"webhook_endpoint","secret":` + secret + `,"livemode":` + map[bool]string{true: "true", false: "false"}[a.livemode] + `}`
			if f := a.onCreate; f != nil {
				a.onCreate = nil
				a.mu.Unlock()
				f()
				a.mu.Lock()
			}
			_, _ = io.WriteString(w, answer) // a failed write shows up as the client's error
		case r.Method == "GET" && r.URL.Path == "/v1/webhook_endpoints":
			var items []string
			for id, u := range a.endpoints {
				items = append(items, `{"id":"`+id+`","url":"`+u+`"}`)
			}
			_, _ = io.WriteString(w, `{"object":"list","has_more":false,"data":[`+strings.Join(items, ",")+`]}`)
		case r.Method == "DELETE" && strings.HasPrefix(r.URL.Path, "/v1/webhook_endpoints/"):
			delete(a.endpoints, strings.TrimPrefix(r.URL.Path, "/v1/webhook_endpoints/"))
			_, _ = io.WriteString(w, `{"deleted":true}`) // a failed write shows up as the client's error
		case r.URL.Path == "/v1/account":
			_, _ = io.WriteString(w, `{"settings":{"dashboard":{"display_name":"Acme"}}}`) // a failed write shows up as the client's error
		case r.URL.Path == "/v1/events":
			a.sinces = append(a.sinces, r.URL.Query().Get("created[gte]"))
			if a.eventsErr != 0 {
				w.WriteHeader(a.eventsErr)
				_, _ = io.WriteString(w, `{"error":{"message":"Expired API Key provided: rk_live_****1234"}}`) // a failed write shows up as the client's error
				return
			}
			ev := a.events
			if ev == "" {
				ev = `{"object":"list","has_more":false,"data":[]}`
			}
			_, _ = io.WriteString(w, ev) // a failed write shows up as the client's error
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func useStripe(t *testing.T, g *rig, a *stripeAccount) {
	srv := a.serve(t)
	payments.Remotes["stripe"] = &payments.StripeAPI{BaseURL: srv.URL}
	t.Cleanup(func() { payments.Remotes["stripe"] = &payments.StripeAPI{} })
	old := payments.RetryWait
	payments.RetryWait = func(context.Context, time.Duration) error { return nil }
	t.Cleanup(func() { payments.RetryWait = old })
	t.Cleanup(g.svc.Wait) // runs first: the backfill finishes before the fakes go
}

// Running setup again, after a disconnect whose cleanup failed or a lost
// instance key, leaves one endpoint per live connection: the stale ones
// pointing at this server are removed, everything else is left alone.
func TestSetupAgainRemovesStaleEndpoints(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	acct := &stripeAccount{livemode: true, endpoints: map[string]string{
		"we_gone":  "https://stats.example/webhooks/stripe/pc_forgotten", // no such connection here
		"we_other": "https://another-tool.example/stripe",                // not ours
		"we_else":  "https://elsewhere.example/webhooks/stripe/pc_x",     // another trckable
	}}
	useStripe(t, g, acct)
	c1, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", APIKey: "rk_live_ok", PublicBase: "https://stats.example"})
	if err != nil {
		t.Fatal(err)
	}
	c2, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", APIKey: "rk_live_ok", PublicBase: "https://stats.example"})
	if err != nil {
		t.Fatal(err)
	}
	acct.mu.Lock()
	urls := map[string]bool{}
	for _, u := range acct.endpoints {
		urls[u] = true
	}
	acct.mu.Unlock()
	want := []string{
		"https://stats.example/webhooks/stripe/" + c1.ID, // still connected: kept
		"https://stats.example/webhooks/stripe/" + c2.ID,
		"https://another-tool.example/stripe",
		"https://elsewhere.example/webhooks/stripe/pc_x",
	}
	if len(urls) != len(want) {
		t.Fatalf("endpoints after setup: %v", urls)
	}
	for _, u := range want {
		if !urls[u] {
			t.Errorf("missing %s: %v", u, urls)
		}
	}
}

// A live key is live whatever mode was picked, and a test key is test: the
// key decides, so real money is never filed as test money or the reverse.
func TestTheKeyDecidesTheMode(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	acct := &stripeAccount{livemode: true, endpoints: map[string]string{}}
	useStripe(t, g, acct)
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", Mode: "test", APIKey: "rk_live_ok", PublicBase: "https://stats.example"})
	if err != nil || c.Mode != "live" {
		t.Fatalf("a live key connected as %q: %v", c.Mode, err)
	}
	g.svc.Wait()
	acct.livemode = false
	c, err = g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", APIKey: "sk_test_ok", PublicBase: "https://stats.example"})
	if err != nil || c.Mode != "test" {
		t.Fatalf("a test key connected as %q: %v", c.Mode, err)
	}
}

// A setup that half-worked is undone: an endpoint without a signing secret,
// or one created for a connection that could not be saved, is deleted at
// the provider so it never posts to an address that answers 404.
func TestHalfFinishedSetupIsUndone(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	acct := &stripeAccount{livemode: true, endpoints: map[string]string{}, noSecret: true}
	useStripe(t, g, acct)
	if _, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", APIKey: "rk_live_ok", PublicBase: "https://stats.example"}); err == nil || !strings.Contains(err.Error(), "signing secret") {
		t.Fatalf("a secretless setup: %v", err)
	}
	if len(acct.endpoints) != 0 {
		t.Fatalf("left behind: %v", acct.endpoints)
	}
	g.svc.Wait()
	acct.noSecret = false
	if _, err := g.svc.Connect(ctx, ConnectRequest{Site: "no-such-site", Provider: "stripe", APIKey: "rk_live_ok", PublicBase: "https://stats.example"}); err == nil {
		t.Fatal("a connection for a missing site was saved")
	}
	if len(acct.endpoints) != 0 {
		t.Fatalf("an unsaved connection left its endpoint: %v", acct.endpoints)
	}
}

// Reconciliation reaches back to the last one that worked, so a gap longer
// than the regular week (the server or the provider down, a revoked key)
// is still filled; a revoked key is reported in words the owner can act on.
func TestReconciliationCoversOutagesAndSaysWhatFailed(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	acct := &stripeAccount{livemode: true, endpoints: map[string]string{}}
	useStripe(t, g, acct)
	now := time.Date(2026, 9, 26, 12, 0, 0, 0, time.UTC)
	g.svc.Now = func() time.Time { return now }
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", APIKey: "rk_live_ok", PublicBase: "https://stats.example"})
	if err != nil {
		t.Fatal(err)
	}
	g.svc.Wait() // the connect-time backfill
	if _, err := g.svc.Sync(ctx, c.ID, 7*24*time.Hour); err != nil {
		t.Fatal(err)
	}
	// The key is revoked for twelve days.
	acct.eventsErr = http.StatusUnauthorized
	now = now.Add(12 * 24 * time.Hour)
	if _, err := g.svc.Sync(ctx, c.ID, 7*24*time.Hour); err == nil {
		t.Fatal("a revoked key synced")
	}
	list, _ := g.svc.Connections(ctx, g.site, "")
	if len(list) != 1 || !strings.Contains(list[0].LastError, "no longer accepts the API key") || !strings.Contains(list[0].LastError, "Expired API Key") {
		t.Fatalf("last error: %q", list[0].LastError)
	}
	// Fixed: the next reconciliation starts from the last one that worked
	// (an hour before it), not from a week ago.
	acct.eventsErr = 0
	acct.sinces = nil
	if _, err := g.svc.Sync(ctx, c.ID, 7*24*time.Hour); err != nil {
		t.Fatal(err)
	}
	lastOK := time.Date(2026, 9, 26, 11, 0, 0, 0, time.UTC).Unix()
	if len(acct.sinces) == 0 || acct.sinces[0] != itoa(lastOK) {
		t.Fatalf("synced from %v, want %d (the last good sync, less an hour)", acct.sinces, lastOK)
	}
	if list, _ := g.svc.Connections(ctx, g.site, ""); list[0].LastError != "" {
		t.Fatalf("the error stayed after a good sync: %q", list[0].LastError)
	}
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }

// A reconciliation that runs out of time keeps what it had already fetched:
// the provider calls have a deadline, storing their results does not.
func TestSyncTimeoutKeepsWhatWasFetched(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := g.st.DB.Exec(`UPDATE pay_connections SET api_key_enc = ? WHERE id = ?`, mustSeal(t, g, "rk_live_ok"), c.ID); err != nil {
		t.Fatal(err)
	}
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("starting_after") != "" {
			<-release // the second page never comes back in time
			return
		}
		_, _ = io.WriteString(w, `{"object":"list","has_more":true,"data":[`+strings.Replace(piBody, "%d", "1758600000", 1)+`]}`) // a failed write shows up as the client's error
	}))
	defer srv.Close()
	defer close(release) // before Close, which waits for the stuck handler
	payments.Remotes["stripe"] = &payments.StripeAPI{BaseURL: srv.URL}
	defer func() { payments.Remotes["stripe"] = &payments.StripeAPI{} }()
	g.svc.SyncTimeout = 300 * time.Millisecond
	n, err := g.svc.Sync(ctx, c.ID, 24*time.Hour)
	if err == nil || n != 1 {
		t.Fatalf("timed-out sync stored %d events (err %v), want the 1 fetched before the deadline", n, err)
	}
}

func mustSeal(t *testing.T, g *rig, v string) string {
	t.Helper()
	enc, err := g.svc.Box.Seal(v)
	if err != nil {
		t.Fatal(err)
	}
	return enc
}

// Two setups at once: the first one's endpoint exists at the provider
// before the provider has answered it, while the second setup prunes. The
// first connection's row is already there, so its endpoint is not stale.
func TestConcurrentSetupsKeepEachOthersEndpoints(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	acct := &stripeAccount{livemode: true, endpoints: map[string]string{}}
	useStripe(t, g, acct)
	var second Connection
	acct.onCreate = func() { // the first setup's endpoint now exists; the second runs to the end
		var err error
		if second, err = g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", APIKey: "rk_live_ok", PublicBase: "https://stats.example"}); err != nil {
			t.Error(err)
		}
	}
	first, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", APIKey: "rk_live_ok", PublicBase: "https://stats.example"})
	if err != nil {
		t.Fatal(err)
	}
	g.svc.Wait()
	acct.mu.Lock()
	defer acct.mu.Unlock()
	urls := map[string]bool{}
	for _, u := range acct.endpoints {
		urls[u] = true
	}
	for _, c := range []Connection{first, second} {
		if !urls["https://stats.example/webhooks/stripe/"+c.ID] {
			t.Errorf("%s lost its endpoint: %v", c.ID, urls)
		}
	}
}
