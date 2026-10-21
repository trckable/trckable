package api

import (
	"errors"
	"net/http"
	"testing"
)

func TestStackOf(t *testing.T) {
	for _, c := range []struct{ name, page, want string }{
		{"next", `<script src="/_next/static/chunks/main.js"></script>`, "next"},
		{"next data", `<script id="__NEXT_DATA__" type="application/json">{}</script>`, "next"},
		{"wordpress path", `<link href="https://x.com/wp-content/themes/a/style.css">`, "wordpress"},
		{"wordpress generator", `<meta name="generator" content="WordPress 6.5">`, "wordpress"},
		{"wordpress path and generator", `<meta name="generator" content="WordPress 6.5"><link href="/wp-content/a.css">`, "wordpress"},
		{"generator after content", `<meta content="Ghost 5.1" name="generator">`, "ghost"},
		{"shopify", `<script src="https://cdn.shopify.com/s/x.js"></script>`, "shopify"},
		{"webflow", `<html data-wf-site="abc">`, "webflow"},
		{"astro generator", `<meta name="generator" content="Astro v4.0">`, "astro"},
		{"gatsby", `<div id="___gatsby"></div>`, "gatsby"},
		{"two stacks is unsure", `<script src="/_next/static/a.js"></script><img src="https://cdn.shopify.com/a.png">`, ""},
		{"next with wordpress images is unsure", `<script src="/_next/static/a.js"></script><img src="https://cms.x.com/wp-content/a.png">`, ""},
		{"plain page", `<h1>Hello</h1>`, ""},
		{"unknown generator", `<meta name="generator" content="Hugo 0.1">`, ""},
		{"empty", ``, ""},
	} {
		if got := stackOf(c.page); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

// A site that cannot be read, or a visitor not signed in, learns nothing.
func TestInstallStackSaysNothingWhenUnsure(t *testing.T) {
	was := checkClient
	defer func() { checkClient = was }()
	checkClient = func() *http.Client {
		return &http.Client{Transport: roundTrip(func(*http.Request) (*http.Response, error) { return nil, errors.New("no network in tests") })}
	}
	g := newRig(t)
	c := client()
	g.setup(t, c)
	url := g.srv.URL + "/api/v1/sites/" + g.site + "/install/stack"
	if code, out := do(t, c, "GET", url, ""); code != http.StatusOK || out["stack"] != "" {
		t.Fatalf("a site that cannot be reached: %d %v", code, out)
	}
	if code, _ := do(t, client(), "GET", url, ""); code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", code)
	}
}
