package api

import (
	"encoding/json"
	"net/http"
	"testing"
)

// The sites list and a share link both say when a site is cookieless, so the
// dashboard can say "Off" for new vs returning and journeys instead of
// showing numbers a daily hash cannot give.
func TestSitesSayCookieless(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	cookieless := func() any {
		t.Helper()
		_, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites", "")
		return out["sites"].([]any)[0].(map[string]any)["cookieless"]
	}
	if v := cookieless(); v != nil {
		t.Fatalf("a site with cookies says cookieless: %v", v)
	}
	code, out := do(t, c, "POST", g.srv.URL+"/api/v1/sites/"+g.site+"/shares", `{"name":"x"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("share: %d %v", code, out)
	}
	token := out["url"].(string)[len(out["url"].(string))-26:]
	shareSays := func() any {
		t.Helper()
		_, info := do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`"}`)
		return info["cookieless"]
	}
	if v := shareSays(); v != false {
		t.Fatalf("share info before: %v", v)
	}

	_, cfg := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/config", "")
	cfg["consent_free"] = true
	b, _ := json.Marshal(cfg)
	if code, _ := do(t, c, "PUT", g.srv.URL+"/api/v1/sites/"+g.site+"/config", string(b), csrf, "1"); code != http.StatusOK {
		t.Fatalf("config: %d", code)
	}
	if v := cookieless(); v != true {
		t.Fatalf("a cookieless site does not say so: %v", v)
	}
	if v := shareSays(); v != true {
		t.Fatalf("share info after: %v", v)
	}
}
