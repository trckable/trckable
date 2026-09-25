package api

import (
	"net/url"
	"testing"
)

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
