package api

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
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

// The overlay frames a page of this server, which frames the owner's own site
// with nothing allowed in it, under a policy that lets it frame that site and
// be framed by this server only.
func TestHeatFrameFramesTheOwnersSiteWithNothingAllowed(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	do(t, c, "PUT", base+"/modules/heatmaps", `{"enabled":true}`, csrf, "1")
	var asked []string
	headers := http.Header{}
	status := http.StatusOK
	was := checkClient
	defer func() { checkClient = was }()
	checkClient = func() *http.Client {
		return &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
			asked = append(asked, r.URL.String())
			if status == 0 {
				return nil, errors.New("no route to host")
			}
			return &http.Response{StatusCode: status, Header: headers.Clone(), Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
		})}
	}
	get := func(path string) (int, http.Header, string) {
		t.Helper()
		resp, err := c.Get(base + "/heat-frame?path=" + url.QueryEscape(path))
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, resp.Header, string(b)
	}
	hint := func(body string) bool {
		return strings.Contains(body, heatFrameHint) && !strings.Contains(body, "<iframe")
	}

	code, h, body := get("/pricing")
	if code != http.StatusOK || !strings.Contains(body, `<iframe sandbox="" referrerpolicy="no-referrer"`) || !strings.Contains(body, `src="https://site.com/pricing"`) {
		t.Fatalf("a page that can be framed: %d %s", code, body)
	}
	if strings.Contains(strings.ToLower(body), "<script") {
		t.Error("the frame page runs a script")
	}
	csp := h.Get("Content-Security-Policy")
	for _, want := range []string{"default-src 'none'", "frame-src https://site.com https://*.site.com", "frame-ancestors 'self'"} {
		if !strings.Contains(csp, want) {
			t.Errorf("CSP %q lacks %q", csp, want)
		}
	}
	if h.Get("X-Frame-Options") != "SAMEORIGIN" || h.Get("Cache-Control") != "no-store" {
		t.Errorf("headers: %v", h)
	}
	if len(asked) != 1 || asked[0] != "https://site.com/pricing" {
		t.Errorf("the check asked for %v, want the page itself", asked)
	}

	// A hash route and a path with characters in it are carried, escaped.
	if _, _, body = get("/#/pricing?x=1"); strings.Contains(body, "<iframe") {
		t.Errorf("a query string is not a path of the list: %s", body)
	}
	if _, _, body = get("/#/pricing"); !strings.Contains(body, `src="https://site.com/#/pricing"`) {
		t.Errorf("a hash route: %s", body)
	}

	// A site that refuses framing.
	headers.Set("X-Frame-Options", "DENY")
	if _, _, body = get("/pricing"); !hint(body) {
		t.Errorf("X-Frame-Options DENY: %s", body)
	}
	headers.Del("X-Frame-Options")
	headers.Set("Content-Security-Policy", "frame-ancestors 'none'")
	if _, _, body = get("/pricing"); !hint(body) {
		t.Errorf("frame-ancestors 'none': %s", body)
	}
	headers.Set("Content-Security-Policy", "default-src 'self'; frame-ancestors *")
	if _, _, body = get("/pricing"); hint(body) {
		t.Errorf("frame-ancestors *: %s", body)
	}
	headers.Del("Content-Security-Policy")

	// A page that cannot be read is not shown.
	status = 0
	if _, _, body = get("/pricing"); !hint(body) {
		t.Errorf("an unreachable site: %s", body)
	}
	status = http.StatusOK

	// Opening some pages is itself something done: never framed, never even asked for.
	asked = nil
	for _, p := range []string{"/logout", "/signout", "/Sign-Out", "/log_off", "/unsubscribe"} {
		if _, _, body = get(p); !hint(body) {
			t.Errorf("%s was framed: %s", p, body)
		}
	}
	if len(asked) != 0 {
		t.Errorf("the site was asked for %v", asked)
	}

	// Nothing but a path of the site is taken.
	for _, p := range []string{"", "pricing", "//evil.example/", "/a b", `/"onload="x`, "/<script>", "/" + strings.Repeat("a", 600)} {
		if code, _, _ := get(p); code != http.StatusBadRequest {
			t.Errorf("path %.30q: %d, want 400", p, code)
		}
	}
}

func TestRefusesFraming(t *testing.T) {
	const us = "https://trckable.example"
	for name, c := range map[string]struct {
		h    map[string]string
		deny bool
	}{
		"nothing said":           {nil, false},
		"X-Frame-Options":        {map[string]string{"X-Frame-Options": "SAMEORIGIN"}, true},
		"ancestors none":         {map[string]string{"Content-Security-Policy": "frame-ancestors 'none'"}, true},
		"ancestors self":         {map[string]string{"Content-Security-Policy": "frame-ancestors 'self'"}, true},
		"ancestors another site": {map[string]string{"Content-Security-Policy": "frame-ancestors https://other.example"}, true},
		"ancestors everyone":     {map[string]string{"Content-Security-Policy": "frame-ancestors *"}, false},
		"ancestors this server":  {map[string]string{"Content-Security-Policy": "script-src 'self'; frame-ancestors https://trckable.example"}, false},
		"ancestors https":        {map[string]string{"Content-Security-Policy": "frame-ancestors https:"}, false},
		"a policy about scripts": {map[string]string{"Content-Security-Policy": "script-src 'self'"}, false},
	} {
		h := http.Header{}
		for k, v := range c.h {
			h.Set(k, v)
		}
		if got := refusesFraming(h, us); got != c.deny {
			t.Errorf("%s: refuses = %v, want %v", name, got, c.deny)
		}
	}
}
