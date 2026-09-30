package revenue

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/payments"
)

// paddleEnv is one Paddle environment (live or sandbox) as a fake server:
// it knows the keys in `keys`, answers 403 for the paths in `deny`, and
// lists one completed transaction.
type paddleEnv struct {
	mu     sync.Mutex
	keys   map[string]bool
	deny   map[string]bool
	auths  []string // the Authorization header of every call
	posted int
}

func (e *paddleEnv) serve(t *testing.T) *httptest.Server {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		e.mu.Lock()
		defer e.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		e.auths = append(e.auths, r.Header.Get("Authorization"))
		if !e.keys[strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")] {
			w.WriteHeader(401)
			_, _ = io.WriteString(w, `{"error":{"type":"request_error","code":"authentication_malformed","detail":"nope"}}`)
			return
		}
		if e.deny[r.Method+" "+r.URL.Path] {
			w.WriteHeader(403)
			_, _ = io.WriteString(w, `{"error":{"type":"request_error","code":"forbidden","detail":"You aren't permitted to perform this request."}}`)
			return
		}
		switch {
		case r.Method == "POST" && r.URL.Path == "/notification-settings":
			e.posted++
			w.WriteHeader(201)
			_, _ = io.WriteString(w, `{"data":{"id":"ntfset_1","endpoint_secret_key":"pdl_ntfset_01_secret"}}`)
		case r.URL.Path == "/transactions" && r.URL.Query().Get("per_page") == "30":
			_, _ = io.WriteString(w, `{"data":[{"id":"txn_1","status":"completed","currency_code":"USD","origin":"web","billed_at":"`+time.Now().UTC().Format(time.RFC3339)+`","updated_at":"`+time.Now().UTC().Format(time.RFC3339)+`","details":{"totals":{"tax":"0","total":"1000","grand_total":"1000"}}}],"meta":{"pagination":{"per_page":30,"next":"","has_more":false}}}`)
		default:
			_, _ = io.WriteString(w, `{"data":[],"meta":{"pagination":{"per_page":1,"next":"","has_more":false}}}`)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func usePaddle(t *testing.T, g *rig, live, sandbox *paddleEnv) {
	payments.Remotes["paddle"] = &payments.PaddleAPI{BaseURL: live.serve(t).URL, SandboxURL: sandbox.serve(t).URL}
	t.Cleanup(func() { payments.Remotes["paddle"] = &payments.PaddleAPI{} })
	old := payments.RetryWait
	payments.RetryWait = func(context.Context, time.Duration) error { return nil }
	t.Cleanup(func() { payments.RetryWait = old })
	t.Cleanup(g.svc.Wait)
}

func connectPaddle(g *rig, key string) (Connection, error) {
	return g.svc.Connect(context.Background(), ConnectRequest{Site: g.site, Provider: "paddle", APIKey: key, PublicBase: "https://stats.example"})
}

// A sandbox key connects the sandbox, whatever mode was picked, is stored as
// test mode, and its payments stay out of the real numbers, through the
// reconciliation, which follows the same environment.
func TestPaddleSandboxKeyIsTestMoney(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	live, sandbox := &paddleEnv{keys: map[string]bool{}}, &paddleEnv{keys: map[string]bool{"pdl_sdbx_apikey_01_a_b": true}}
	usePaddle(t, g, live, sandbox)
	c, err := connectPaddle(g, " \"pdl_sdbx_apikey_01_a_b\"\n") // pasted with quotes and spaces
	if err != nil || c.Mode != "test" {
		t.Fatalf("connect: %+v %v", c, err)
	}
	g.svc.Wait()
	if len(live.auths) != 0 {
		t.Fatalf("the sandbox key was sent to live Paddle: %d calls", len(live.auths))
	}
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	from, to := time.Now().Add(-time.Hour), time.Now().Add(time.Hour)
	if f, _ := g.svc.Facts(ctx, g.site, "USD", from, to, false); len(f) != 0 {
		t.Fatalf("sandbox money in real numbers: %+v", f)
	}
	if f, _ := g.svc.Facts(ctx, g.site, "USD", from, to, true); len(f) != 1 || f[0].Amount != 1000 {
		t.Fatalf("test view: %+v", f)
	}
}

// An older key (no prefix) that only the sandbox knows connects there and
// is remembered as test mode; one that live knows stays live.
func TestPaddleOlderKeyFindsItsEnvironment(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	live, sandbox := &paddleEnv{keys: map[string]bool{"livelegacykey": true}}, &paddleEnv{keys: map[string]bool{"sandboxlegacykey": true}}
	usePaddle(t, g, live, sandbox)
	c, err := connectPaddle(g, "sandboxlegacykey")
	if err != nil || c.Mode != "test" {
		t.Fatalf("sandbox legacy: %+v %v", c, err)
	}
	g.svc.Wait()
	c, err = connectPaddle(g, "livelegacykey")
	if err != nil || c.Mode != "live" {
		t.Fatalf("live legacy: %+v %v", c, err)
	}
}

// A failed connect says what is wrong in plain words and leaves nothing
// behind: no connection row, no webhook.
func TestPaddleConnectErrors(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	live := &paddleEnv{keys: map[string]bool{"pdl_live_apikey_01_a_b": true}, deny: map[string]bool{"POST /notification-settings": true}}
	sandbox := &paddleEnv{keys: map[string]bool{}}
	usePaddle(t, g, live, sandbox)
	for _, c := range []struct{ key, want string }{
		{"pdl_live_apikey_02_a_b", "Paddle didn't accept this key."},
		{"pdl_live_apikey_01_a_b", "This Paddle key is missing a permission: notification_setting.write."},
	} {
		if _, err := connectPaddle(g, c.key); err == nil || err.Error() != c.want {
			t.Errorf("%s: %v", c.key[:15], err)
		}
	}
	list, _ := g.svc.Connections(context.Background(), g.site, "")
	if len(list) != 0 || live.posted != 0 {
		t.Fatalf("left behind: %+v (%d webhooks)", list, live.posted)
	}
}
