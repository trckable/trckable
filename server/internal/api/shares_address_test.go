package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func toJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// The owner's list carries each link's address, so it can be copied again;
// nobody else's answer does, and the answer is never stored or compressed.
func TestShareListCarriesTheAddressForTheOwnerOnly(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	_, made := do(t, c, "POST", base+"/shares", `{"name":"Board","password":"open sesame please"}`, csrf, "1")
	url, _ := made["url"].(string)
	if url == "" {
		t.Fatalf("create: %v", made)
	}

	req, _ := http.NewRequest(http.MethodGet, base+"/shares", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	res, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.Header.Get("Cache-Control") != "no-store" || res.Header.Get("Content-Encoding") != "" {
		t.Errorf("the list with addresses is stored or compressed: %v", res.Header)
	}
	_, out := do(t, c, "GET", base+"/shares", "")
	row := out["shares"].([]any)[0].(map[string]any)
	if row["url"] != url || row["has_password"] != true {
		t.Fatalf("the list: %v, want url %q", row, url)
	}

	// Nobody, and a viewer of the account, get neither the list nor a new address.
	if _, err := g.ctl.AddUser(t.Context(), sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	viewer := client()
	if code, _ := do(t, viewer, "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@site.com","password":"correct horse battery V"}`); code != 200 {
		t.Fatal("the viewer did not sign in")
	}
	id := row["id"].(string)
	for name, who := range map[string]*http.Client{"nobody": client(), "a viewer": viewer} {
		if code, body := do(t, who, "GET", base+"/shares", ""); code == 200 || strings.Contains(toJSON(body), url) {
			t.Errorf("%s read the list: %d", name, code)
		}
		if code, body := do(t, who, "POST", base+"/shares/"+id+"/address", `{}`, csrf, "1"); code == 200 || strings.Contains(toJSON(body), "/s/") {
			t.Errorf("%s got a new address: %d", name, code)
		}
	}
	anon := client()
	token := url[strings.LastIndex(url, "/")+1:]
	_, info := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`","password":"open sesame please"}`)
	if strings.Contains(toJSON(info), token) {
		t.Error("the page a link opens carries the link's own token")
	}
	if code, _ := do(t, anon, "GET", base+"/shares", ""); code != http.StatusUnauthorized {
		t.Errorf("a share session read the list: %d", code)
	}
}

// A new address ends the old one, and the sessions it opened; the list and the
// answer give the new one.
func TestShareNewAddress(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	_, made := do(t, c, "POST", base+"/shares", `{"name":"Board"}`, csrf, "1")
	old := made["url"].(string)
	oldToken := old[strings.LastIndex(old, "/")+1:]
	id := made["share"].(map[string]any)["id"].(string)

	reader := client()
	if code, _ := do(t, reader, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+oldToken+`"}`); code != 200 {
		t.Fatal("the link did not open")
	}
	if code, _ := do(t, reader, "GET", g.srv.URL+"/api/v1/share/me", ""); code != 200 {
		t.Fatal("the session did not read")
	}

	if code, _ := do(t, c, "POST", base+"/shares/"+id+"/address", ``); code != http.StatusForbidden && code != http.StatusBadRequest {
		t.Errorf("a new address without the request header: %d", code)
	}
	code, out := do(t, c, "POST", base+"/shares/"+id+"/address", `{}`, csrf, "1")
	fresh, _ := out["url"].(string)
	if code != 200 || fresh == "" || fresh == old {
		t.Fatalf("new address: %d %v", code, out)
	}
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+oldToken+`"}`); code != http.StatusNotFound {
		t.Errorf("the old address still opens: %d", code)
	}
	if code, _ := do(t, reader, "GET", g.srv.URL+"/api/v1/share/me", ""); code != http.StatusUnauthorized {
		t.Errorf("a session from the old address still reads: %d", code)
	}
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+fresh[strings.LastIndex(fresh, "/")+1:]+`"}`); code != 200 {
		t.Errorf("the new address does not open: %d", code)
	}
	_, list := do(t, c, "GET", base+"/shares", "")
	if list["shares"].([]any)[0].(map[string]any)["url"] != fresh {
		t.Errorf("the list carries %v, want %q", list, fresh)
	}
	if code, _ := do(t, c, "POST", base+"/shares/shr_nothere/address", `{}`, csrf, "1"); code != http.StatusNotFound {
		t.Errorf("a link that is not there: %d", code)
	}
}

// A link made when there was no key to seal with, or one sealed by another
// key, lists without an address and never errors.
func TestShareListWithoutAnAddressNeverErrors(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	do(t, c, "POST", base+"/shares", `{"name":"Board"}`, csrf, "1")
	if _, err := g.ctl.DB.Exec(`UPDATE site_shares SET token_enc = 'v1:not-a-real-seal'`); err != nil {
		t.Fatal(err)
	}
	code, out := do(t, c, "GET", base+"/shares", "")
	row := out["shares"].([]any)[0].(map[string]any)
	if code != 200 {
		t.Fatalf("the list: %d %v", code, out)
	}
	if _, has := row["url"]; has {
		t.Errorf("an address that cannot be read was listed: %v", row)
	}
}

// The shared page's mark comes from this server, through the link's session,
// and only when the site has an icon.
func TestShareCarriesTheSitesMark(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	_, made := do(t, c, "POST", base+"/shares", `{"name":"Board"}`, csrf, "1")
	url := made["url"].(string)
	token := url[strings.LastIndex(url, "/")+1:]

	anon := client()
	_, info := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`"}`)
	if info["icon_url"] != "" {
		t.Fatalf("a site with no icon has a mark picture: %v", info["icon_url"])
	}
	if code, _ := do(t, anon, "GET", g.srv.URL+"/api/v1/share/icon", ""); code != http.StatusNotFound {
		t.Errorf("an icon that is not there: %d", code)
	}
	if code, _ := do(t, c, "PUT", base+"/color", `{"color":"#3366ff"}`, csrf, "1"); code != 200 {
		t.Fatal("colour")
	}
	if err := g.ctl.SetBrandIcon(t.Context(), g.site, "image/png", []byte("\x89PNG\r\n\x1a\nfake")); err != nil {
		t.Fatal(err)
	}
	_, info = do(t, anon, "GET", g.srv.URL+"/api/v1/share/me", "")
	icon, _ := info["icon_url"].(string)
	if info["color"] != "#3366ff" || !strings.HasPrefix(icon, "/api/v1/share/icon?v=") {
		t.Fatalf("the mark: %v %v", info["color"], icon)
	}
	res, err := anon.Get(g.srv.URL + icon)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/png" {
		t.Errorf("the icon: %d %s", res.StatusCode, res.Header.Get("Content-Type"))
	}
	// Without a session the icon is not served.
	stranger, _ := client().Get(g.srv.URL + icon)
	stranger.Body.Close()
	if stranger.StatusCode != http.StatusUnauthorized {
		t.Errorf("an icon without a session: %d", stranger.StatusCode)
	}
}
