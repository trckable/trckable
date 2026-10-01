package server

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/config"
)

func newTestServer(t *testing.T, cfg config.Config) *Server {
	t.Helper()
	cfg.DataDir = t.TempDir()
	cfg.Addr = "127.0.0.1:0"
	if cfg.TrustProxy == "" {
		cfg.TrustProxy = "auto"
	}
	cfg.Geo = "off"
	s, err := New(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.ctl.Close(); _ = s.log.Close() })
	return s
}

func get(s *Server, path, bearer string) (int, string) {
	r := httptest.NewRequest(http.MethodGet, path, nil)
	if bearer != "" {
		r.Header.Set("Authorization", "Bearer "+bearer)
	}
	w := httptest.NewRecorder()
	s.http.Handler.ServeHTTP(w, r)
	b, _ := io.ReadAll(w.Result().Body)
	return w.Code, string(b)
}

// /metrics counts the whole installation: with no metrics token set it does
// not exist, and with one it answers only to that bearer.
func TestMetricsIsClosedByDefault(t *testing.T) {
	if code, _ := get(newTestServer(t, config.Config{}), "/metrics", ""); code != http.StatusNotFound {
		t.Fatalf("no token configured: %d, want 404", code)
	}
	// Even a bearer nobody configured, or an empty one, opens nothing.
	if code, _ := get(newTestServer(t, config.Config{}), "/metrics", "anything"); code != http.StatusNotFound {
		t.Fatalf("no token configured, a bearer sent: %d, want 404", code)
	}

	s := newTestServer(t, config.Config{MetricsToken: "tkb_test_metrics_0123456789"}) //nolint:gosec // a test value
	if code, _ := get(s, "/metrics", ""); code != http.StatusUnauthorized {
		t.Fatalf("metrics token set, no bearer: %d, want 401", code)
	}
	if code, _ := get(s, "/metrics", "wrong"); code != http.StatusUnauthorized {
		t.Fatalf("metrics token set, wrong bearer: %d, want 401", code)
	}
	if code, body := get(s, "/metrics", "tkb_test_metrics_0123456789"); code != http.StatusOK || !strings.Contains(body, "trckable_events_accepted_total") {
		t.Fatalf("the right bearer: %d %q", code, body)
	}

	// The automation token does not open it: that token reads every site.
	s = newTestServer(t, config.Config{APIToken: "tkb_test_api_0123456789"}) //nolint:gosec // a test value
	if code, _ := get(s, "/metrics", ""); code != http.StatusNotFound {
		t.Fatalf("only an API token set: %d, want 404", code)
	}
	if code, _ := get(s, "/metrics", "tkb_test_api_0123456789"); code != http.StatusNotFound {
		t.Fatalf("the API token as bearer, no metrics token: %d, want 404", code)
	}
	s = newTestServer(t, config.Config{APIToken: "tkb_test_api_0123456789", MetricsToken: "tkb_test_metrics_0123456789"}) //nolint:gosec // test values
	if code, _ := get(s, "/metrics", "tkb_test_api_0123456789"); code != http.StatusUnauthorized {
		t.Fatalf("the API token as bearer, a metrics token set: %d, want 401", code)
	}
}

// /readyz says which part is unhealthy, never what the database or the
// filesystem said.
func TestReadyzDoesNotLeakErrorText(t *testing.T) {
	s := newTestServer(t, config.Config{})
	if code, _ := get(s, "/readyz", ""); code != http.StatusOK {
		t.Fatalf("a healthy server: %d", code)
	}
	if err := s.ctl.Close(); err != nil { // the next ping fails with the driver's own words
		t.Fatal(err)
	}
	code, body := get(s, "/readyz", "")
	if code != http.StatusServiceUnavailable {
		t.Fatalf("a closed control database: %d, want 503", code)
	}
	for _, leak := range []string{"sql:", "closed", "trckable.db", s.cfg.DataDir} {
		if strings.Contains(body, leak) {
			t.Errorf("/readyz body shows %q: %s", leak, body)
		}
	}
	if !strings.Contains(body, "the control database is not answering") {
		t.Errorf("/readyz names no failing part: %s", body)
	}
}

// whoami tells the caller their own address and how it was read, and nothing
// else: no headers are echoed back, whatever the environment.
func TestWhoamiEchoesNoHeaders(t *testing.T) {
	t.Setenv("TRCKABLE_DEBUG_HEADERS", "1")
	s := newTestServer(t, config.Config{})
	r := httptest.NewRequest(http.MethodGet, "/_trckable/whoami", nil)
	r.RemoteAddr = "203.0.113.9:4000"
	r.Header.Set("X-Forwarded-For", "198.51.100.1")
	r.Header.Set("X-Real-IP", "198.51.100.2")
	w := httptest.NewRecorder()
	s.http.Handler.ServeHTTP(w, r)
	body := w.Body.String()
	for _, leak := range []string{"remote_addr", "x_forwarded_for", "x_real_ip", "198.51.100", "x_envoy"} {
		if strings.Contains(body, leak) {
			t.Errorf("whoami shows %q: %s", leak, body)
		}
	}
	if !strings.Contains(body, `"ip":"203.0.113.9"`) || !strings.Contains(body, `"forwarded":true`) {
		t.Errorf("whoami lost its own fields: %s", body)
	}
}

// Behind a proxy with TRCKABLE_TRUST_PROXY left on auto, the log says once
// what to set. A direct visit, a public peer, a mode that was chosen, and
// Railway (which has its own header) stay silent.
func TestProxyWithoutTrustIsSaidOnce(t *testing.T) {
	logged := func(cfg config.Config, peer string, headers map[string]string, requests int) int {
		var buf strings.Builder
		old := slog.Default()
		slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
		t.Cleanup(func() { slog.SetDefault(old) })
		s := newTestServer(t, cfg)
		for i := 0; i < requests; i++ {
			r := httptest.NewRequest(http.MethodGet, "/healthz", nil)
			r.RemoteAddr = peer
			for k, v := range headers {
				r.Header.Set(k, v)
			}
			s.http.Handler.ServeHTTP(httptest.NewRecorder(), r)
		}
		return strings.Count(buf.String(), "TRCKABLE_TRUST_PROXY=xff")
	}
	xff := map[string]string{"X-Forwarded-For": "198.51.100.4"}
	if n := logged(config.Config{}, "172.18.0.2:5000", xff, 3); n != 1 {
		t.Errorf("a proxy on a private address: %d warnings, want 1", n)
	}
	if n := logged(config.Config{}, "127.0.0.1:5000", map[string]string{"X-Forwarded-Proto": "https"}, 1); n != 1 {
		t.Errorf("a proxy on loopback: %d warnings, want 1", n)
	}
	if n := logged(config.Config{}, "127.0.0.1:5000", nil, 2); n != 0 {
		t.Errorf("a visit from localhost: %d warnings, want 0", n)
	}
	if n := logged(config.Config{}, "203.0.113.9:5000", xff, 2); n != 0 {
		t.Errorf("a public peer: %d warnings, want 0", n)
	}
	if n := logged(config.Config{TrustProxy: "xff"}, "172.18.0.2:5000", xff, 2); n != 0 {
		t.Errorf("a mode that was chosen: %d warnings, want 0", n)
	}
	if n := logged(config.Config{OnRailway: true}, "172.18.0.2:5000", xff, 2); n != 0 {
		t.Errorf("Railway: %d warnings, want 0", n)
	}
}

// `trckabled admin reset-password` runs in another process: it leaves an
// email in a file, and the server forgets that account's sign-in counters, so
// a locked-out owner can sign in at once.
func TestResetPasswordClearsTheSignInLimits(t *testing.T) {
	s := newTestServer(t, config.Config{})
	if _, err := s.ctl.CompleteSetup(context.Background(), "me@site.com", "correct horse battery"); err != nil {
		t.Fatal(err)
	}
	login := func(password string) int {
		r := httptest.NewRequest(http.MethodPost, "/api/v1/login", strings.NewReader(`{"email":"me@site.com","password":"`+password+`"}`))
		r.Header.Set("Content-Type", "application/json")
		r.RemoteAddr = "203.0.113.77:4000"
		w := httptest.NewRecorder()
		s.http.Handler.ServeHTTP(w, r)
		return w.Code
	}
	for i := 0; i < 10; i++ {
		if code := login("wrong password"); code != http.StatusUnauthorized {
			t.Fatalf("wrong password %d: %d", i+1, code)
		}
	}
	if code := login("correct horse battery"); code != http.StatusTooManyRequests {
		t.Fatalf("the owner's own address after ten wrong ones: %d, want 429", code)
	}
	path := filepath.Join(s.cfg.DataDir, ClearLoginsFile)
	if err := os.WriteFile(path, []byte("Someone@else.com\nME@site.com\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	s.takeLoginResets()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("the file was left behind: %v", err)
	}
	if code := login("correct horse battery"); code != http.StatusOK {
		t.Fatalf("after the reset: %d, want 200", code)
	}
}
