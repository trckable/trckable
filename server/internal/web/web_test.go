package web

import (
	"net/http"
	"net/http/httptest"
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
		return w.Body.String(), w.Header().Get("ETag")
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
		t.Errorf("a site with no settings got a prelude: %.60q", bare)
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
