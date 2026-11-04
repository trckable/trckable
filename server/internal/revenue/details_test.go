package revenue

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/payments"
)

// A customer is read from the provider once, kept for ten minutes, and never
// stored; a key that is not a provider customer id reads nothing at all.
func TestDetailsReadLiveAndCached(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	var reads, gone atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/webhooks":
			if r.Method == "POST" {
				_, _ = io.WriteString(w, `{"id":"wh_1"}`)
				return
			}
			_, _ = io.WriteString(w, `{"data":[],"done":true}`)
		case "/webhooks/wh_1/secret":
			_, _ = io.WriteString(w, `{"secret":"whsec_ZG9kby1zZWNyZXQtZm9yLXRlc3Rz"}`)
		case "/customers/cus_gone":
			gone.Add(1)
			w.WriteHeader(404)
			_, _ = io.WriteString(w, `{"message":"not found"}`)
		case "/customers/cus_1":
			reads.Add(1)
			_, _ = io.WriteString(w, `{"customer_id":"cus_1","name":"Ada","email":"ada@example.com"}`)
		default:
			_, _ = io.WriteString(w, `{"items":[]}`)
		}
	}))
	defer srv.Close()
	payments.Remotes["dodo"] = &payments.DodoAPI{TestURL: srv.URL}
	t.Cleanup(func() { payments.Remotes["dodo"] = &payments.DodoAPI{} })
	t.Cleanup(g.svc.Wait)
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "dodo", Mode: "test", APIKey: "dodo_key", PublicBase: "https://stats.example"})
	if err != nil {
		t.Fatal(err)
	}
	g.svc.Wait()
	_, err = g.svc.DB.ExecContext(ctx, `INSERT INTO pay_payments (site_id, provider, id, connection_id, test, paid_at, currency, gross, customer_id, version) VALUES (?, 'dodo', 'pay_1', ?, 1, 1, 'USD', 100, 'cus_1', 1)`, g.site, c.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := g.svc.DB.ExecContext(ctx, `INSERT INTO pay_payments (site_id, provider, id, connection_id, test, paid_at, currency, gross, customer_id, version) VALUES (?, 'dodo', 'pay_2', ?, 1, 1, 'USD', 100, 'cus_gone', 1)`, g.site, c.ID); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	g.svc.Now = func() time.Time { return now }

	d, ok, err := g.svc.Details(ctx, g.site, "dodo:cus_1", false)
	if err != nil || !ok || d.Name != "Ada" || d.Email != "ada@example.com" {
		t.Fatalf("details: %+v %v %v", d, ok, err)
	}
	if _, ok, _ := g.svc.Details(ctx, g.site, "dodo:cus_1", false); !ok || reads.Load() != 1 {
		t.Fatalf("second read should come from memory, provider read %d times", reads.Load())
	}
	if _, ok, _ := g.svc.Details(ctx, g.site, "dodo:cus_1", true); !ok || reads.Load() != 2 {
		t.Fatalf("licenses were not cached by a name-only read, provider read %d times", reads.Load())
	}
	now = now.Add(11 * time.Minute)
	if _, ok, _ := g.svc.Details(ctx, g.site, "dodo:cus_1", true); !ok || reads.Load() != 3 {
		t.Fatalf("after ten minutes it is read again, provider read %d times", reads.Load())
	}
	for _, k := range []string{"dodo:emailhash", "dodo:", "nocolon", "stripe:cus_1", "custom:x"} {
		if _, ok, err := g.svc.Details(ctx, g.site, k, false); ok || err != nil {
			t.Fatalf("%q: ok=%v err=%v", k, ok, err)
		}
	}
	// A customer the provider does not have is not asked for again for a minute.
	for i := 0; i < 3; i++ {
		if _, ok, _ := g.svc.Details(ctx, g.site, "dodo:cus_gone", false); ok {
			t.Fatal("found a customer the provider does not have")
		}
	}
	if gone.Load() != 1 {
		t.Fatalf("a customer the provider lacks was asked for %d times, want once", gone.Load())
	}
	// Nothing the provider said is in the database.
	var n int
	if err := g.svc.DB.QueryRowContext(ctx, `SELECT count(*) FROM pay_inbox WHERE instr(body, 'ada@example.com') > 0`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("the email reached the inbox: %d %v", n, err)
	}
}
