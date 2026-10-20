package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// personOf is a second person of the rig's account, signed in.
func personOf(t *testing.T, g *rig, email, role string) *http.Client {
	t.Helper()
	if _, err := g.ctl.AddUser(context.Background(), sqlite.DefaultAccount, email, "correct horse battery V", role); err != nil {
		t.Fatal(err)
	}
	c := client()
	if code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/login", `{"email":"`+email+`","password":"correct horse battery V"}`); code != http.StatusOK {
		t.Fatalf("%s signs in", email)
	}
	return c
}

// The uptime check is steered by an owner: paused, resumed, with up to five
// more paths of the site's own domain; a viewer reads it and cannot change it.
func TestUptimeSettings(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/uptime"

	code, out := do(t, c, "GET", base, "")
	if code != 200 || out["paused"] != false || len(out["paths"].([]any)) != 0 || out["max"] != float64(5) {
		t.Fatalf("fresh: %d %v", code, out)
	}
	if code, out = do(t, c, "PUT", base, `{"paused":true}`, csrf, "1"); code != 200 || out["paused"] != true {
		t.Fatalf("pause: %d %v", code, out)
	}
	if _, out = do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site, ""); out["uptime_paused"] != true {
		t.Fatalf("the site says so: %v", out)
	}
	if _, out = do(t, c, "GET", g.srv.URL+"/api/v1/sites", ""); out["sites"].([]any)[0].(map[string]any)["uptime_paused"] != true {
		t.Fatalf("the list says so: %v", out)
	}
	if code, _ = do(t, c, "PUT", base, `{}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("no choice: %d", code)
	}
	if code, out = do(t, c, "PUT", base, `{"paused":false}`, csrf, "1"); code != 200 || out["paused"] != false {
		t.Fatalf("resume: %d %v", code, out)
	}

	// Paths of this domain only.
	for _, bad := range []string{"https://evil.com/", "//evil.com/x", "pricing", "", `/a b`, "/x#y", `/\evil.com`, "http://a.com/x"} {
		if code, out = do(t, c, "POST", base+"/paths", `{"path":`+jsonString(bad)+`}`, csrf, "1"); code != http.StatusBadRequest {
			t.Errorf("%q: %d %v", bad, code, out)
		}
	}
	for _, p := range []string{"/pricing", "/blog?x=1", "/a", "/b", "/c"} {
		if code, out = do(t, c, "POST", base+"/paths", `{"path":`+jsonString(p)+`}`, csrf, "1"); code != 200 {
			t.Fatalf("%s: %d %v", p, code, out)
		}
	}
	if code, _ = do(t, c, "POST", base+"/paths", `{"path":"/pricing"}`, csrf, "1"); code != 200 {
		t.Fatalf("again is fine: %d", code)
	}
	if code, out = do(t, c, "POST", base+"/paths", `{"path":"/sixth"}`, csrf, "1"); code != http.StatusConflict {
		t.Fatalf("a sixth: %d %v", code, out)
	}
	if code, out = do(t, c, "DELETE", base+"/paths?path="+url.QueryEscape("/blog?x=1"), "", csrf, "1"); code != 200 || len(out["paths"].([]any)) != 4 {
		t.Fatalf("remove: %d %v", code, out)
	}

	v := personOf(t, g, "viewer@site.com", sqlite.RoleViewer)
	if code, out = do(t, v, "GET", base, ""); code != 200 || len(out["paths"].([]any)) != 4 {
		t.Fatalf("a viewer reads: %d %v", code, out)
	}
	for _, w := range [][3]string{{"PUT", base, `{"paused":true}`}, {"POST", base + "/paths", `{"path":"/z"}`}, {"DELETE", base + "/paths?path=/a", ""}} {
		if code, _ = do(t, v, w[0], w[1], w[2], csrf, "1"); code != http.StatusForbidden {
			t.Errorf("a viewer %s %s: %d", w[0], w[1], code)
		}
	}
}

// Saved funnels: made, renamed, their steps edited and deleted by an owner,
// checked on the way in, kept apart per site, read by a viewer.
func TestSavedFunnels(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/funnels"
	steps := `[{"kind":"page","value":"/pricing"},{"kind":"goal","value":"signup"}]`

	code, out := do(t, c, "POST", base, `{"name":"  Signup   path ","steps":`+steps+`}`, csrf, "1")
	if code != http.StatusCreated || out["name"] != "Signup path" || !strings.HasPrefix(out["id"].(string), "fn_") {
		t.Fatalf("create: %d %v", code, out)
	}
	id := out["id"].(string)
	for name, body := range map[string]string{
		"no name":    `{"name":"","steps":` + steps + `}`,
		"one step":   `{"name":"A","steps":[{"kind":"page","value":"/a"}]}`,
		"paid":       `{"name":"A","steps":[{"kind":"page","value":"/a"},{"kind":"paid","value":""}]}`,
		"no slash":   `{"name":"A","steps":[{"kind":"page","value":"a"},{"kind":"goal","value":"b"}]}`,
		"empty step": `{"name":"A","steps":[{"kind":"page","value":"/a"},{"kind":"goal","value":" "}]}`,
		"long name":  `{"name":"` + strings.Repeat("x", 61) + `","steps":` + steps + `}`,
	} {
		if code, out = do(t, c, "POST", base, body, csrf, "1"); code != http.StatusBadRequest {
			t.Errorf("%s: %d %v", name, code, out)
		}
	}
	if code, _ = do(t, c, "POST", base, `{"name":"signup PATH","steps":`+steps+`}`, csrf, "1"); code != http.StatusConflict {
		t.Errorf("the same name in other letters: %d", code)
	}

	if code, out = do(t, c, "PATCH", base+"/"+id, `{"name":"Checkout"}`, csrf, "1"); code != 200 || out["name"] != "Checkout" || len(out["steps"].([]any)) != 2 {
		t.Fatalf("rename: %d %v", code, out)
	}
	three := `[{"kind":"page","value":"/"},{"kind":"page","value":"/pricing"},{"kind":"goal","value":"signup"}]`
	if code, out = do(t, c, "PATCH", base+"/"+id, `{"steps":`+three+`}`, csrf, "1"); code != 200 || out["name"] != "Checkout" || len(out["steps"].([]any)) != 3 {
		t.Fatalf("steps: %d %v", code, out)
	}
	if code, _ = do(t, c, "PATCH", base+"/"+id, `{}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("nothing to change: %d", code)
	}
	if code, _ = do(t, c, "PATCH", base+"/fn_nope", `{"name":"x"}`, csrf, "1"); code != http.StatusNotFound {
		t.Fatalf("unknown: %d", code)
	}
	if code, out = do(t, c, "GET", base, ""); code != 200 || len(out["funnels"].([]any)) != 1 {
		t.Fatalf("list: %d %v", code, out)
	}

	v := personOf(t, g, "viewer@site.com", sqlite.RoleViewer)
	if code, out = do(t, v, "GET", base, ""); code != 200 || len(out["funnels"].([]any)) != 1 {
		t.Fatalf("a viewer reads: %d %v", code, out)
	}
	for _, w := range [][3]string{{"POST", base, `{"name":"B","steps":` + steps + `}`}, {"PATCH", base + "/" + id, `{"name":"B"}`}, {"DELETE", base + "/" + id, ""}} {
		if code, _ = do(t, v, w[0], w[1], w[2], csrf, "1"); code != http.StatusForbidden {
			t.Errorf("a viewer %s: %d", w[0], code)
		}
	}

	// Another site's funnel is not found under this one.
	other, err := g.ctl.CreateSite(context.Background(), sqlite.DefaultAccount, "shop.com", "Shop")
	if err != nil {
		t.Fatal(err)
	}
	if code, _ = do(t, c, "PATCH", g.srv.URL+"/api/v1/sites/"+other+"/funnels/"+id, `{"name":"Mine"}`, csrf, "1"); code != http.StatusNotFound {
		t.Fatalf("across sites: %d", code)
	}
	if code, _ = do(t, c, "DELETE", base+"/"+id, "", csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("delete: %d", code)
	}
	if _, out = do(t, c, "GET", base, ""); len(out["funnels"].([]any)) != 0 {
		t.Fatalf("gone: %v", out)
	}
}

// jsonString writes s as a JSON string.
func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
