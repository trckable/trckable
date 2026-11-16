package ingest

import (
	"net/http"
	"strings"
	"testing"
)

func TestCleanTitle(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"Pricing | Acme", "Pricing | Acme"},
		{"  Pricing \n\t |   Acme ", "Pricing | Acme"},
		{"Welcome back, jane.doe@example.com | Account", "Welcome back, | Account"},
		{"jane@x.com", ""},
		{"a\x00b\x07c", "a b c"},
		{"", ""},
		{strings.Repeat("ä", 300), strings.Repeat("ä", MaxTitle)},
	} {
		if got := CleanTitle(tc.in); got != tc.want {
			t.Errorf("CleanTitle(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// A pageview's title is kept, cleaned; a goal never carries one; a consent-free
// site keeps none, whatever an old script sends.
func TestTitleOnlyOnPageviews(t *testing.T) {
	for _, tc := range []struct {
		kind string
		free bool
		want string
	}{
		{"pv", false, "Pricing | Acme"},
		{"g", false, ""},
		{"pv", true, ""},
	} {
		h, l := newHandler(t)
		h.Sites = fakeSites{"tkb_test": {ID: "tkb_test", Domain: "site.com", ProxyKey: "tkb_px_secret", ConsentFree: tc.free}}
		body := `{"s":"tkb_test","k":"` + tc.kind + `","u":"https://site.com/pricing","id":"a","n":"signup","ti":"  Pricing | Acme  jo@x.com","v":"k3j2.m1a2b3","x":1}`
		if w := proxied(h, body, "tkb_px_secret"); w.Code != http.StatusAccepted {
			t.Fatalf("%+v: status %d", tc, w.Code)
		}
		e, _ := lastEvent(t, l)
		if e.Title != tc.want {
			t.Fatalf("%+v: title %q", tc, e.Title)
		}
	}
}
