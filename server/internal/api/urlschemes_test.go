package api

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

// The sites a link may be framed on go into a Content-Security-Policy
// header: an owner can name a site, and nothing that carries more.
func TestEmbedOriginsTakeHostsOnly(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/shares"
	for _, bad := range []string{
		"https://a.com;sandbox", "https://a.com 'unsafe-inline'", "https://*.a.com", "javascript:alert(1)", "data:text/html,x",
		"ftp://a.com", "https://a.com#x", "https://user@a.com", "https://a.com,https://b.com",
	} {
		if code, _ := do(t, c, "POST", base, `{"name":"x","embed_origins":["`+bad+`"]}`, csrf, "1"); code != http.StatusBadRequest {
			t.Errorf("embed origin %q: %d, want 400", bad, code)
		}
	}
	code, out := do(t, c, "POST", base, `{"name":"x","embed_origins":["https://Blog.Example.com/"]}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("a plain site: %d %v", code, out)
	}
	token := out["url"].(string)[strings.LastIndex(out["url"].(string), "/s/")+3:]

	// A value stored before the check existed never reaches the header.
	if _, err := g.ctl.DB.Exec(`UPDATE site_shares SET embed_origins = 'https://a.com;sandbox' || char(10) || 'https://ok.example.com'`); err != nil {
		t.Fatal(err)
	}
	a := &API{Ctl: g.ctl, Now: time.Now}
	if got := a.FrameAncestors(httptest.NewRequest("GET", "/s/"+token, nil)); got != "https://ok.example.com" {
		t.Errorf("frame-ancestors from a dirty stored value: %q", got)
	}
}

// The cookie bar's link is put on the owner's own pages: a web address or a
// path on that site, never a script.
func TestCookieBarLinkIsAWebAddress(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	put := g.srv.URL + "/api/v1/sites/" + g.site + "/config"
	for _, bad := range []string{"javascript:alert(document.cookie)", "JaVaScRiPt:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "http://example.com/privacy", "//evil.example/x", "vbscript:x"} {
		if code, _ := do(t, c, "PUT", put, `{"banner":{"policy":"`+bad+`"}}`, csrf, "1"); code != http.StatusBadRequest {
			t.Errorf("privacy link %q: %d, want 400", bad, code)
		}
	}
	for _, good := range []string{"https://example.com/privacy", "/datenschutz", "http://localhost:3000/privacy"} {
		code, out := do(t, c, "PUT", put, `{"banner":{"policy":"`+good+`"}}`, csrf, "1")
		if code != http.StatusOK || out["banner"].(map[string]any)["policy"] != good {
			t.Errorf("privacy link %q: %d %v", good, code, out["banner"])
		}
	}
	// One stored before the check existed is dropped when read, so the script
	// served to the site's visitors never carries it.
	if _, err := g.ctl.DB.Exec(`UPDATE site_settings SET banner = '{"text":"x","policy":"javascript:alert(1)"}'`); err != nil {
		t.Fatal(err)
	}
	cfg, err := g.ctl.SiteConfig(t.Context(), g.site)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Banner.Policy != "" || cfg.Banner.Text != "x" {
		t.Errorf("stored javascript: link read back as %+v", cfg.Banner)
	}
	for _, stored := range []string{"//evil.example/x", `/\\evil.example`} {
		if _, err := g.ctl.DB.Exec(`UPDATE site_settings SET banner = ?`, `{"text":"x","policy":"`+stored+`"}`); err != nil {
			t.Fatal(err)
		}
		if cfg, err := g.ctl.SiteConfig(t.Context(), g.site); err != nil || cfg.Banner.Policy != "" {
			t.Errorf("stored %q read back as %+v, %v", stored, cfg.Banner, err)
		}
	}
}

// The owner's own addresses: each an IP or a range, at most fifty, kept in one
// spelling, and a bad list changes nothing.
func TestExcludedAddressesAreValidated(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	put := g.srv.URL + "/api/v1/sites/" + g.site + "/config"
	for _, bad := range []string{`["nope"]`, `["203.0.113.0/33"]`, `["203.0.113.1","1.2.3.4-1.2.3.9"]`, `["fe80::1%eth0"]`} {
		if code, _ := do(t, c, "PUT", put, `{"exclude_ips":`+bad+`}`, csrf, "1"); code != http.StatusBadRequest {
			t.Errorf("excluded %s: %d, want 400", bad, code)
		}
	}
	code, out := do(t, c, "PUT", put, `{"exclude_ips":["203.0.113.77/24"," 2001:DB8::1 ",""]}`, csrf, "1")
	got, _ := out["exclude_ips"].([]any)
	if code != http.StatusOK || len(got) != 2 || got[0] != "203.0.113.0/24" || got[1] != "2001:db8::1" {
		t.Fatalf("a good list: %d %v", code, out["exclude_ips"])
	}

	fifty := make([]string, 0, 51)
	for i := 0; i < 51; i++ {
		fifty = append(fifty, `"10.0.`+strconv.Itoa(i)+`.1"`)
	}
	if code, _ := do(t, c, "PUT", put, `{"exclude_ips":[`+strings.Join(fifty[:50], ",")+`]}`, csrf, "1"); code != http.StatusOK {
		t.Errorf("fifty addresses: %d, want 200", code)
	}
	if code, _ := do(t, c, "PUT", put, `{"exclude_ips":[`+strings.Join(fifty, ",")+`]}`, csrf, "1"); code != http.StatusBadRequest {
		t.Errorf("fifty-one addresses: %d, want 400", code)
	}
	cfg, _ := g.ctl.SiteConfig(t.Context(), g.site)
	if len(cfg.ExcludeIPs) != 50 {
		t.Errorf("a refused list changed what was kept: %d", len(cfg.ExcludeIPs))
	}
}
