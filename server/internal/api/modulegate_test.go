package api

import (
	"net/http"
	"strings"
	"testing"
)

// Every route a module owns answers 404 while that module is off, and works
// again once it is back on. The table is the gate's own, so a route added to
// it later is tested without being listed here.
func TestDisabledModuleRefusesItsRoutes(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	set := func(id string, on bool) {
		body := `{"enabled":false}`
		if on {
			body = `{"enabled":true}`
		}
		if code, out := do(t, c, "PUT", base+"/modules/"+id, body, csrf, "1"); code != http.StatusOK {
			t.Fatalf("turn %s %v: %d %v", id, on, code, out)
		}
	}
	routes := map[string]string{}
	for p, id := range moduleWrites {
		routes[p] = id
	}
	for p, id := range moduleReads {
		routes[p] = id
	}
	for pattern, id := range routes {
		method, path, _ := strings.Cut(pattern, " ")
		url := g.srv.URL + strings.NewReplacer("{site}", g.site, "{id}", "x_nothere").Replace(path)
		set(id, false)
		code, out := do(t, c, method, url, `{}`, csrf, "1")
		if code != http.StatusNotFound || !strings.Contains(out["error"].(string), id+" module is off") {
			t.Errorf("%s with %s off: %d %v, want 404", pattern, id, code, out)
		}
	}
}

// With Notes off a note cannot be added; turned back on, the same request
// works. With Goals off, page goals cannot be changed, but the rest of the
// site's settings still save.
func TestModuleOffRefusesWritesThenAllowsThem(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	note := `{"day":"2026-09-20","text":"Launch"}`
	do(t, c, "PUT", base+"/modules/notes", `{"enabled":false}`, csrf, "1")
	if code, _ := do(t, c, "POST", base+"/annotations", note, csrf, "1"); code != http.StatusNotFound {
		t.Errorf("note with Notes off: %d, want 404", code)
	}
	do(t, c, "PUT", base+"/modules/notes", `{"enabled":true}`, csrf, "1")
	if code, _ := do(t, c, "POST", base+"/annotations", note, csrf, "1"); code != http.StatusCreated {
		t.Errorf("note with Notes on: %d, want 201", code)
	}

	do(t, c, "PUT", base+"/modules/goals", `{"enabled":false}`, csrf, "1")
	if code, _ := do(t, c, "PUT", base+"/config", `{"page_goals":[{"name":"Saw pricing","path":"/pricing"}]}`, csrf, "1"); code != http.StatusNotFound {
		t.Errorf("page goal with Goals off: %d, want 404", code)
	}
	if code, out := do(t, c, "PUT", base+"/config", `{"hash_mode":true}`, csrf, "1"); code != http.StatusOK {
		t.Errorf("other settings with Goals off: %d %v", code, out)
	}
	do(t, c, "PUT", base+"/modules/goals", `{"enabled":true}`, csrf, "1")
	if code, _ := do(t, c, "PUT", base+"/config", `{"page_goals":[{"name":"Saw pricing","path":"/pricing"}]}`, csrf, "1"); code != http.StatusOK {
		t.Errorf("page goal with Goals on: %d, want 200", code)
	}
}
