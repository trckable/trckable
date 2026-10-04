package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestShareDomainHostAndPathProbes(t *testing.T) {
	g := newRig(t)
	g.api.ShareDomainSkipVerify = true
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	if code, out := do(t, c, "PUT", base+"/share-look", `{"domain":"reports.example.com"}`, csrf, "1"); code != 200 {
		t.Fatalf("set: %d %v", code, out)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/sites/{site}/report", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("LEAK")) })
	mux.HandleFunc("GET /login", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("LEAK")) })
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("LEAK-root")) })
	h := g.api.ShareDomains(mux)
	for _, tc := range []struct{ host, raw string }{
		{"reports.example.com.", "/login"},
		{"reports.example.com.:443", "/login"},
		{"REPORTS.EXAMPLE.COM", "/login"},
		{"reports.example.com", "/assets/../login"},
		{"reports.example.com", "/api/v1/share/..%2f..%2fsites/" + g.site + "/report"},
		{"reports.example.com", "/assets/%2e%2e/login"},
		{"reports.example.com", "/api/v1/share/../sites/" + g.site + "/report"},
	} {
		r := httptest.NewRequest("GET", "http://x"+tc.raw, nil)
		r.Host = tc.host
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		body := w.Body.String()
		t.Logf("host=%q path=%q -> %d %q loc=%q", tc.host, tc.raw, w.Code, body, w.Header().Get("Location"))
		if strings.HasPrefix(body, "LEAK") {
			t.Errorf("LEAK host=%q path=%q", tc.host, tc.raw)
		}
	}
}

func TestSVGStyleCannotHideAnImportBehindAChild(t *testing.T) {
	in := `<svg xmlns="http://www.w3.org/2000/svg"><style><title>x</title>@import url(https://evil.example/x.css);</style></svg>`
	if out, err := cleanSVG([]byte(in)); err == nil {
		t.Errorf("accepted an @import after a child element: %s", out)
	}
	in2 := `<svg xmlns="http://www.w3.org/2000/svg"><rect style="background-image:image-set('https://evil.example/p.png' 1x)"/></svg>`
	if out, err := cleanSVG([]byte(in2)); err == nil {
		t.Errorf("accepted image-set with an outside address: %s", out)
	}
}
