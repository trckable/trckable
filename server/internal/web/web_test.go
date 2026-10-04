package web

import (
	"bytes"
	"compress/gzip"
	"context"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

// A site's settings reach its script through a prelude, so that the tracker
// spends no bytes reading them. Two sites must never get each other's, and a
// changed word must not be served from a cache.
func TestTrackerPrelude(t *testing.T) {
	opts := map[string]ScriptOpts{
		"tkb_free": {ConsentFree: true},
		"tkb_bar":  {BannerText: "Ein Cookie, nur zum Zählen.", BannerDecline: "Nein danke", BannerPolicy: "/datenschutz"},
		"tkb_bare": {},
	}
	h := Tracker(
		func(string) []string { return []string{"goals"} },
		func(site string) ScriptOpts { return opts[site] },
	)
	get := func(site string) (string, string) {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/js/"+site+".js", nil))
		if w.Code != http.StatusOK {
			t.Fatalf("%s: status %d", site, w.Code)
		}
		// Every site's script names its own site first (a tag without
		// data-site still counts); the rest follows it.
		line := `document.currentScript.dataset.site=document.currentScript.dataset.site||"` + site + `";`
		body, ok := strings.CutPrefix(w.Body.String(), line)
		if !ok {
			t.Fatalf("%s: the script does not name its site first: %.90q", site, w.Body.String())
		}
		return body, w.Header().Get("ETag")
	}

	free, freeTag := get("tkb_free")
	if !strings.HasPrefix(free, "document.currentScript.dataset.cookieless='';") {
		t.Errorf("consent-free site did not get the cookieless prelude: %.60q", free)
	}
	if strings.Contains(free, "dataset.bannerText=") {
		t.Error("consent-free site got banner wording it never set")
	}

	bar, barTag := get("tkb_bar")
	if !strings.Contains(bar, `dataset.bannerText="Ein Cookie, nur zum Zählen."`) {
		t.Errorf("the bar's wording is missing: %.120q", bar)
	}
	if !strings.Contains(bar, `dataset.bannerDecline="Nein danke"`) || !strings.Contains(bar, `dataset.bannerPolicy="/datenschutz"`) {
		t.Errorf("part of the wording is missing: %.200q", bar)
	}
	if strings.Contains(bar, "dataset.bannerAccept=") {
		t.Error("an empty field must stay empty, not be set to nothing")
	}
	if strings.HasPrefix(bar, "document.currentScript.dataset.cookieless") {
		t.Error("a site that is not consent-free got the cookieless prelude")
	}

	bare, bareTag := get("tkb_bare")
	if !strings.HasPrefix(bare, "/*! trckable MIT */") {
		t.Errorf("a site with no settings got more than its site: %.60q", bare)
	}
	for _, pair := range [][2]string{{freeTag, barTag}, {freeTag, bareTag}, {barTag, bareTag}} {
		if pair[0] == pair[1] {
			t.Errorf("two different scripts share the etag %s", pair[0])
		}
	}
}

// A quote or a newline in the wording must not be able to end the string it
// lives in: the prelude is JavaScript, and the text comes from a form.
func TestPreludeQuotesTheWording(t *testing.T) {
	got := prelude(ScriptOpts{BannerText: "She said \"no\";\n</script>"})
	if strings.Contains(got, "\n") || strings.Contains(got, `said "no"`) {
		t.Errorf("wording was not escaped: %q", got)
	}
	if !strings.Contains(got, `\"no\"`) {
		t.Errorf("expected escaped quotes: %q", got)
	}
}

// The look is a set of custom properties the bar's own stylesheet already
// reads, and the site's CSS comes last so it can override any of them.
func TestBannerCSS(t *testing.T) {
	got := bannerCSS(ScriptOpts{
		BannerBg: "#0a2540", BannerButton: "#00d4ff", BannerPosition: "wide",
	})
	for _, want := range []string{"--tkb-bg:#0a2540", "--tkb-button:#00d4ff", "--tkb-at:auto 12px 12px 12px", "--tkb-width:none"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %s in %q", want, got)
		}
	}
	if strings.Contains(got, "--tkb-fg") || strings.Contains(got, "--tkb-round") {
		t.Errorf("a value nobody set was invented: %q", got)
	}

	// Nothing picked and nothing written: no stylesheet at all.
	if s := bannerCSS(ScriptOpts{}); s != "" {
		t.Errorf("empty settings produced %q", s)
	}

	// The site's own CSS is last, so it wins over everything above it.
	own := bannerCSS(ScriptOpts{BannerBg: "#fff", BannerCSS: "div{border:2px solid red}"})
	if !strings.HasSuffix(own, "div{border:2px solid red}") {
		t.Errorf("the site's CSS is not last: %q", own)
	}
}

func TestFormsVariant(t *testing.T) {
	if got := VariantName([]string{"forms", "goals"}); got != "gf" {
		t.Fatalf("variant = %q, want gf (features in the tracker's order)", got)
	}
}

// The heatmaps module is a file of its own: a site with it gets the base script
// byte for byte, then the module; a site without it gets neither a byte of it.
func TestHeatmapsFollowTheBaseScript(t *testing.T) {
	get := func(features ...string) string {
		h := Tracker(func(string) []string { return features }, nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/js/tkb_x.js", nil))
		if w.Code != http.StatusOK {
			t.Fatalf("status %d", w.Code)
		}
		body, _ := strings.CutPrefix(w.Body.String(), `document.currentScript.dataset.site=document.currentScript.dataset.site||"tkb_x";`)
		return body
	}
	plain := get("goals")
	with := get("goals", "heat")
	heat, err := assets.ReadFile("assets/heat.js")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(plain, string(heat)) {
		t.Error("a site without the module was sent it")
	}
	if want := plain + ";" + string(heat); with != want {
		t.Errorf("the script with heatmaps is not the base script, a semicolon and the module (%d bytes, want %d)", len(with), len(want))
	}
	if get("heat") == get("goals", "heat") {
		t.Error("the module was sent after the wrong base script")
	}
}

func TestOnlyEmbeddableLinksCanBeFramed(t *testing.T) {
	h := DashboardFramed(func(r *http.Request) string {
		if r.URL.Path == "/s/embeddable" {
			return "https://example.com"
		}
		return ""
	})
	for path, want := range map[string]string{"/s/embeddable": "frame-ancestors https://example.com;", "/s/plain": "frame-ancestors 'none';", "/demo.example.com": "frame-ancestors 'none';"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		csp := w.Header().Get("Content-Security-Policy")
		if !strings.Contains(csp, want) {
			t.Errorf("%s: CSP %q, want %q", path, csp, want)
		}
		if deny := w.Header().Get("X-Frame-Options") == "DENY"; deny != (want == "frame-ancestors 'none';") {
			t.Errorf("%s: X-Frame-Options DENY = %v", path, deny)
		}
	}
}

// The dashboard frames only pages of its own origin; another site's page
// never loads inside it.
func TestDashboardFramesOnlyItsOwnOrigin(t *testing.T) {
	h := DashboardFramed(func(*http.Request) string { return "" })
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	csp := w.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "frame-src 'self';") || strings.Contains(csp, "frame-src *") || strings.Contains(csp, "child-src") {
		t.Errorf("CSP %q: want frame-src 'self' only", csp)
	}
}

func TestAcceptsReadsAcceptEncoding(t *testing.T) {
	for _, c := range []struct {
		header, coding string
		want           bool
	}{
		{"gzip, deflate, br", "br", true},
		{"gzip, deflate, br", "gzip", true},
		{"gzip", "br", false},
		{"", "gzip", false},
		{"br;q=0", "br", false},
		{"br;q=0.5, gzip", "br", true},
		{"*", "br", true},
		{"*;q=0", "br", false},
		{"gzip;q=0, *", "gzip", false}, // named beats the wildcard
		{"GZIP", "gzip", true},
		{"identity", "gzip", false},
	} {
		if got := Accepts(c.header, c.coding); got != c.want {
			t.Errorf("Accepts(%q, %q) = %v, want %v", c.header, c.coding, got, c.want)
		}
	}
}

// fetch asks the dashboard for a path, saying which encodings the browser takes.
func fetch(t *testing.T, path, accept string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, path, nil)
	if accept != "" {
		r.Header.Set("Accept-Encoding", accept)
	}
	w := httptest.NewRecorder()
	Dashboard().ServeHTTP(w, r)
	return w
}

func gunzip(t *testing.T, b []byte) []byte {
	t.Helper()
	zr, err := gzip.NewReader(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	out, err := io.ReadAll(zr)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

// firstAsset is a built script the build stored as gzip only.
func firstAsset(t *testing.T) string {
	t.Helper()
	sub, _ := fs.Sub(dist, "dist")
	names, _ := fs.Glob(sub, "assets/*.js.gz")
	if len(names) == 0 {
		t.Fatal("no built script is stored as gzip: run `pnpm --filter @trckable/dashboard build`")
	}
	return "/" + strings.TrimSuffix(names[0], ".gz")
}

func TestDashboardStoresOneCopy(t *testing.T) {
	sub, _ := fs.Sub(dist, "dist")
	for _, n := range []string{strings.TrimPrefix(firstAsset(t), "/")} { // index.html is under 1 KB: it stays plain
		if _, err := fs.Stat(sub, n); err == nil {
			t.Errorf("%s is stored plain and as gzip: the image would carry both", n)
		}
		if _, err := fs.Stat(sub, n+".gz"); err != nil {
			t.Errorf("%s has no gzip: %v", n, err)
		}
	}
	if m, _ := fs.Glob(sub, "assets/*.br"); len(m) > 0 {
		t.Errorf("brotli twins are still embedded: %v", m[0])
	}
}

func TestDashboardServesStoredGzip(t *testing.T) {
	asset := firstAsset(t)
	for _, path := range []string{asset} {
		stored := fetch(t, path, "gzip, deflate, br")
		if stored.Code != http.StatusOK || stored.Header().Get("Content-Encoding") != "gzip" {
			t.Fatalf("%s gzip: %d %q", path, stored.Code, stored.Header().Get("Content-Encoding"))
		}
		plain := fetch(t, path, "")
		if plain.Header().Get("Content-Encoding") != "" || plain.Code != http.StatusOK {
			t.Fatalf("%s plain: %d %q", path, plain.Code, plain.Header().Get("Content-Encoding"))
		}
		if !bytes.Equal(gunzip(t, stored.Body.Bytes()), plain.Body.Bytes()) {
			t.Errorf("%s: the stored gzip is not the file the other clients get", path)
		}
		if stored.Body.Len() >= plain.Body.Len() {
			t.Errorf("%s: gzip %d bytes, plain %d", path, stored.Body.Len(), plain.Body.Len())
		}
		for _, w := range []*httptest.ResponseRecorder{stored, plain} {
			if !strings.Contains(w.Header().Get("Vary"), "Accept-Encoding") {
				t.Errorf("%s: no Vary: Accept-Encoding", path)
			}
			if w.Header().Get("Content-Type") != plain.Header().Get("Content-Type") || w.Header().Get("Cache-Control") != plain.Header().Get("Cache-Control") {
				t.Errorf("%s: headers differ between encodings", path)
			}
		}
		{
			if stored.Header().Get("Content-Length") != strconv.Itoa(stored.Body.Len()) {
				t.Errorf("Content-Length %q for %d bytes", stored.Header().Get("Content-Length"), stored.Body.Len())
			}
			if got := plain.Header().Get("Content-Type"); !strings.Contains(got, "javascript") {
				t.Errorf("type %q", got)
			}
			if !strings.Contains(plain.Header().Get("Cache-Control"), "immutable") {
				t.Errorf("a built script is no longer cached for good: %q", plain.Header().Get("Cache-Control"))
			}
		}
	}
	// The page is stored as gzip once it is 1 KB or more, and a browser that takes gzip is handed it as it is.
	page := fetch(t, "/some/route", "gzip")
	html := page.Body.Bytes()
	if page.Header().Get("Content-Encoding") == "gzip" {
		html = gunzip(t, html)
	}
	if page.Code != http.StatusOK || !bytes.Contains(html, []byte(`<div id="root">`)) {
		t.Errorf("the page for a route: %d", page.Code)
	}
	if csp := fetch(t, "/", "gzip").Header().Get("Content-Security-Policy"); !strings.Contains(csp, "frame-ancestors 'none'") {
		t.Errorf("the page lost its policy: %q", csp)
	}
}

func TestDashboardRefusesGzipAndRangesArePlain(t *testing.T) {
	asset := firstAsset(t)
	for _, path := range []string{asset} {
		if w := fetch(t, path, "gzip;q=0, br"); w.Header().Get("Content-Encoding") != "" {
			t.Errorf("%s: %q sent to a browser that refuses gzip", path, w.Header().Get("Content-Encoding"))
		}
	}
	plain := fetch(t, asset, "")
	r := httptest.NewRequest(http.MethodGet, asset, nil)
	r.Header.Set("Accept-Encoding", "gzip")
	r.Header.Set("Range", "bytes=0-9")
	w := httptest.NewRecorder()
	Dashboard().ServeHTTP(w, r)
	if w.Code != http.StatusPartialContent || w.Header().Get("Content-Encoding") != "" || !bytes.Equal(w.Body.Bytes(), plain.Body.Bytes()[:10]) {
		t.Errorf("range: %d %q %q", w.Code, w.Header().Get("Content-Encoding"), w.Body.Bytes())
	}
}

// A shared page's address holds its token, so nothing leaves it as a Referer;
// every other page keeps the address inside this origin.
func TestSharedPagesSendNoReferer(t *testing.T) {
	h := Dashboard()
	for path, want := range map[string]string{"/s/sometoken": "no-referrer", "/s": "no-referrer", "/": "same-origin", "/settings": "same-origin"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if got := w.Header().Get("Referrer-Policy"); got != want {
			t.Errorf("%s: Referrer-Policy %q, want %q", path, got, want)
		}
	}
}

// A tab opened before a deploy asks for chunks the new build no longer has:
// the answer must be a plain 404 a loader can tell from a script, not the page.
func TestMissingAssetIsNotFoundNotThePage(t *testing.T) {
	for _, path := range []string{"/assets/AccountItems-137721bf.js", "/assets/gone-00000000.css", "/assets/nested/gone.js"} {
		rec := fetch(t, path, "gzip")
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s: %d, want 404", path, rec.Code)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
			t.Errorf("%s: content type %q, want text/plain", path, ct)
		}
		if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
			t.Errorf("%s: Cache-Control %q, want no-store (a missing file must never be remembered)", path, cc)
		}
		if strings.Contains(rec.Body.String(), "<html") || strings.Contains(rec.Body.String(), `id="root"`) {
			t.Errorf("%s: the answer is the page", path)
		}
	}
}

// The page itself is never cached, and a route is still the page: a site's
// address has a dot in it.
func TestPageIsNeverCachedAndRoutesStillAnswerWithIt(t *testing.T) {
	for _, path := range []string{"/", "/albas.al", "/albas.al?period=ytd"} {
		rec := fetch(t, path, "")
		if rec.Code != http.StatusOK || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/html") {
			t.Errorf("%s: %d %q, want the page", path, rec.Code, rec.Header().Get("Content-Type"))
		}
		if cc := rec.Header().Get("Cache-Control"); cc != "no-cache" {
			t.Errorf("%s: Cache-Control %q, want no-cache", path, cc)
		}
	}
	// A built asset is still cached for good.
	if cc := fetch(t, firstAsset(t), "gzip").Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Errorf("a hashed asset: Cache-Control %q, want immutable", cc)
	}
}

// The worker is a script a browser runs for the whole site, so it has to
// arrive as one: its own type, allowed to control "/", never kept, and with the
// page's hash in it instead of the placeholder (a deploy is a new worker).
func TestServiceWorkerIsServedAsAWorker(t *testing.T) {
	rec := fetch(t, "/sw.js", "gzip")
	if rec.Code != http.StatusOK {
		t.Fatalf("/sw.js: status %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/javascript") {
		t.Errorf("Content-Type %q, want text/javascript", ct)
	}
	if got := rec.Header().Get("Service-Worker-Allowed"); got != "/" {
		t.Errorf("Service-Worker-Allowed %q, want /", got)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-cache" {
		t.Errorf("Cache-Control %q, want no-cache", cc)
	}
	if rec.Header().Get("Content-Encoding") != "" {
		t.Errorf("the worker is sent as plain text, got Content-Encoding %q", rec.Header().Get("Content-Encoding"))
	}
	body := rec.Body.String()
	if strings.Contains(body, "__V__") || !strings.Contains(body, "const V = '") {
		t.Errorf("the version was not filled in: %.120q", body)
	}
}

// The version follows the page: another page, another worker.
func TestServiceWorkerVersionFollowsThePage(t *testing.T) {
	sub, _ := fs.Sub(dist, "dist")
	a := serviceWorker(sub, []byte("one"))
	b := serviceWorker(sub, []byte("two"))
	if a == nil || bytes.Equal(a, b) {
		t.Error("two pages gave the same worker: a deploy would not replace it")
	}
	if !bytes.Equal(a, serviceWorker(sub, []byte("one"))) {
		t.Error("the same page gave two workers: the browser would reinstall it on every visit")
	}
}

func TestManifestHasItsOwnType(t *testing.T) {
	rec := fetch(t, "/manifest.webmanifest", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/manifest+json" {
		t.Errorf("Content-Type %q, want application/manifest+json", ct)
	}
	if !strings.Contains(rec.Body.String(), `"scope": "/"`) {
		t.Errorf("the manifest does not name its scope: %.120q", rec.Body.String())
	}
}

// The corner script for the online widget is its own file: it carries its
// widget's settings in front of it, never answers for a widget that is not
// there, and stays within 1 KB gzip, prelude included (tracker/build.mjs
// checks the file itself against the same budget).
func TestOnlineScript(t *testing.T) {
	h := OnlineScript(func(_ context.Context, id string) (OnlineLook, bool) {
		if id != "w_abcdefghijklmnop" {
			return OnlineLook{}, false
		}
		return OnlineLook{ID: id, W: 280, H: 454, Theme: "light", Pos: "bl"}, true
	})
	get := func(file string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/js/"+file, nil))
		return w
	}
	if w := get("w_other.online.js"); w.Code != http.StatusNotFound {
		t.Fatalf("a widget that is not there: %d", w.Code)
	}
	w := get("w_abcdefghijklmnop.online.js")
	if w.Code != http.StatusOK {
		t.Fatalf("status %d", w.Code)
	}
	body := w.Body.String()
	for _, want := range []string{`dataset.id="w_abcdefghijklmnop";`, `dataset.w="280";`, `dataset.h="454";`, `dataset.theme="light";`, `dataset.pos="bl";`} {
		if !strings.HasPrefix(body, "document.currentScript.") || !strings.Contains(body, want) {
			t.Fatalf("the script misses %s: %.200q", want, body)
		}
	}
	if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/javascript") {
		t.Fatalf("content type %q", ct)
	}
	if cc := w.Header().Get("Cache-Control"); cc != "no-cache" {
		t.Fatalf("Cache-Control %q: a change in Settings must reach the next page load", cc)
	}
	if !ETagMatch(`W/`+w.Header().Get("ETag")+`, "other"`, w.Header().Get("ETag")) || ETagMatch(`"other"`, w.Header().Get("ETag")) {
		t.Fatal("ETagMatch: a weak copy of the tag is the tag, another tag is not")
	}
	again := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/js/w_abcdefghijklmnop.online.js", nil)
	r.Header.Set("If-None-Match", w.Header().Get("ETag"))
	h.ServeHTTP(again, r)
	if again.Code != http.StatusNotModified {
		t.Fatalf("a script the browser has: %d", again.Code)
	}

	var z bytes.Buffer
	zw, _ := gzip.NewWriterLevel(&z, gzip.BestCompression)
	_, _ = zw.Write(w.Body.Bytes())
	_ = zw.Close()
	if z.Len() > 1024 {
		t.Fatalf("the corner script is %d B gzip, over its 1 KB budget", z.Len())
	}
	if strings.Contains(body, "localStorage") || strings.Contains(body, "cookie") || strings.Contains(body, "sessionStorage") {
		t.Fatal("the corner script keeps nothing in the visitor's browser")
	}
}
