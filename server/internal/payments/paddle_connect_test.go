package payments

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"
)

// paddleFake answers by environment: env(sandbox) → path → status. A path
// without an entry answers 200 (a creation answers with a webhook endpoint).
type paddleFake struct {
	live, sandbox *fakeAPI
	answers       map[string]map[string]int // "live"|"sandbox" → "METHOD /path" → status
	api           *PaddleAPI
}

func newPaddleFake(t *testing.T, answers map[string]map[string]int) *paddleFake {
	f := &paddleFake{answers: answers}
	route := func(env string) func(w http.ResponseWriter, r *http.Request, _ []byte) {
		return func(w http.ResponseWriter, r *http.Request, _ []byte) {
			if st := f.answers[env][r.Method+" "+r.URL.Path]; st >= 300 {
				jsonAnswer(w, st, `{"error":{"type":"request_error","code":"x","detail":"Paddle says no."}}`)
				return
			}
			if r.Method == "POST" {
				jsonAnswer(w, 201, `{"data":{"id":"ntfset_1","endpoint_secret_key":"pdl_ntfset_01_secret"}}`)
				return
			}
			jsonAnswer(w, 200, `{"data":[],"meta":{"pagination":{"per_page":1,"next":"","has_more":false}}}`)
		}
	}
	f.live = newFake(t, route("live"))
	f.sandbox = newFake(t, route("sandbox"))
	f.api = &PaddleAPI{BaseURL: f.live.srv.URL, SandboxURL: f.sandbox.srv.URL}
	return f
}

func (f *paddleFake) setup(key string) (Setup, error) {
	return f.api.Setup(context.Background(), key, false, "https://stats.example/webhooks/paddle/pc_1")
}

func TestPaddleKeyPrefixPicksTheEnvironment(t *testing.T) {
	noWait(t)
	for _, c := range []struct {
		key      string
		picked   bool
		sandbox  bool
		hitsLive int
	}{
		{"pdl_live_apikey_01_x_y", true, false, 3},
		{"pdl_sdbx_apikey_01_x_y", false, true, 0},
	} {
		f := newPaddleFake(t, nil)
		s, err := f.api.Setup(context.Background(), c.key, c.picked, "https://stats.example/webhooks/paddle/pc_1")
		if err != nil || s.Test != c.sandbox || f.live.called("") != c.hitsLive {
			t.Errorf("%s: %+v %v, live calls %d", c.key[:8], s, err, f.live.called(""))
		}
		if got := f.api.base(c.key, !c.sandbox); got != f.api.baseURL(c.sandbox) {
			t.Errorf("%s: later calls go to %s", c.key[:8], got)
		}
	}
	if (&PaddleAPI{}).baseURL(true) != "https://sandbox-api.paddle.com" || (&PaddleAPI{}).baseURL(false) != "https://api.paddle.com" {
		t.Fatal("the real addresses")
	}
}

// A key without a prefix is tried against live first, and once against the
// sandbox when live doesn't accept it; the answer is remembered as Test, and
// the later calls (Teardown, Hooks, Sync) follow it.
func TestPaddleKeyWithoutPrefixTriesLiveThenSandbox(t *testing.T) {
	noWait(t)
	f := newPaddleFake(t, map[string]map[string]int{"live": {"GET /transactions": 401}})
	s, err := f.setup("0123456789abcdef0123456789abcdef0123456789abcdef01")
	if err != nil || !s.Test || s.Secret == "" {
		t.Fatalf("a sandbox key without a prefix: %+v %v", s, err)
	}
	if f.live.called("GET /transactions") != 1 || f.sandbox.called("GET /transactions") != 1 || f.sandbox.called("POST /notification-settings") != 1 || f.live.called("POST") != 0 {
		t.Fatalf("calls: live %v sandbox %v", f.live.calls, f.sandbox.calls)
	}
	if f.api.base("0123", s.Test) != f.sandbox.srv.URL || f.api.base("0123", false) != f.live.srv.URL {
		t.Fatal("the remembered environment is not followed")
	}

	f = newPaddleFake(t, nil)
	if s, err := f.setup("0123456789abcdef0123456789abcdef0123456789abcdef01"); err != nil || s.Test || f.sandbox.called("") != 0 {
		t.Fatalf("a live key without a prefix: %+v %v, sandbox calls %v", s, err, f.sandbox.calls)
	}
}

func TestPaddleUnknownKeyIsRejectedAfterOneTryPerEnvironment(t *testing.T) {
	noWait(t)
	both := map[string]int{"GET /transactions": 401}
	f := newPaddleFake(t, map[string]map[string]int{"live": both, "sandbox": both})
	_, err := f.setup("0123456789abcdef0123456789abcdef0123456789abcdef01")
	if err == nil || err.Error() != "Paddle didn't accept this key." || f.live.called("GET") != 1 || f.sandbox.called("GET") != 1 {
		t.Fatalf("%v, live %v sandbox %v", err, f.live.calls, f.sandbox.calls)
	}
	// A prefixed key is not tried anywhere else.
	f = newPaddleFake(t, map[string]map[string]int{"sandbox": both})
	if _, err := f.setup("pdl_sdbx_apikey_01_x_y"); err == nil || err.Error() != msgPaddleRejected || f.live.called("") != 0 {
		t.Fatalf("%v, live %v", err, f.live.calls)
	}
}

// The live answer is the one reported when the sandbox doesn't know the key
// either: a live key that lacks a permission is told so, not "not accepted".
func TestPaddleUnprefixedKeyMissingAPermissionOnLive(t *testing.T) {
	noWait(t)
	f := newPaddleFake(t, map[string]map[string]int{"live": {"GET /transactions": 403}, "sandbox": {"GET /transactions": 401}})
	_, err := f.setup("0123456789abcdef0123456789abcdef0123456789abcdef01")
	if err == nil || err.Error() != "This Paddle key is missing a permission: transaction.read." {
		t.Fatalf("%v", err)
	}
}

func TestPaddleSetupNamesTheMissingPermissions(t *testing.T) {
	noWait(t)
	for _, c := range []struct {
		name    string
		denied  map[string]int
		message string
	}{
		{"webhooks", map[string]int{"POST /notification-settings": 403}, "This Paddle key is missing a permission: notification_setting.write."},
		{"transactions", map[string]int{"GET /transactions": 403}, "This Paddle key is missing a permission: transaction.read."},
		{"both reads", map[string]int{"GET /transactions": 403, "GET /adjustments": 403}, "This Paddle key is missing permissions: transaction.read, adjustment.read."},
	} {
		f := newPaddleFake(t, map[string]map[string]int{"sandbox": c.denied})
		_, err := f.setup("pdl_sdbx_apikey_01_x_y")
		if err == nil || err.Error() != c.message {
			t.Errorf("%s: %v", c.name, err)
		}
		if f.sandbox.called("POST") != 0 && c.name != "webhooks" {
			t.Errorf("%s: a webhook was created for a key that can't read", c.name)
		}
	}
}

func TestPaddleUnreachableAndServerErrors(t *testing.T) {
	noWait(t)
	f := newPaddleFake(t, map[string]map[string]int{"sandbox": {"GET /transactions": 503}})
	if _, err := f.setup("pdl_sdbx_apikey_01_x_y"); err == nil || err.Error() != "Couldn't reach Paddle. Try again in a minute." {
		t.Fatalf("a 5xx: %v", err)
	}
	// The creation itself failing with a 5xx is not sent twice (it may have worked).
	f = newPaddleFake(t, map[string]map[string]int{"sandbox": {"POST /notification-settings": 500}})
	if _, err := f.setup("pdl_sdbx_apikey_01_x_y"); err == nil || err.Error() != msgPaddleUnreachable || f.sandbox.called("POST") != 1 {
		t.Fatalf("a 5xx on creation: %v (%d posts)", err, f.sandbox.called("POST"))
	}
	// Nothing listening.
	f = newPaddleFake(t, nil)
	f.sandbox.srv.Close()
	if _, err := f.setup("pdl_sdbx_apikey_01_x_y"); err == nil || err.Error() != msgPaddleUnreachable {
		t.Fatalf("a dead connection: %v", err)
	}
}

// A client timeout is Paddle not answering, not the owner giving up: it is
// told as "couldn't reach", and the probe is tried once more, not four times.
func TestPaddleTimeoutIsUnreachable(t *testing.T) {
	old := HTTPClient
	HTTPClient = &http.Client{Timeout: 50 * time.Millisecond}
	t.Cleanup(func() { HTTPClient = old })
	waits := noWait(t)
	f := newPaddleFake(t, nil)
	release := make(chan struct{})
	f.sandbox.route = func(http.ResponseWriter, *http.Request, []byte) { <-release }
	t.Cleanup(func() { close(release) })
	_, err := f.setup("pdl_sdbx_apikey_01_x_y")
	if err == nil || err.Error() != msgPaddleUnreachable || f.sandbox.called("GET /transactions") != probeAttempts || len(*waits) != probeAttempts-1 {
		t.Fatalf("%v: %d probes, waits %v", err, f.sandbox.called("GET /transactions"), *waits)
	}
	// The owner leaving is not Paddle being down.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := f.api.Setup(ctx, "pdl_sdbx_apikey_01_x_y", false, "https://stats.example/webhooks/paddle/pc_1"); err == nil || err.Error() == msgPaddleUnreachable {
		t.Fatalf("a cancelled request: %v", err)
	}
}

// When live and the sandbox both answer 403, live's answer is the one
// reported, and the sandbox is not asked anything else.
func TestPaddleBothForbiddenReportsLive(t *testing.T) {
	noWait(t)
	denied := map[string]int{"GET /transactions": 403}
	f := newPaddleFake(t, map[string]map[string]int{"live": denied, "sandbox": denied})
	_, err := f.setup("0123456789abcdef0123456789abcdef0123456789abcdef01")
	if err == nil || err.Error() != "This Paddle key is missing a permission: transaction.read." || f.sandbox.called("GET /adjustments") != 0 {
		t.Fatalf("%v, sandbox %v", err, f.sandbox.calls)
	}
}

func TestPaddleErrorsNeverCarryTheKey(t *testing.T) {
	noWait(t)
	key := "pdl_sdbx_apikey_01hsecretsecretsecret_x_y"
	for _, st := range []int{401, 403, 500} {
		f := newPaddleFake(t, map[string]map[string]int{"sandbox": {"GET /transactions": st}})
		_, err := f.setup(key)
		var plain *UserError
		if !errors.As(err, &plain) || strings.Contains(err.Error(), "secretsecret") {
			t.Errorf("%d: %v", st, err)
		}
	}
}

func TestCleanKey(t *testing.T) {
	for in, want := range map[string]string{ //nolint:gosec // made-up keys for tests only
		"  pdl_live_apikey_x \n": "pdl_live_apikey_x",
		`"pdl_live_apikey_x"`:    "pdl_live_apikey_x",
		"'pdl_live_apikey_x' ":   "pdl_live_apikey_x",
		" “pdl_live_apikey_x”":   "pdl_live_apikey_x",
		"pdl_live_apikey_x":      "pdl_live_apikey_x",
		` " ' `:                  "",
	} {
		if got := CleanKey(in); got != want {
			t.Errorf("CleanKey(%q) = %q", in, got)
		}
	}
}
