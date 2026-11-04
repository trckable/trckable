package revenue

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/payments"
)

// A Dodo payment that names only a product id gets the name from the API: read
// once per distinct id, kept a day, a missing or failing product leaves it
// empty without stopping the payment, and a rebuild asks for nothing again.
func TestDodoProductNameFromAPI(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	var starter, gone, broken atomic.Int32
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
		case "/products/pdt_1":
			starter.Add(1)
			_, _ = io.WriteString(w, `{"name":"Starter"}`)
		case "/products/pdt_gone":
			gone.Add(1)
			w.WriteHeader(404)
			_, _ = io.WriteString(w, `{"message":"not found"}`)
		case "/products/pdt_err":
			broken.Add(1)
			w.WriteHeader(400)
			_, _ = io.WriteString(w, `{"message":"bad"}`)
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
	now := time.Now()
	g.svc.Now = func() time.Time { return now }

	add := func(id, product string) {
		body := fmt.Sprintf(`{"type":"payment.succeeded","timestamp":"2026-11-04T06:37:00Z","data":{"payment_id":%q,"status":"succeeded",
			"total_amount":1000,"currency":"USD","created_at":"2026-11-04T06:37:00Z","product_cart":[{"product_id":%q,"quantity":1}],"metadata":{}}}`, id, product)
		if _, err := g.svc.DB.ExecContext(ctx, `INSERT INTO pay_inbox (connection_id, event_key, received_at, body) VALUES (?, ?, 1, ?)`, c.ID, "k:"+id, body); err != nil {
			t.Fatal(err)
		}
	}
	productOf := func(id string) string {
		var p string
		if err := g.svc.DB.QueryRowContext(ctx, `SELECT product FROM pay_payments WHERE site_id = ? AND id = ?`, g.site, id).Scan(&p); err != nil {
			t.Fatalf("%s: %v", id, err)
		}
		return p
	}
	add("pay_1", "pdt_1")
	add("pay_2", "pdt_1")
	add("pay_3", "pdt_gone")
	add("pay_4", "pdt_err")
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	for id, want := range map[string]string{"pay_1": "Starter", "pay_2": "Starter", "pay_3": "", "pay_4": ""} {
		if got := productOf(id); got != want {
			t.Fatalf("%s product %q, want %q", id, got, want)
		}
	}
	if starter.Load() != 1 || gone.Load() != 1 || broken.Load() != 1 {
		t.Fatalf("reads: %d %d %d, want one each", starter.Load(), gone.Load(), broken.Load())
	}

	// A rebuild of the whole site asks for nothing it already knows.
	if _, err := g.svc.Reprocess(ctx, g.site); err != nil {
		t.Fatal(err)
	}
	if productOf("pay_1") != "Starter" || starter.Load() != 1 {
		t.Fatalf("after reprocess: %q, %d reads", productOf("pay_1"), starter.Load())
	}
	// A product that failed is asked for again after a minute, and a name after a day.
	now = now.Add(2 * time.Minute)
	if _, err := g.svc.Reprocess(ctx, g.site); err != nil {
		t.Fatal(err)
	}
	if starter.Load() != 1 || gone.Load() != 2 || broken.Load() != 2 {
		t.Fatalf("after a minute: %d %d %d", starter.Load(), gone.Load(), broken.Load())
	}
	now = now.Add(25 * time.Hour)
	if _, err := g.svc.Reprocess(ctx, g.site); err != nil {
		t.Fatal(err)
	}
	if starter.Load() != 2 {
		t.Fatalf("after a day: %d reads", starter.Load())
	}
}

// A Dodo that never answers a product read holds up neither the ledger lock
// (KeyMismatch takes it) nor the payment, which is stored without a name.
func TestHangingProductReadDoesNotHoldLock(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	asked := make(chan struct{}, 4)
	release := make(chan struct{})
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
		case "/products/pdt_1":
			asked <- struct{}{}
			select {
			case <-release:
			case <-r.Context().Done():
			}
		default:
			_, _ = io.WriteString(w, `{"items":[]}`)
		}
	}))
	t.Cleanup(srv.Close)
	t.Cleanup(func() { close(release) })
	payments.Remotes["dodo"] = &payments.DodoAPI{TestURL: srv.URL}
	t.Cleanup(func() { payments.Remotes["dodo"] = &payments.DodoAPI{} })
	t.Cleanup(g.svc.Wait)
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "dodo", Mode: "test", APIKey: "dodo_key", PublicBase: "https://stats.example"})
	if err != nil {
		t.Fatal(err)
	}
	g.svc.Wait()
	body := `{"type":"payment.succeeded","timestamp":"2026-11-04T06:37:00Z","data":{"payment_id":"pay_1","status":"succeeded",
		"total_amount":1000,"currency":"USD","created_at":"2026-11-04T06:37:00Z","product_cart":[{"product_id":"pdt_1","quantity":1}],"metadata":{}}}`
	if _, err := g.svc.DB.ExecContext(ctx, `INSERT INTO pay_inbox (connection_id, event_key, received_at, body) VALUES (?, 'k:1', 1, ?)`, c.ID, body); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { _, err := g.svc.Process(ctx); done <- err }()
	select {
	case <-asked:
	case <-time.After(5 * time.Second):
		t.Fatal("the product was never asked for")
	}
	locked := make(chan struct{})
	go func() { g.svc.KeyMismatch(); close(locked) }()
	select {
	case <-locked:
	case <-time.After(time.Second):
		t.Fatal("the ledger lock is held while a product is read")
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	var p string
	if err := g.svc.DB.QueryRowContext(ctx, `SELECT product FROM pay_payments WHERE id = 'pay_1'`).Scan(&p); err != nil || p != "" {
		t.Fatalf("payment stored with product %q, %v", p, err)
	}
}
