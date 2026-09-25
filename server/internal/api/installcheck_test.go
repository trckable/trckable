package api

import (
	"errors"
	"net/http"
	"net/url"
	"testing"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSnippetIn(t *testing.T) {
	for _, c := range []struct{ page, want string }{
		{`<script defer src="https://stats.x.com/js/tkb_abc.js"></script>`, "site"},
		{`<script>window.cfg={site:"tkb_abc"}</script>`, "site"},
		{`<script defer src="https://stats.x.com/js/tkb_other.js"></script>`, "other"},
		{`<script src="/_next/static/trckable-chunk.js"></script>`, "other"},
		{`<html><head></head></html>`, "none"},
	} {
		if got := snippetIn(c.page, "tkb_abc"); got != c.want {
			t.Errorf("%q: got %s, want %s", c.page, got, c.want)
		}
	}
}

func TestScriptURLs(t *testing.T) {
	base, _ := url.Parse("https://shop.example/en/")
	page := `<script src="https://cdn.other.net/a.js"></script>
		<script type="module" src="/_next/app.js"></script>
		<script src='chunk.js' defer></script>
		<script src="data:text/javascript,1"></script>
		<script>inline()</script>
		<script src="/_next/app.js"></script>`
	got := scriptURLs(page, base)
	want := []string{"https://shop.example/_next/app.js", "https://shop.example/en/chunk.js", "https://cdn.other.net/a.js"}
	if len(got) != len(want) {
		t.Fatalf("got %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

// A check is remembered and travels with the site, so the picker can show an
// install that stopped working.
func TestCheckIsRemembered(t *testing.T) {
	was := checkClient
	defer func() { checkClient = was }()
	checkClient = func() *http.Client {
		return &http.Client{Transport: roundTrip(func(*http.Request) (*http.Response, error) { return nil, errors.New("no network in tests") })}
	}
	g := newRig(t)
	c := client()
	g.setup(t, c)
	if code, out := do(t, c, "POST", g.srv.URL+"/api/v1/sites/"+g.site+"/install/check", "", csrf, "1"); code != http.StatusOK || out["error"] == nil {
		t.Fatalf("check of a site that cannot be reached: %d %v", code, out)
	}
	_, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites", "")
	site := out["sites"].([]any)[0].(map[string]any)
	check, ok := site["check"].(map[string]any)
	if !ok || check["at"].(float64) == 0 || check["error"] == "" {
		t.Fatalf("the check travels with the site: %v", site)
	}
}
