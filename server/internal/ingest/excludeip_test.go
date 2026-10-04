package ingest

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/trckable/trckable/server/internal/ipfilter"
)

func ownerSites(lines ...string) fakeSites {
	return fakeSites{"tkb_test": {ID: "tkb_test", Domain: "site.com", ProxyKey: "tkb_px_secret", ExcludeIPs: ipfilter.Prefixes(lines)}}
}

func postFrom(h http.Handler, remote, body string, hdr map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/e", strings.NewReader(body))
	req.Header.Set("User-Agent", chromeUA)
	req.RemoteAddr = remote
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

const visit = `{"s":"tkb_test","k":"pv","u":"https://site.com/","id":"a","v":"k3j2.m1a2b3"}`

// An excluded address is dropped before anything is counted: nothing reaches
// the log, the site is not marked seen, and the answer looks like any other.
func TestExcludedAddressIsNeverCounted(t *testing.T) {
	h, l := newHandler(t)
	h.Sites = ownerSites("203.0.113.0/24", "2001:db8::/32")
	seen := &seenRecorder{}
	h.Seen = seen

	for _, remote := range []string{"203.0.113.77:5555", "[2001:db8::7]:5555"} {
		w := postFrom(h, remote, visit, nil)
		if w.Code != http.StatusAccepted {
			t.Fatalf("%s: got %d", remote, w.Code)
		}
		if w.Header().Get("Set-Cookie") != "" {
			t.Fatalf("%s: a cookie went back to an excluded visitor", remote)
		}
	}
	if n, _ := l.Committed(); n != 0 {
		t.Fatalf("an excluded visit reached the log: %d", n)
	}
	if h.Stats.Accepted.Load() != 0 {
		t.Fatalf("an excluded visit was accepted: %d", h.Stats.Accepted.Load())
	}
	if seen.n.Load() != 0 {
		t.Fatal("an excluded visit marked the site as live")
	}

	// Anyone else is counted as before.
	if w := postFrom(h, "198.51.100.5:1", visit, nil); w.Code != http.StatusAccepted {
		t.Fatalf("got %d", w.Code)
	}
	if n, _ := l.Committed(); n != 1 {
		t.Fatalf("a visit from outside the list was not kept: %d", n)
	}
}

// Behind a same-origin proxy the address that counts is the one it forwards,
// and only with the site's key: a forged header from anywhere else changes nothing.
func TestExcludedAddressFollowsTheTrustedProxy(t *testing.T) {
	h, l := newHandler(t)
	h.Sites = ownerSites("203.0.113.7")
	// The proxy (198.51.100.1) says the visitor is the owner.
	postFrom(h, "198.51.100.1:1", visit, map[string]string{"X-Trckable-Proxy-Key": "tkb_px_secret", "X-Trckable-Client-IP": "203.0.113.7"})
	if n, _ := l.Committed(); n != 0 {
		t.Fatalf("a proxied owner visit was kept: %d", n)
	}
	// A stranger naming the owner's address without the key is not the owner.
	postFrom(h, "198.51.100.2:1", visit, map[string]string{"X-Trckable-Client-IP": "203.0.113.7"})
	if n, _ := l.Committed(); n != 1 {
		t.Fatalf("a forged header hid a real visit: %d", n)
	}
	// And the owner's own address, as the direct peer, is excluded whatever it forwards.
	postFrom(h, "203.0.113.7:9", visit, map[string]string{"X-Trckable-Client-IP": "198.51.100.9"})
	if n, _ := l.Committed(); n != 1 {
		t.Fatalf("the owner's direct visit was kept: %d", n)
	}
}

// The rule is checked before the hash and the geo lookup, so neither is ever
// asked about an excluded address.
func TestExcludedAddressIsNotLookedUp(t *testing.T) {
	h, _ := newHandler(t)
	h.Sites = ownerSites("203.0.113.0/24")
	var asked []string
	h.Geo = func(ip string) (string, string, string) { asked = append(asked, ip); return "DE", "", "" }
	h.Hosting = func(ip string) bool { asked = append(asked, ip); return false }
	postFrom(h, "203.0.113.50:1", visit, nil)
	if len(asked) != 0 {
		t.Fatalf("the address was used before it was dropped: %v", asked)
	}
}

// Nothing about who was excluded is kept: after a run of excluded and counted
// visits the handler holds no address, and the only trace is the counter.
func TestExcludedAddressIsNotRemembered(t *testing.T) {
	h, _ := newHandler(t)
	h.Sites = ownerSites("203.0.113.7")
	for i := 0; i < 5; i++ {
		postFrom(h, "203.0.113.7:1", visit, nil)
	}
	if h.limit != nil || h.limitIP != nil {
		t.Fatal("the rate limiter was fed an excluded address")
	}
	if len(h.seenAt) != 0 {
		t.Fatalf("the site was marked seen: %v", h.seenAt)
	}
	h.Seen = &seenRecorder{} // the check above means something: a counted visit does mark it
	postFrom(h, "198.51.100.5:1", visit, nil)
	if len(h.seenAt) != 1 {
		t.Fatalf("a counted visit did not mark the site seen: %v", h.seenAt)
	}
}

func TestEmptyListExcludesNobody(t *testing.T) {
	s := Site{}
	if s.SkipIP("203.0.113.7") || s.SkipIP("") {
		t.Fatal("an empty list excluded someone")
	}
	s.ExcludeIPs = []netip.Prefix{netip.MustParsePrefix("203.0.113.7/32")}
	if !s.SkipIP("203.0.113.7") || s.SkipIP("203.0.113.8") {
		t.Fatal("a single address matched wrong")
	}
}

type seenRecorder struct{ n atomic.Int64 }

func (s *seenRecorder) SeenSite(_ context.Context, _ string, _ int64) { s.n.Add(1) }
