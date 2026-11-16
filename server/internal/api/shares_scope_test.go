package api

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/query"
)

// A link shows the sections its owner left on and nothing of the others: the
// tables are empty in the answer, not hidden by the page, and a filter that
// would tell what a hidden table says is refused.
func TestShareSectionsAreEnforcedOnTheServer(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, Visitor: 4, Path: "/pricing", TS: g.now.Add(-time.Hour).UnixMilli(), Country: "DE", Channel: "Search", RefHost: "google.com", Device: "desktop", Browser: "Chrome", OS: "macOS"})
	g.waitApplied(t, 1)

	open := func(body string) (*http.Client, string) {
		t.Helper()
		code, out := do(t, c, "POST", base+"/shares", body, csrf, "1")
		if code != http.StatusCreated {
			t.Fatalf("create %s: %d %v", body, code, out)
		}
		url := out["url"].(string)
		anon := client()
		if code, _ := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`); code != 200 {
			t.Fatal("open")
		}
		return anon, out["share"].(map[string]any)["id"].(string)
	}
	const day = "from=2026-09-22&to=2026-09-22"
	report := func(anon *http.Client, extra string) (int, map[string]any) {
		return do(t, anon, "GET", g.srv.URL+"/api/v1/share/report?"+day+extra, "")
	}
	rows := func(rep map[string]any, dim string) int {
		t.Helper()
		d, ok := rep["current"].(map[string]any)["dims"].(map[string]any)[dim].([]any)
		if !ok {
			t.Fatalf("dims.%s is missing from the answer (it is empty when hidden, never missing): %v", dim, rep["current"].(map[string]any)["dims"])
		}
		return len(d)
	}
	all := map[string]int{"page": 1, "entry_page": 1, "channel": 1, "referrer": 1, "country": 1, "device": 1, "browser": 1, "os": 1}

	// A link made with no word about sections shows all of them.
	full, _ := open(`{"name":"Everything"}`)
	_, rep := report(full, "&daily=1")
	for dim, n := range all {
		if got := rows(rep, dim); got < n {
			t.Errorf("a link with every section lost dims.%s", dim)
		}
	}

	// Pages only: the page tables, and not the sources, places or devices.
	pages, id := open(`{"name":"Pages","sections":["pages"]}`)
	_, rep = report(pages, "&daily=1")
	for dim := range all {
		want := 0
		if dim == "page" || dim == "entry_page" {
			want = 1
		}
		if got := rows(rep, dim); got != want {
			t.Errorf("pages only: dims.%s has %d rows, want %d", dim, got, want)
		}
	}
	for _, day := range rep["current"].(map[string]any)["days"].([]any) {
		dims := day.(map[string]any)["dims"].(map[string]any)
		for _, dim := range []string{"channel", "country", "device"} {
			if len(dims[dim].([]any)) != 0 {
				t.Errorf("pages only: the day by day still carries %s: %v", dim, dims)
			}
		}
	}
	if rep["current"].(map[string]any)["kpis"].(map[string]any)["visitors"] != 1.0 {
		t.Errorf("the headline numbers are always there: %v", rep["current"])
	}
	// What a hidden table would tell, by the numbers a filter moves, is refused: a filter of a shown section is fine.
	for filter, want := range map[string]int{"country:DE": http.StatusForbidden, "channel!:Direct": http.StatusForbidden, "device:desktop": http.StatusForbidden, "referrer:google.com": http.StatusForbidden, "page:/pricing": 200} {
		if code, out := report(pages, "&f="+filter); code != want {
			t.Errorf("filter %s: %d %v, want %d", filter, code, out, want)
		}
	}
	// A saved segment is a filter too.
	code, seg := do(t, c, "POST", base+"/segments", `{"name":"Germans","query":"f=country:DE"}`, csrf, "1")
	if code != http.StatusCreated && code != 200 {
		t.Fatalf("segment: %d %v", code, seg)
	}
	if code, _ := report(pages, "&segment="+seg["id"].(string)); code != http.StatusForbidden {
		t.Errorf("a segment that filters by a hidden section was read: %d", code)
	}
	// And the same link, with everything, takes it.
	if code, _ := report(full, "&segment="+seg["id"].(string)); code != 200 {
		t.Errorf("a full link refused a segment: %d", code)
	}

	// Nothing: the headline numbers only.
	none, _ := open(`{"name":"Numbers","sections":[]}`)
	_, rep = report(none, "")
	for dim := range all {
		if got := rows(rep, dim); got != 0 {
			t.Errorf("no sections: dims.%s has %d rows", dim, got)
		}
	}

	// The link says what it shows, to the page that has to hide it too.
	_, me := do(t, pages, "GET", g.srv.URL+"/api/v1/share/me", "")
	if s, _ := me["sections"].([]any); len(s) != 1 || s[0] != "pages" || me["period"] != "" {
		t.Errorf("share/me: %v %v", me["sections"], me["period"])
	}

	// Changing it takes effect for a reader who already has the link open.
	if code, _ := do(t, c, "PATCH", base+"/shares/"+id, `{"sections":["pages","places"]}`, csrf, "1"); code != 200 {
		t.Fatal("patch sections")
	}
	_, rep = report(pages, "")
	if rows(rep, "country") != 1 || rows(rep, "channel") != 0 {
		t.Errorf("the change did not reach the open link: %v", rep["current"].(map[string]any)["dims"])
	}
	if code, _ := report(pages, "&f=country:DE"); code != 200 {
		t.Errorf("a shown section's filter was refused after the change: %d", code)
	}
	_, list := do(t, c, "GET", base+"/shares", "")
	for _, s := range list["shares"].([]any) {
		if s.(map[string]any)["id"] == id {
			if got := s.(map[string]any)["sections"].([]any); len(got) != 2 || got[0] != "pages" || got[1] != "places" {
				t.Errorf("the list's sections: %v", got)
			}
		}
	}

	// Bad names are refused, and nothing is stored.
	for _, body := range []string{`{"sections":["pages","payments"]}`, `{"sections":["Pages"]}`, `{"sections":["overview"]}`, `{"period":"1y"}`, `{"period":"custom"}`} {
		if code, _ := do(t, c, "PATCH", base+"/shares/"+id, body, csrf, "1"); code != http.StatusBadRequest {
			t.Errorf("PATCH %s: %d, want 400", body, code)
		}
	}
	for _, body := range []string{`{"sections":["nope"]}`, `{"period":"forever"}`} {
		if code, _ := do(t, c, "POST", base+"/shares", body, csrf, "1"); code != http.StatusBadRequest {
			t.Errorf("POST %s: %d, want 400", body, code)
		}
	}
}

// A link fixed to a period shows that period, whatever dates the page asks
// for: the server writes the range, and refuses the comparisons that reach
// another one.
func TestShareFixedPeriodIsEnforcedOnTheServer(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	today := g.now.UTC().Format("2006-01-02")
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, Visitor: 4, Path: "/", TS: g.now.Add(-time.Hour).UnixMilli()})
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 2, Visitor: 5, Path: "/", TS: g.now.Add(-20 * 24 * time.Hour).UnixMilli()})
	g.waitApplied(t, 2)
	if code, _ := do(t, c, "POST", base+"/annotations", `{"day":"`+g.now.AddDate(0, 0, -20).Format("2006-01-02")+`","text":"old news"}`, csrf, "1"); code != http.StatusCreated {
		t.Fatal("note")
	}
	if code, _ := do(t, c, "POST", base+"/annotations", `{"day":"`+today+`","text":"today"}`, csrf, "1"); code != http.StatusCreated {
		t.Fatal("note")
	}

	_, made := do(t, c, "POST", base+"/shares", `{"name":"Week","period":"7d","notes":true}`, csrf, "1")
	url := made["url"].(string)
	anon := client()
	code, info := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`)
	if code != 200 || info["period"] != "7d" {
		t.Fatalf("open: %d %v", code, info)
	}
	visitors := func(rep map[string]any) float64 {
		return rep["current"].(map[string]any)["kpis"].(map[string]any)["visitors"].(float64)
	}

	// A year of dates asked for: the week answers.
	code, rep := do(t, anon, "GET", g.srv.URL+"/api/v1/share/report?from=2020-01-01&to=2030-01-01&tz=Pacific/Kiritimati", "")
	if code != 200 || rep["to"] != today || rep["from"] != g.now.AddDate(0, 0, -6).UTC().Format("2006-01-02") {
		t.Fatalf("the period was not held: %d %v..%v", code, rep["from"], rep["to"])
	}
	if visitors(rep) != 1 {
		t.Errorf("the visit of 20 days ago is outside the week: %v", rep["current"])
	}
	// The change against the week before stays; reaching for another stretch is answered with the week before.
	weekBefore := g.now.AddDate(0, 0, -13).UTC().Format("2006-01-02")
	for q, want := range map[string]string{"&compare=previous": weekBefore, "&compare=year": weekBefore, "&compare=custom&cfrom=2026-01-01&cto=2026-01-10": weekBefore, "&compare=none": "", "": ""} {
		code, rep := do(t, anon, "GET", g.srv.URL+"/api/v1/share/report?from=2020-01-01&to=2030-01-01"+q, "")
		got, _ := rep["previous_from"].(string)
		if code != 200 || got != want {
			t.Errorf("compare %q: %d, the comparison starts %q, want %q", q, code, got, want)
		}
	}
	// The notes are the week's.
	_, notes := do(t, anon, "GET", g.srv.URL+"/api/v1/share/annotations?from=2020-01-01&to=2030-01-01", "")
	if got := notes["annotations"].([]any); len(got) != 1 || got[0].(map[string]any)["text"] != "today" {
		t.Errorf("a link fixed to a week showed the notes of other weeks: %v", got)
	}

	// A month so far is told against the same days of last month, as the dashboard does.
	_, month := do(t, c, "POST", base+"/shares", `{"name":"Month","period":"mtd"}`, csrf, "1")
	murl := month["url"].(string)
	mreader := client()
	do(t, mreader, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+murl[len(murl)-26:]+`"}`)
	_, rep = do(t, mreader, "GET", g.srv.URL+"/api/v1/share/report?compare=custom&cfrom=2026-01-01&cto=2026-01-10", "")
	if rep["from"] != "2026-09-01" || rep["to"] != today || rep["previous_from"] != "2026-08-01" || rep["previous_to"] != "2026-08-22" {
		t.Errorf("this month so far: %v..%v against %v..%v", rep["from"], rep["to"], rep["previous_from"], rep["previous_to"])
	}

	// A link that lets the reader choose still does.
	_, free := do(t, c, "POST", base+"/shares", `{"name":"Free"}`, csrf, "1")
	furl := free["url"].(string)
	reader := client()
	do(t, reader, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+furl[len(furl)-26:]+`"}`)
	_, rep = do(t, reader, "GET", g.srv.URL+"/api/v1/share/report?from="+g.now.AddDate(0, 0, -30).Format("2006-01-02")+"&to="+today, "")
	if visitors(rep) != 2 {
		t.Errorf("a link with no fixed period must read what is asked for: %v", rep["current"])
	}

	// The period can be changed afterwards, and taken off.
	id := made["share"].(map[string]any)["id"].(string)
	if code, _ := do(t, c, "PATCH", base+"/shares/"+id, `{"period":""}`, csrf, "1"); code != 200 {
		t.Fatal("patch period")
	}
	_, rep = do(t, anon, "GET", g.srv.URL+"/api/v1/share/report?from="+g.now.AddDate(0, 0, -30).Format("2006-01-02")+"&to="+today, "")
	if visitors(rep) != 2 {
		t.Errorf("a period taken off still held: %v", rep["current"])
	}
}

// Every period a link can be fixed to is the range the dashboard's menu draws.
func TestSharePeriodRanges(t *testing.T) {
	// Wednesday 25 March 2026, and the leap day, which a year back does not have.
	d := func(s string) time.Time { x, _ := time.Parse("2006-01-02", s); return x }
	for _, tc := range []struct{ now, period, from, to string }{
		{"2026-03-25", "today", "2026-03-25", "2026-03-25"},
		{"2026-03-25", "yesterday", "2026-03-24", "2026-03-24"},
		{"2026-03-25", "7d", "2026-03-19", "2026-03-25"},
		{"2026-03-25", "30d", "2026-02-24", "2026-03-25"},
		{"2026-03-25", "90d", "2025-12-26", "2026-03-25"},
		{"2026-03-25", "12mo", "2025-03-26", "2026-03-25"},
		{"2028-02-29", "12mo", "2027-03-01", "2028-02-29"},
		{"2026-03-25", "mtd", "2026-03-01", "2026-03-25"},
		{"2026-03-25", "lastmonth", "2026-02-01", "2026-02-28"},
		{"2026-01-10", "lastmonth", "2025-12-01", "2025-12-31"},
		{"2026-03-25", "ytd", "2026-01-01", "2026-03-25"},
	} {
		from, to := sharePeriodRange(tc.period, d(tc.now))
		if f, e := from.Format("2006-01-02"), to.Format("2006-01-02"); f != tc.from || e != tc.to {
			t.Errorf("%s on %s: %s..%s, want %s..%s", tc.period, tc.now, f, e, tc.from, tc.to)
		}
	}
}

// A dimension the report can group by is in a section, so a link with a
// section off cannot carry it: a new one added to the engine fails here
// until it is placed.
func TestEveryReportDimensionBelongsToASection(t *testing.T) {
	for _, dim := range append(append(append([]string{}, query.DefaultDims...), query.DeepDims...), "page", "group", "hostname") {
		if _, ok := dimSection[dim]; !ok {
			t.Errorf("the dimension %q is in no section of a shared link", dim)
		}
	}
	for dim := range dimSection {
		if !query.ValidDim(dim) {
			t.Errorf("dimSection lists %q, which the report cannot group by", dim)
		}
	}
	if !strings.Contains("pages sources places tech", dimSection["country"]) {
		t.Error("a section name is not one a link can switch off")
	}
}
