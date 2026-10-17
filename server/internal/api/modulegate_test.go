package api

import (
	"net/http"
	"strings"
	"testing"
)

// Every route the gate still guards (payments while no provider is connected,
// heatmaps while the choice is off) answers 404, and works again once it is
// on. The table is the gate's own, so a route added to it later is tested
// without being listed here.
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

// Features without a switch keep answering when an older client asks to turn
// them off: the request is accepted, the list still says on, and the routes
// they own work, notes included.
func TestFeaturesWithoutASwitchAlwaysAnswer(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	period := "?from=2026-09-01&to=2026-09-21&tz=UTC"
	for _, id := range []string{"funnels", "notes", "rhythm", "journeys", "map", "retention", "crawlers"} {
		code, out := do(t, c, "PUT", base+"/modules/"+id, `{"enabled":false}`, csrf, "1")
		if code != http.StatusOK {
			t.Fatalf("asking %s off: %d %v", id, code, out)
		}
		for _, m := range out["modules"].([]any) {
			if row := m.(map[string]any); row["id"] == id && row["enabled"] != true {
				t.Errorf("%s reads %v after asking it off, want on", id, row["enabled"])
			}
		}
	}
	for _, path := range []string{
		"/annotations" + period, "/report/retention" + period, "/report/crawlers" + period,
		"/report/heatmap" + period, "/report/funnel" + period + "&steps=%5B%5D",
	} {
		if code, out := do(t, c, "GET", base+path, ""); code == http.StatusNotFound {
			t.Errorf("GET %s answered 404 (%v): a feature without a switch must work", path, out)
		}
	}
	note := `{"day":"2026-09-20","text":"Launch"}`
	if code, out := do(t, c, "POST", base+"/annotations", note, csrf, "1"); code != http.StatusCreated {
		t.Errorf("a note with Notes asked off: %d %v, want 201", code, out)
	}
}

// With Goals off, page goals cannot be changed, but the rest of the site's
// settings still save.
func TestModuleOffRefusesWritesThenAllowsThem(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
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
