package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// The picture of a link in the builder is the page itself, opened through a
// link of its own that is never one of the site's.
func TestShareDraftPreviewIsThePageAndNotALink(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	put := func(body string) (int, map[string]any) {
		return do(t, c, "PUT", base+"/shares/preview", body, csrf, "1")
	}
	tokenOf := func(out map[string]any) string {
		p, _ := out["path"].(string)
		if !strings.HasPrefix(p, "/s/") || len(p) != 3+26 {
			t.Fatalf("the preview's address is a path of this server: %q", p)
		}
		return p[3:]
	}

	code, out := put(`{"name":"Draft","revenue":true,"sections":["pages"],"period":"7d"}`)
	if code != 200 {
		t.Fatalf("preview: %d %v", code, out)
	}
	token := tokenOf(out)

	// It opens like a link, with the options it was made with.
	anon := client()
	code, info := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`"}`)
	sections, _ := info["sections"].([]any)
	if code != 200 || len(sections) != 1 || sections[0] != "pages" || info["period"] != "7d" || info["name"] != "Draft" || info["revenue"] != true {
		t.Fatalf("open: %d %v", code, info)
	}
	// And is framed by this origin, where a link is framed by nobody.
	frame := func(token string) string { return g.api.FrameAncestors(httptest.NewRequest("GET", "/s/"+token, nil)) }
	if got := frame(token); got != "'self'" {
		t.Errorf("frame-ancestors of the preview = %q", got)
	}
	_, plain := do(t, c, "POST", base+"/shares", `{"name":"Plain"}`, csrf, "1")
	if got := frame(plain["url"].(string)[strings.LastIndex(plain["url"].(string), "/s/")+3:]); got != "" {
		t.Errorf("a real link may be framed: %q", got)
	}

	// Never in the list, never one of the links a site may have.
	_, list := do(t, c, "GET", base+"/shares", "")
	if got := list["shares"].([]any); len(got) != 1 || got[0].(map[string]any)["name"] != "Plain" {
		t.Fatalf("the list carries the preview: %v", got)
	}
	for i := 1; i < 20; i++ {
		if code, out := do(t, c, "POST", base+"/shares", fmt.Sprintf(`{"name":"L%d"}`, i), csrf, "1"); code != http.StatusCreated {
			t.Fatalf("link %d of 20: %d %v", i+1, code, out)
		}
	}

	// The next preview replaces it: the page being drawn is the last options.
	code, out = put(`{"name":"Draft 2","lock":true}`)
	if code != 200 {
		t.Fatalf("second preview: %d %v", code, out)
	}
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`"}`); code != http.StatusNotFound {
		t.Errorf("the first preview still opens: %d", code)
	}
	if code, res := do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+tokenOf(out)+`"}`); code != http.StatusUnauthorized || res["needs_password"] != true {
		t.Errorf("the locked preview is the password page: %d %v", code, res)
	}

	// An hour, and it is over.
	_, out = put(`{"name":"Draft 3"}`)
	g.advance(2 * time.Hour)
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+tokenOf(out)+`"}`); code != http.StatusGone {
		t.Errorf("an old preview opened: %d", code)
	}
}

func TestShareDraftPreviewNeedsTheRightRoleAndGoodOptions(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	url := g.srv.URL + "/api/v1/sites/" + g.site + "/shares/preview"
	_, added := do(t, owner, "POST", g.srv.URL+"/api/v1/people", `{"email":"reader@site.com","role":"viewer"}`, csrf, "1")
	viewer := signInFirst(t, g, "reader@site.com", added["password"].(string))
	if code, _ := do(t, viewer, "PUT", url, `{"name":"x"}`, csrf, "1"); code != http.StatusForbidden {
		t.Errorf("a viewer made a preview: %d", code)
	}
	if code, _ := do(t, client(), "PUT", url, `{"name":"x"}`, csrf, "1"); code != http.StatusUnauthorized {
		t.Errorf("signed out made a preview: %d", code)
	}
	for _, body := range []string{`{"sections":["nope"]}`, `{"period":"forever"}`, `{"name":"` + strings.Repeat("x", 61) + `"}`, `nope`} {
		if code, _ := do(t, owner, "PUT", url, body, csrf, "1"); code != http.StatusBadRequest {
			t.Errorf("PUT %.30s: %d, want 400", body, code)
		}
	}
	if code, _ := do(t, owner, "PUT", g.srv.URL+"/api/v1/sites/tkb_nothere/shares/preview", `{"name":"x"}`, csrf, "1"); code != http.StatusNotFound {
		t.Errorf("a site that is not there: %d", code)
	}
}
