package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A link that opens for anyone carries a title, a line and the card in its
// page; the owner's site name is escaped; a link that asks for a password, or
// is not one, carries nothing.
func TestSharePreviewTags(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	_, open := do(t, c, "POST", base+"/shares", `{"name":"Board"}`, csrf, "1")
	_, locked := do(t, c, "POST", base+"/shares", `{"name":"Team","password":"open sesame please"}`, csrf, "1")
	token := func(m map[string]any) string {
		u := m["url"].(string)
		return u[strings.LastIndex(u, "/")+1:]
	}

	title, tags := g.api.SharePreview(httptest.NewRequest(http.MethodGet, "/s/"+token(open), nil))
	if title != "site.com analytics" {
		t.Errorf("title %q", title)
	}
	for _, want := range []string{
		`<meta property="og:title" content="site.com analytics">`,
		`<meta property="og:description" content="People, pages and sources for site.com, live.">`,
		`<meta property="og:image" content="http://example.com/s/` + token(open) + `/card.png">`,
		`<meta property="og:url" content="http://example.com/s/` + token(open) + `">`,
		`<meta name="twitter:card" content="summary_large_image">`,
	} {
		if !strings.Contains(tags, want) {
			t.Errorf("missing %s in %s", want, tags)
		}
	}

	// A domain with markup in it cannot break out of an attribute.
	if _, err := g.ctl.DB.Exec(`UPDATE sites SET domain = ? WHERE id = ?`, `x"><script>alert(1)</script>`, g.site); err != nil {
		t.Fatal(err)
	}
	_, tags = g.api.SharePreview(httptest.NewRequest(http.MethodGet, "/s/"+token(open), nil))
	if strings.Contains(tags, "<script>") || !strings.Contains(tags, "&lt;script&gt;") {
		t.Errorf("not escaped: %s", tags)
	}

	for name, path := range map[string]string{"password": "/s/" + token(locked), "no such link": "/s/nope", "not a share": "/", "no token": "/s/"} {
		if title, tags := g.api.SharePreview(httptest.NewRequest(http.MethodGet, path, nil)); title != "" || tags != "" {
			t.Errorf("%s got tags: %q %q", name, title, tags)
		}
	}

	// The picture: 404 for what has no preview, a PNG for an open link.
	for name, tok := range map[string]string{"password": token(locked), "no such link": "nope"} {
		req := httptest.NewRequest(http.MethodGet, "/s/"+tok+"/card.png", nil)
		req.SetPathValue("token", tok)
		rec := httptest.NewRecorder()
		g.api.SharePreviewImage(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s: card %d", name, rec.Code)
		}
	}
}
