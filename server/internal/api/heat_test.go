package api

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/writer"
)

// A page's heatmap is read from the counters the writer kept: elements and
// where in them, never a visitor. The module gates it, and the path is checked.
func TestHeatIsReadFromTheCounters(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	day := g.now.Format("2006-01-02")
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, TS: g.now.UnixMilli(), Visitor: 1, Path: "/"})
	g.waitApplied(t, 1) // the analytics store is ready
	row := func(kind, el string, n uint64) writer.HeatRow {
		return writer.HeatRow{Site: g.site, Day: day, Path: "/pricing", Width: 1280, Kind: kind, El: el, CX: 2, CY: 5, N: n, X: n * 100, Y: n * 300, W: n * 90, H: n * 40}
	}
	if err := g.w.AddHeat(context.Background(), []writer.HeatRow{row("v", "", 8), row("c", "a.buy", 6), row("d", "div.card", 2)}); err != nil {
		t.Fatal(err)
	}
	url := base + "/heat?from=" + day + "&to=" + day + "&path=/pricing"

	if code, out := do(t, c, "GET", url, ""); code != http.StatusNotFound {
		t.Fatalf("with the module off: %d %v, want 404", code, out)
	}
	do(t, c, "PUT", base+"/modules/heatmaps", `{"enabled":true}`, csrf, "1")
	code, out := do(t, c, "GET", url, "")
	if code != http.StatusOK {
		t.Fatalf("heat: %d %v", code, out)
	}
	if out["path"] != "/pricing" || out["width"] != float64(1280) || out["views"] != float64(8) {
		t.Fatalf("heat = %v", out)
	}
	clicks, _ := out["clicks"].([]any)
	if len(clicks) != 1 {
		t.Fatalf("clicks = %v", out["clicks"])
	}
	spot := clicks[0].(map[string]any)
	if spot["el"] != "a.buy" || spot["n"] != float64(6) || spot["x"] != float64(100) || spot["y"] != float64(300) {
		t.Fatalf("spot = %v", spot)
	}
	if dead, _ := out["dead"].([]any); len(dead) != 1 {
		t.Fatalf("dead = %v", out["dead"])
	}

	for name, u := range map[string]string{
		"no path":         base + "/heat",
		"a relative path": base + "/heat?path=pricing",
		"a long path":     base + "/heat?path=/" + strings.Repeat("a", 600),
	} {
		if code, _ := do(t, c, "GET", u, ""); code != http.StatusBadRequest {
			t.Errorf("%s: %d, want 400", name, code)
		}
	}
	// Another page of the same site, and another width, are their own maps.
	code, out = do(t, c, "GET", base+"/heat?from="+day+"&to="+day+"&path=/blog&width=390", "")
	if code != http.StatusOK || out["views"] != float64(0) || out["width"] != float64(390) {
		t.Fatalf("an empty page: %d %v", code, out)
	}
}

// The module is suggested only while it is off, and only once one page has had
// a hundred views in the site's day.
func TestHeatIsSuggestedForABusyPageWhileOff(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	ask := func() map[string]any {
		t.Helper()
		code, out := do(t, c, "GET", base+"/heat/ask", "")
		if code != http.StatusOK {
			t.Fatalf("ask: %d %v", code, out)
		}
		return out
	}
	n := uint64(0)
	view := func(count int, path string) {
		for i := 0; i < count; i++ {
			n++
			g.event(t, event.Event{Kind: event.KindPageview, EventID: n, TS: g.now.UnixMilli(), Visitor: n, Pageview: n, Path: path})
		}
		g.waitApplied(t, n)
	}
	view(1, "/")
	if out := ask(); out["ask"] != false {
		t.Fatalf("one view: %v", out)
	}
	view(98, "/pricing")
	if out := ask(); out["ask"] != false {
		t.Fatalf("98 views: %v", out)
	}
	view(2, "/pricing")
	out := ask()
	if out["ask"] != true || out["path"] != "/pricing" || out["views"] != float64(100) {
		t.Fatalf("100 views: %v", out)
	}
	do(t, c, "PUT", base+"/modules/heatmaps", `{"enabled":true}`, csrf, "1")
	if out := ask(); out["ask"] != false {
		t.Fatalf("with the module on: %v", out)
	}
}

// The script is sent only while the module is on, and the module says what it costs.
func TestHeatmapsModuleIsOffUntilTurnedOnAndSaysItsSize(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	find := func() map[string]any {
		t.Helper()
		_, out := do(t, c, "GET", base+"/modules", "")
		for _, m := range out["modules"].([]any) {
			if m := m.(map[string]any); m["id"] == "heatmaps" {
				return m
			}
		}
		t.Fatal("no heatmaps module")
		return nil
	}
	m := find()
	if m["enabled"] != false {
		t.Errorf("a new site has heatmaps on: %v", m["enabled"])
	}
	if b, _ := m["tracker_bytes"].(float64); b < 500 || b > 1536 {
		t.Errorf("heatmaps module is %v B, want a measured size within its 1.5 KB budget", m["tracker_bytes"])
	}
}
