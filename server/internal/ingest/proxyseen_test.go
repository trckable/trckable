package ingest

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type proxySeenLog struct {
	mu   sync.Mutex
	hits []string
}

func (p *proxySeenLog) SeenProxied(_ context.Context, site string, _ int64) {
	p.mu.Lock()
	p.hits = append(p.hits, site)
	p.mu.Unlock()
}

func (p *proxySeenLog) count() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.hits)
}

func sendWithKey(h http.Handler, key string) int {
	req := httptest.NewRequest(http.MethodPost, "/api/e", strings.NewReader(`{"s":"tkb_test","k":"pv","u":"https://site.com/"}`))
	req.Header.Set("User-Agent", chromeUA)
	req.RemoteAddr = "203.0.113.77:5555"
	if key != "" {
		req.Header.Set("X-Trckable-Proxy-Key", key)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w.Code
}

// The last event through the proxy is written down, only with the site's key
// and at most every few minutes; a plain visit or a wrong key writes nothing.
func TestProxiedEventsAreRecorded(t *testing.T) {
	h, _ := newHandler(t)
	seen := &proxySeenLog{}
	h.Proxied = seen
	now := time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC)
	h.Now = func() time.Time { return now }

	sendWithKey(h, "")
	sendWithKey(h, "tkb_px_wrong")
	time.Sleep(20 * time.Millisecond)
	if n := seen.count(); n != 0 {
		t.Fatalf("a visit without the proxy key was recorded as proxied (%d)", n)
	}
	sendWithKey(h, "tkb_px_secret")
	sendWithKey(h, "tkb_px_secret")
	waitFor(t, func() bool { return seen.count() == 1 })
	now = now.Add(11 * time.Minute)
	sendWithKey(h, "tkb_px_secret")
	waitFor(t, func() bool { return seen.count() == 2 })
}

func waitFor(t *testing.T, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for !ok() {
		if time.Now().After(deadline) {
			t.Fatal("timed out")
		}
		time.Sleep(5 * time.Millisecond)
	}
}
