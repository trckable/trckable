package api

import (
	"bytes"
	"context"
	"crypto/tls"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Only a plain public name is looked up: never an address, a port, a path,
// credentials or a name that can only mean somewhere inside a network.
func TestRefHost(t *testing.T) {
	ok := map[string]string{"GitHub.com": "github.com", "news.ycombinator.com": "news.ycombinator.com", " t.co ": "t.co", "xn--bcher-kva.example": "xn--bcher-kva.example"}
	for in, want := range ok {
		if got, good := refHost(in); !good || got != want {
			t.Errorf("%q: got %q %v, want %q", in, got, good, want)
		}
	}
	for _, in := range []string{"", "localhost", "127.0.0.1", "10.0.0.5", "[::1]", "a.b.c.4", "example.com:8080", "example.com/path", "user@example.com", "http://example.com",
		"intranet", "db.internal", "printer.local", "x.localhost", "a..b.com", "-a.example.com", "a-.example.com", "exa mple.com", strings.Repeat("a", 64) + ".com", strings.Repeat("a.", 130) + "com"} {
		if h, good := refHost(in); good {
			t.Errorf("%q must be refused, got %q", in, h)
		}
	}
}

// iconServer is a site that has an icon in each of the ways one can be wrong.
func iconServer(t *testing.T, hits *atomic.Int32) *httptest.Server {
	t.Helper()
	big := append([]byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}, make([]byte, 70<<10)...)
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		switch {
		case strings.HasPrefix(r.Host, "nope."):
			http.NotFound(w, r)
		case strings.HasPrefix(r.Host, "html."): // an error page where the icon should be
			if r.URL.Path == "/favicon.ico" {
				_, _ = w.Write([]byte("<html><script>alert(1)</script></html>"))
				return
			}
			http.NotFound(w, r)
		case strings.HasPrefix(r.Host, "svg."):
			w.Header().Set("Content-Type", "image/svg+xml")
			_, _ = w.Write([]byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`))
		case strings.HasPrefix(r.Host, "big."):
			_, _ = w.Write(big)
		case strings.HasPrefix(r.Host, "slow."):
			time.Sleep(2 * time.Second)
		case r.URL.Path == "/":
			_, _ = w.Write([]byte(`<link rel="icon" href="/brand/i.png">`))
		case r.URL.Path == "/brand/i.png":
			_, _ = w.Write(onePixel)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

// toServer is a client that sends every name to srv, whatever it says.
func toServer(srv *httptest.Server, timeout time.Duration) *http.Client {
	addr := srv.Listener.Addr().String()
	return &http.Client{Timeout: timeout, Transport: &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec // a test server's own certificate
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, network, addr)
		},
	}}
}

func TestFetchRefIcon(t *testing.T) {
	var hits atomic.Int32
	srv := iconServer(t, &hits)
	ctx := context.Background()
	c := toServer(srv, time.Second)

	if typ, data := fetchRefIcon(ctx, c, "https://icons.example.org/"); typ != "image/png" || !bytes.Equal(data, onePixel) {
		t.Fatalf("the icon the page names: %q, %d bytes", typ, len(data))
	}
	for _, host := range []string{"nope", "html", "svg", "big", "slow"} {
		if typ, data := fetchRefIcon(ctx, c, "https://"+host+".example.org/"); typ != "" || data != nil {
			t.Errorf("%s: a page that is not an icon, an SVG, a big file and a slow server give nothing, got %q (%d bytes)", host, typ, len(data))
		}
	}
}

// The guard that every other fetch of this server goes through: an address
// inside the machine or its network is never connected to, however it is reached.
func TestRefIconNeverReachesInside(t *testing.T) {
	var hits atomic.Int32
	srv := iconServer(t, &hits) // listens on 127.0.0.1
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for _, home := range []string{srv.URL + "/", strings.Replace(srv.URL, "https://", "http://", 1) + "/", "https://localhost:1/", "https://[::1]:1/", "https://169.254.169.254/", "https://10.0.0.1/"} {
		if typ, data := fetchRefIcon(ctx, refIconClient(), home); typ != "" || data != nil {
			t.Errorf("%s: got an icon from inside", home)
		}
	}
	if n := hits.Load(); n != 0 {
		t.Fatalf("the server on this machine was reached %d times", n)
	}
}

func TestReferrerIconsRoutes(t *testing.T) {
	var hits atomic.Int32
	srv := iconServer(t, &hits)
	old := refIconClient
	refIconClient = func() *http.Client { return toServer(srv, 2*time.Second) }
	t.Cleanup(func() { refIconClient = old })

	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	base := g.srv.URL + "/api/v1/referrer-icons"
	if code, _, _ := get(t, client(), base+"?host=icons.example.org"); code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", code)
	}
	// The ones with an icon come back, in the order asked; addresses and the like are skipped without being fetched.
	q := "?host=icons.example.org&host=nope.example.org&host=127.0.0.1&host=svg.example.org&host=localhost"
	code, _, body := get(t, owner, base+q)
	if code != http.StatusOK || body != "{\"icons\":[\"icons.example.org\"]}\n" {
		t.Fatalf("icons: %d %q", code, body)
	}
	after := hits.Load()
	if after == 0 {
		t.Fatal("the server never fetched anything")
	}
	// A second ask (and the picture itself) is answered from what is kept.
	if code, _, body = get(t, owner, base+q); code != http.StatusOK || !strings.Contains(body, "icons.example.org") {
		t.Fatalf("again: %d %q", code, body)
	}
	res, err := owner.Get(base + "/icons.example.org")
	if err != nil {
		t.Fatal(err)
	}
	var pic bytes.Buffer
	_, _ = pic.ReadFrom(res.Body)
	res.Body.Close()
	if res.StatusCode != http.StatusOK || res.Header.Get("Content-Type") != "image/png" || res.Header.Get("X-Content-Type-Options") != "nosniff" || !bytes.Equal(pic.Bytes(), onePixel) {
		t.Fatalf("picture: %d %q", res.StatusCode, res.Header.Get("Content-Type"))
	}
	if hits.Load() != after {
		t.Fatalf("a cached answer went out again: %d fetches, was %d", hits.Load(), after)
	}
	// It never reaches out: a host nobody asked about is not fetched by asking for its picture.
	for _, host := range []string{"unasked.example.org", "nope.example.org", "127.0.0.1"} {
		if code, _, _ := get(t, owner, base+"/"+host); code != http.StatusNotFound {
			t.Errorf("%s: %d, want 404", host, code)
		}
	}
	if hits.Load() != after {
		t.Fatal("asking for a picture fetched something")
	}
	many := "?host=a.example.org"
	for i := 0; i < maxRefIconHosts; i++ {
		many += "&host=a.example.org"
	}
	if code, _, _ := get(t, owner, base+many); code != http.StatusBadRequest {
		t.Fatalf("too many hosts: %d", code)
	}
}

// The cache is bounded and forgets in the order it learned.
func TestRefIconCacheIsBounded(t *testing.T) {
	c := newRefIcons()
	now := time.Now()
	for i := 0; i < refIconEntries+50; i++ {
		c.put(strings.Repeat("a", 1+i%50)+string(rune('a'+i%26))+".example.org"+strings.Repeat("x", i/50), &refIcon{typ: "image/png", at: now})
	}
	if len(c.m) > refIconEntries {
		t.Fatalf("%d entries, limit %d", len(c.m), refIconEntries)
	}
	c.put("old.example.org", &refIcon{at: now.Add(-2 * refIconMissKeep)})
	if _, ok := c.get("old.example.org", now); ok {
		t.Fatal("a day-old miss is asked again")
	}
}
