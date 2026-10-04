package api

import (
	"bytes"
	"context"
	"image"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func png1() []byte {
	var b bytes.Buffer
	_ = png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 4, 4)))
	return b.Bytes()
}

func put(t *testing.T, c *http.Client, url string, body []byte) (int, http.Header, []byte) {
	t.Helper()
	req, _ := http.NewRequest("PUT", url, bytes.NewReader(body))
	req.Header.Set(csrf, "1")
	res, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	out, _ := io.ReadAll(res.Body)
	return res.StatusCode, res.Header, out
}

// The look of a site's links: set by an owner, applied by the server to what
// a link's page is told, with a logo that is checked, cleaned and served so
// it cannot run.
func TestShareLookIsStoredAndAppliedOnTheServer(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	_, out := do(t, c, "POST", base+"/shares", `{"name":"Client"}`, csrf, "1")
	url, _ := out["url"].(string)
	token := url[len(url)-26:]

	// Nothing set: trckable's own look.
	if code, l := do(t, c, "GET", base+"/share-look", ""); code != 200 || l["hide_brand"] != false || l["logo_url"] != "" || l["domain"] != "" {
		t.Fatalf("the empty look: %d %v", code, l)
	}
	if code, _ := do(t, c, "PUT", base+"/share-look", `{"color":"red"}`, csrf, "1"); code != http.StatusBadRequest {
		t.Errorf("a colour that is not #rrggbb: %d", code)
	}
	if code, l := do(t, c, "PUT", base+"/share-look", `{"color":"#336699","hide_brand":true}`, csrf, "1"); code != 200 || l["color"] != "#336699" || l["hide_brand"] != true {
		t.Fatalf("set the look: %d %v", code, l)
	}

	// The logo: a picture is kept, anything else is refused, and an SVG with
	// script in it is refused rather than edited.
	if code, _, _ := put(t, c, base+"/share-logo", png1()); code != 200 {
		t.Fatalf("a PNG logo: %d", code)
	}
	for name, body := range map[string][]byte{
		"text":   []byte("hello"),
		"script": []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`),
		"huge":   bytes.Repeat([]byte("a"), sqlite.MaxShareLogo+1),
	} {
		if code, _, _ := put(t, c, base+"/share-logo", body); code < 400 {
			t.Errorf("%s was kept as a logo: %d", name, code)
		}
	}
	svg := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="#123456"/></svg>`
	if code, _, _ := put(t, c, base+"/share-logo", []byte(svg)); code != 200 {
		t.Fatalf("an SVG logo: %d", code)
	}

	// What the owner gets back, with a policy that lets nothing run.
	res, err := c.Get(base + "/share-logo")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.Header.Get("Content-Type") != "image/svg+xml" || !strings.Contains(res.Header.Get("Content-Security-Policy"), "default-src 'none'") ||
		!strings.Contains(res.Header.Get("Content-Security-Policy"), "sandbox") || res.Header.Get("X-Content-Type-Options") != "nosniff" || !strings.Contains(string(body), "<rect") {
		t.Fatalf("the logo as served: %v %s", res.Header, body)
	}

	// What a link's page is told, and the logo it fetches with its session.
	anon := client()
	code, info := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`"}`)
	if code != 200 || info["accent"] != "#336699" || info["hide_brand"] != true || !strings.HasPrefix(info["logo_url"].(string), "/api/v1/share/logo?v=") {
		t.Fatalf("the shared page's look: %d %v", code, info)
	}
	res, err = anon.Get(g.srv.URL + info["logo_url"].(string))
	if err != nil || res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/svg+xml" {
		t.Fatalf("the shared logo: %v %v", err, res)
	}
	res.Body.Close()
	if res, _ = client().Get(g.srv.URL + "/api/v1/share/logo"); res.StatusCode != http.StatusUnauthorized {
		t.Errorf("the logo was readable without opening the link: %d", res.StatusCode)
	}
	res.Body.Close()

	// A link with a password says whether to hide the name before it opens.
	_, out = do(t, c, "POST", base+"/shares", `{"name":"Locked","password":"open sesame please"}`, csrf, "1")
	locked := out["url"].(string)
	if code, out := do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+locked[len(locked)-26:]+`"}`); code != http.StatusUnauthorized || out["hide_brand"] != true {
		t.Fatalf("the password page: %d %v", code, out)
	}

	// Removing the logo leaves the rest.
	if code, l := do(t, c, "DELETE", base+"/share-logo", "", csrf, "1"); code != 200 || l["logo_url"] != "" || l["color"] != "#336699" {
		t.Fatalf("remove the logo: %d %v", code, l)
	}

	// A viewer reads no look and changes none.
	if _, err := g.ctl.AddUser(context.Background(), sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	v := client()
	do(t, v, "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@site.com","password":"correct horse battery V"}`)
	if code, _ := do(t, v, "GET", base+"/share-look", ""); code != http.StatusForbidden {
		t.Errorf("a viewer read the look: %d", code)
	}
	if code, _, _ := put(t, v, base+"/share-logo", png1()); code != http.StatusForbidden {
		t.Errorf("a viewer set a logo: %d", code)
	}
}

// A share domain opens the links of its own site and nothing else: not the
// dashboard, not the sign-in, not another site's link.
func TestShareDomainOpensShareLinksOnly(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	c := client()
	g.setup(t, c)
	other, err := g.ctl.CreateSite(ctx, sqlite.DefaultAccount, "other.com", "")
	if err != nil {
		t.Fatal(err)
	}
	base := g.srv.URL + "/api/v1/sites/" + g.site
	for in, want := range map[string]int{
		`{"domain":"https://reports.example.com"}`: 400,
		`{"domain":"reports"}`:                     400,
		`{"domain":"10.0.0.1"}`:                    400,
		`{"domain":"reports.example.com/x"}`:       400,
		`{"domain":"127.0.0.1"}`:                   400,
		`{"domain":"Reports.Example.com."}`:        200,
	} {
		if code, out := do(t, c, "PUT", base+"/share-look", in, csrf, "1"); code != want {
			t.Errorf("%s: %d %v, want %d", in, code, out, want)
		}
	}
	_, l := do(t, c, "GET", base+"/share-look", "")
	if l["domain"] != "reports.example.com" {
		t.Fatalf("the domain, tidied: %v", l)
	}
	if code, out := do(t, c, "PUT", g.srv.URL+"/api/v1/sites/"+other+"/share-look", `{"domain":"reports.example.com"}`, csrf, "1"); code != 400 || !strings.Contains(out["error"].(string), "another site") {
		t.Errorf("one domain for two sites: %d %v", code, out)
	}

	// Links are made on the domain.
	_, out := do(t, c, "POST", base+"/shares", `{"name":"Client"}`, csrf, "1")
	url := out["url"].(string)
	if !strings.HasPrefix(url, "https://reports.example.com/s/") {
		t.Fatalf("the link: %s", url)
	}
	token := url[len(url)-26:]
	_, out = do(t, c, "POST", g.srv.URL+"/api/v1/sites/"+other+"/shares", `{"name":"Other"}`, csrf, "1")
	otherToken := out["url"].(string)
	otherToken = otherToken[len(otherToken)-26:]

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("inner")) })
	h := g.api.ShareDomains(inner)
	ask := func(host, path string) int {
		r := httptest.NewRequest("GET", "http://"+host+path, nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code
	}
	for path, want := range map[string]int{
		"/s/" + token:                       200,
		"/s/" + otherToken:                  404, // another site's link
		"/s/nonsense":                       404,
		"/api/v1/share/report":              200,
		"/assets/index.js":                  200,
		"/":                                 404,
		"/login":                            404,
		"/api/v1/sites":                     404,
		"/api/v1/login":                     404,
		"/api/event":                        404,
		"/demo.example.com":                 404,
		"/api/v1/share-domain/ask":          404,
		"/_trckable/whoami":                 404,
		"/s/../api/v1/sites":                404,
		"/api/v1/sites/" + g.site + "/icon": 404,
	} {
		if got := ask("reports.example.com:8443", path); got != want {
			t.Errorf("on the share domain, %s: %d, want %d", path, got, want)
		}
	}
	// Any other host is untouched.
	for _, host := range []string{"dash.example.com", "localhost:8080"} {
		if got := ask(host, "/"); got != 200 {
			t.Errorf("%s was changed: %d", host, got)
		}
	}

	// A proxy asks before it gets a certificate for a name.
	for q, want := range map[string]int{"reports.example.com": 200, "other.example.com": 404, "": 404, "bad/host": 404} {
		if code, _ := do(t, client(), "GET", g.srv.URL+"/api/v1/share-domain/ask?domain="+q, ""); code != want {
			t.Errorf("ask %q: %d, want %d", q, code, want)
		}
	}
	// Clearing the domain frees it and puts the links back on this server.
	do(t, c, "PUT", base+"/share-look", `{"domain":""}`, csrf, "1")
	if got := ask("reports.example.com", "/"); got != 200 {
		t.Errorf("a cleared domain still restricts: %d", got)
	}
	if code, _ := do(t, client(), "GET", g.srv.URL+"/api/v1/share-domain/ask?domain=reports.example.com", ""); code != 404 {
		t.Errorf("a cleared domain is still asked about as ours: %d", code)
	}
	if code, _ := do(t, c, "PUT", g.srv.URL+"/api/v1/sites/"+other+"/share-look", `{"domain":"reports.example.com"}`, csrf, "1"); code != 200 {
		t.Errorf("the freed domain: %d", code)
	}
}
