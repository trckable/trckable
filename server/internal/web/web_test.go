package web

import (
	"bytes"
	"compress/gzip"
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

// firstAsset is a built script that has both stored encodings.
func firstAsset(t *testing.T) string {
	t.Helper()
	sub, _ := fs.Sub(dist, "dist")
	names, _ := fs.Glob(sub, "assets/*.js")
	for _, n := range names {
		if _, err := fs.Stat(sub, n+".br"); err != nil {
			continue
		}
		if _, err := fs.Stat(sub, n+".gz"); err == nil {
			return "/" + n
		}
	}
	t.Fatal("no built script has a brotli and a gzip twin: run `pnpm --filter @trckable/dashboard build`")
	return ""
}

func TestDashboardServesStoredEncodings(t *testing.T) {
	asset := firstAsset(t)
	for _, path := range []string{"/", "/some/route", asset} {
		plain := fetch(t, path, "")
		if plain.Code != http.StatusOK || plain.Header().Get("Content-Encoding") != "" {
			t.Fatalf("%s plain: %d %q", path, plain.Code, plain.Header().Get("Content-Encoding"))
		}
		if !strings.Contains(plain.Header().Get("Vary"), "Accept-Encoding") {
			t.Errorf("%s: no Vary: Accept-Encoding on the plain answer", path)
		}

		zipped := fetch(t, path, "gzip")
		if zipped.Header().Get("Content-Encoding") != "gzip" {
			t.Fatalf("%s gzip: Content-Encoding %q", path, zipped.Header().Get("Content-Encoding"))
		}
		if !bytes.Equal(gunzip(t, zipped.Body.Bytes()), plain.Body.Bytes()) {
			t.Errorf("%s: the gzip twin is not the same file", path)
		}
		if zipped.Body.Len() >= plain.Body.Len() {
			t.Errorf("%s: gzip %d bytes, plain %d", path, zipped.Body.Len(), plain.Body.Len())
		}

		br := fetch(t, path, "gzip, deflate, br")
		if br.Header().Get("Content-Encoding") != "br" {
			t.Fatalf("%s br: Content-Encoding %q (brotli is preferred)", path, br.Header().Get("Content-Encoding"))
		}
		if br.Body.Len() == 0 || br.Body.Len() >= zipped.Body.Len() {
			t.Errorf("%s: brotli %d bytes, gzip %d", path, br.Body.Len(), zipped.Body.Len())
		}
		for _, w := range []*httptest.ResponseRecorder{zipped, br} {
			if !strings.Contains(w.Header().Get("Vary"), "Accept-Encoding") {
				t.Errorf("%s: no Vary: Accept-Encoding", path)
			}
			if w.Header().Get("Content-Type") != plain.Header().Get("Content-Type") {
				t.Errorf("%s: type %q, plain %q", path, w.Header().Get("Content-Type"), plain.Header().Get("Content-Type"))
			}
			if w.Header().Get("Cache-Control") != plain.Header().Get("Cache-Control") {
				t.Errorf("%s: cache %q, plain %q", path, w.Header().Get("Cache-Control"), plain.Header().Get("Cache-Control"))
			}
		}
		if br.Header().Get("Content-Length") != strconv.Itoa(br.Body.Len()) && path == asset {
			t.Errorf("%s: Content-Length %q for %d bytes", path, br.Header().Get("Content-Length"), br.Body.Len())
		}
	}
	// What the page says about itself travels with every encoding of it.
	if csp := fetch(t, "/", "br").Header().Get("Content-Security-Policy"); !strings.Contains(csp, "frame-ancestors 'none'") {
		t.Errorf("the page lost its policy: %q", csp)
	}
	if got := fetch(t, asset, "br").Header().Get("Cache-Control"); !strings.Contains(got, "immutable") {
		t.Errorf("a built script is no longer cached for good: %q", got)
	}
}

func TestDashboardRefusesWhatTheBrowserRefuses(t *testing.T) {
	asset := firstAsset(t)
	for _, path := range []string{"/", asset} {
		if w := fetch(t, path, "br;q=0, gzip;q=0"); w.Header().Get("Content-Encoding") != "" {
			t.Errorf("%s: %q sent to a browser that takes neither", path, w.Header().Get("Content-Encoding"))
		}
		if w := fetch(t, path, "br;q=0, gzip"); w.Header().Get("Content-Encoding") != "gzip" {
			t.Errorf("%s: a browser that refuses brotli got %q", path, w.Header().Get("Content-Encoding"))
		}
	}
}
