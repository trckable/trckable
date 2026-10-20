package api

import (
	"context"
	"testing"
)

// A shared page carries the "Powered by" link only when the server was given
// a rule that says so: a plain server never does.
func TestSharedPagePoweredByIsOffUnlessTheServerSaysSo(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	_, out := do(t, c, "POST", g.srv.URL+"/api/v1/sites/"+g.site+"/shares", `{"name":"Client"}`, csrf, "1")
	url, _ := out["url"].(string)
	open := func() any {
		code, info := do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`)
		if code != 200 {
			t.Fatalf("open: %d %v", code, info)
		}
		return info["powered_by"]
	}
	if open() != false {
		t.Fatal("a server with no rule must not show the link")
	}
	var asked string
	g.api.PoweredBy = func(_ context.Context, site string) bool { asked = site; return true }
	if open() != true || asked != g.site {
		t.Fatalf("the rule decides, for this site: %q", asked)
	}
	g.api.PoweredBy = func(context.Context, string) bool { return false }
	if open() != false {
		t.Fatal("a rule that says no shows nothing")
	}
}
