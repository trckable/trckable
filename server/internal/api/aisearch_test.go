package api

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// The tab reads the robots' counters and AI's visitors in one answer, with
// Google's clicks per page when Search Console is connected: the numbers a
// page's flags are made from. Off, or unconnected, each part is simply empty.
func TestAISearchTab(t *testing.T) {
	queries, last := fakeSearchConsole(t)
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	day := time.Date(2026, 9, 10, 9, 0, 0, 0, time.UTC).UnixMilli()
	period := "?from=2026-09-07&to=2026-09-13"

	n := uint64(0)
	add := func(e event.Event) {
		n++
		e.EventID, e.Pageview = n, n
		g.event(t, e)
	}
	add(event.Event{Kind: event.KindPageview, TS: day, Visitor: 1, Path: "/pricing", Channel: "AI", RefHost: "chatgpt.com"})
	add(event.Event{Kind: event.KindPageview, TS: day + 1000, Visitor: 2, Path: "/pricing", Channel: "AI", RefHost: "claude.ai"})
	add(event.Event{Kind: event.KindPageview, TS: day + 2000, Visitor: 3, Path: "/", Channel: "Search", RefHost: "google.com"})
	for i := 0; i < 12; i++ {
		add(event.Event{Kind: event.KindCrawler, TS: day + int64(i)*2000, Path: "/docs", Browser: "OpenAI", OS: "train"})
	}
	add(event.Event{Kind: event.KindCrawler, TS: day, Path: "/pricing", Browser: "Anthropic", OS: "answer"})
	add(event.Event{Kind: event.KindCrawler, TS: day, Path: "/", Browser: "Google", OS: "index"})
	g.waitApplied(t, n)

	if code, _ := do(t, client(), "GET", base+"/report/ai-search"+period, ""); code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", code)
	}
	fetch := func(q string) map[string]any {
		t.Helper()
		code, out := do(t, owner, "GET", base+"/report/ai-search"+period+q, "")
		if code != http.StatusOK {
			t.Fatalf("ai-search: %d %v", code, out)
		}
		return out
	}
	page := func(out map[string]any, path string) map[string]any {
		t.Helper()
		for _, p := range out["pages"].([]any) {
			if m := p.(map[string]any); m["path"] == path {
				return m
			}
		}
		t.Fatalf("no row for %s in %v", path, out["pages"])
		return nil
	}

	// Crawlers have no switch: the robots are read from the start, asking them off changes nothing.
	do(t, owner, "PUT", base+"/modules/crawlers", `{"enabled":false}`, csrf, "1")
	out := fetch("")
	if out["visitors"] != float64(2) || out["google"] != false || out["crawled"] != float64(13) {
		t.Fatalf("crawlers: %v", out)
	}
	if p := page(out, "/pricing"); p["read"] != float64(1) || p["sent"] != float64(2) {
		t.Fatalf("/pricing: %v", p)
	}
	if p := page(out, "/docs"); p["read"] != float64(12) || p["sent"] != nil && p["sent"] != float64(0) || p["flag"] != "uncredited" {
		t.Fatalf("/docs is read twelve times and sends nobody: %v", p)
	}
	// A search engine's indexer is listed with the robots, so its failures show, but is not counted as crawled by AI.
	google := false
	for _, b := range out["bots"].([]any) {
		google = google || b.(map[string]any)["kind"] == "index"
	}
	if !google {
		t.Fatalf("the search bot is missing from the robots: %v", out["bots"])
	}

	// A page filter narrows the robots to that page, like every other card.
	if one := fetch("&f=page:/docs"); one["crawled"] != float64(12) {
		t.Fatalf("one page's robots: %v", one)
	}
	// Robots have one page to be narrowed to: "is not" and "any of" leave their counts alone.
	if not := fetch("&f=page!:/docs"); not["crawled"] != float64(13) {
		t.Fatalf("page is not: %v", not)
	}
	if any := fetch("&f=page:/docs&f=page:/pricing"); any["crawled"] != float64(13) {
		t.Fatalf("page is any of two: %v", any)
	}

	// Search Console connected: Google's clicks per page ride along, one question to Google for the hour.
	key, _ := json.Marshal(map[string]string{"key": serviceAccountKey(t)})
	do(t, owner, "PUT", base+"/modules/search", `{"enabled":true}`, csrf, "1")
	if code, out := do(t, owner, "PUT", base+"/search-console", string(key), csrf, "1"); code != 200 {
		t.Fatalf("connect: %d %v", code, out)
	}
	out = fetch("")
	if out["google"] != true {
		t.Fatalf("connected, google is %v", out["google"])
	}
	if q := *last; q["startDate"] != "2026-09-07" || q["endDate"] != "2026-09-13" {
		t.Fatalf("Google was asked for %v, not the period", q)
	}
	fetch("")
	if got := queries.Load(); got != 1 {
		t.Fatalf("Google was asked %d times for the same page report", got)
	}
}

// The guide asks once whether anything of the kind has ever come.
func TestAISeenRoute(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/report/ai-seen"
	if code, _ := do(t, client(), "GET", base, ""); code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", code)
	}
	code, out := do(t, owner, "GET", base, "")
	if code != http.StatusOK || out["visitor"] != false || out["crawler"] != false {
		t.Fatalf("a new site: %d %v", code, out)
	}
	at := time.Date(2026, 9, 10, 9, 0, 0, 0, time.UTC).UnixMilli()
	g.event(t, event.Event{Kind: event.KindCrawler, EventID: 1, TS: at, Path: "/", Browser: "OpenAI", OS: "train"})
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 2, Pageview: 2, TS: at, Visitor: 1, Path: "/", Channel: "AI", RefHost: "chatgpt.com"})
	g.waitApplied(t, 2)
	if _, out := do(t, owner, "GET", base, ""); out["visitor"] != true || out["crawler"] != true {
		t.Fatalf("a visitor and a crawler: %v", out)
	}
}
