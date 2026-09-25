package api

import "testing"

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
