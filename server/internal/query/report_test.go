package query

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/wal"
	"github.com/trckable/trckable/server/internal/writer"
)

// golden builds a tiny site through the REAL writer (events → sessions),
// with every metric computed by hand below.
//
//	A1  visitor A (returning)  10:00 /        Search google.com DE Desktop
//	                           10:02 /pricing (SPA nav: the event says Direct)
//	                           10:03 goal signup · engagement 60 s + 30 s
//	B   visitor B (new)        11:00 /blog    AI chatgpt.com   US Mobile   (bounce)
//	C   visitor C (new)        12:00 /pricing Search google.com US Desktop
//	                           12:01 /
//	A3  visitor A              15:00 /        Direct                       (bounce)
//	D   visitor D (new)   Sep 11 02:00 /docs  Email                       (bounce)
//
// open=false: the writer's clock is hours later, so every session is closed
// and written. open=true: the clock is one minute after D, so A1, B, C and A3
// are written while D is still open in memory — reports must merge both and
// give results identical to the all-closed case.
func golden(t *testing.T, open bool) Q {
	t.Helper()
	ctx := context.Background()
	dir := t.TempDir()
	st, err := duck.Open(ctx, filepath.Join(dir, "g.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	lg, err := wal.Open(filepath.Join(dir, "wal"), wal.Options{NoSync: true})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { lg.Close() })

	ms := func(h, m int) int64 { return time.Date(2026, 9, 10, h, m, 0, 0, time.UTC).UnixMilli() }
	old := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC).UnixMilli()
	d := time.Date(2026, 9, 11, 2, 0, 0, 0, time.UTC).UnixMilli()
	pv := func(ts int64, v uint64, pvid uint64, path, ch, ref, cc, dev string, fs int64) event.Event {
		return event.Event{Site: "s1", Kind: event.KindPageview, TS: ts, Visitor: v, Pageview: pvid, Path: path, Channel: ch, RefHost: ref, Country: cc, Device: dev, FirstSeen: fs}
	}
	evs := []event.Event{
		pv(ms(10, 0), 1, 101, "/", "Search", "google.com", "DE", "Desktop", old),
		pv(ms(10, 2), 1, 102, "/pricing", "Direct", "", "DE", "Desktop", old),
		{Site: "s1", Kind: event.KindGoal, TS: ms(10, 3), Visitor: 1, Pageview: 102, Path: "/pricing", Goal: "signup", Country: "DE", Device: "Desktop", FirstSeen: old, Props: map[string]string{"plan": "pro", "seats": "3"}},
		{Site: "s1", Kind: event.KindEngagement, TS: ms(10, 2), Visitor: 1, Pageview: 101, EngagedMs: 40000, ScrollPct: 40},
		{Site: "s1", Kind: event.KindEngagement, TS: ms(10, 2), Visitor: 1, Pageview: 101, EngagedMs: 60000, ScrollPct: 80}, // running totals: max wins
		{Site: "s1", Kind: event.KindEngagement, TS: ms(10, 3), Visitor: 1, Pageview: 102, EngagedMs: 30000, ScrollPct: 30},
		pv(ms(11, 0), 2, 201, "/blog", "AI", "chatgpt.com", "US", "Mobile", ms(11, 0)),
		pv(ms(12, 0), 3, 301, "/pricing", "Search", "google.com", "US", "Desktop", ms(12, 0)),
		pv(ms(12, 1), 3, 302, "/", "Direct", "", "US", "Desktop", ms(12, 0)),
		pv(ms(15, 0), 1, 103, "/", "Direct", "", "DE", "Desktop", old),
		pv(d, 4, 401, "/docs", "Email", "", "GB", "Desktop", d),
		// Robots, reported by the site's own server. They are never visitors.
		{Site: "s1", Kind: event.KindCrawler, TS: ms(9, 0), Path: "/", Browser: "OpenAI", OS: "train"},
		{Site: "s1", Kind: event.KindCrawler, TS: ms(9, 30), Path: "/docs", Browser: "OpenAI", OS: "train"},
		{Site: "s1", Kind: event.KindCrawler, TS: ms(13, 0), Path: "/", Browser: "Anthropic", OS: "answer"},
		{Site: "s1", Kind: event.KindCrawler, TS: ms(14, 0), Path: "/gone", Browser: "Google", OS: "index", Goal: "error"},
	}
	for i := range evs {
		evs[i].EventID = uint64(i + 1)
		b, _ := evs[i].Marshal()
		if _, err := lg.Append(ctx, b); err != nil {
			t.Fatal(err)
		}
	}
	clock := time.UnixMilli(d + 60_000)
	if !open {
		clock = time.UnixMilli(d + 6*3600_000)
	}
	w := writer.New(lg, st, writer.Options{FlushEvery: 10 * time.Millisecond, IdleClose: 30 * time.Millisecond, Now: func() time.Time { return clock }})
	wctx, cancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() { done <- w.Run(wctx) }()
	for w.Applied() < uint64(len(evs)) {
		time.Sleep(5 * time.Millisecond)
	}
	time.Sleep(100 * time.Millisecond) // an idle tick closes sessions (closed mode)
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	var written int
	st.DB.QueryRow(`SELECT count(*) FROM sessions`).Scan(&written)
	if open && written != 4 || !open && written != 5 {
		t.Fatalf("setup: %d sessions written (open=%v)", written, open)
	}
	return Q{DB: st.DB, Open: w.OpenSessions}
}

func both(t *testing.T, f func(t *testing.T, q Q)) {
	for _, open := range []bool{false, true} {
		name := "all sessions written"
		if open {
			name = "written plus open in memory"
		}
		t.Run(name, func(t *testing.T) { f(t, golden(t, open)) })
	}
}

var sep10 = Params{Site: "s1", From: time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC), To: time.Date(2026, 9, 11, 0, 0, 0, 0, time.UTC), Goals: true}

func rowsOf(rs []Row) map[string]int64 {
	m := map[string]int64{}
	for _, r := range rs {
		m[r.Value] = r.Visitors
	}
	return m
}

func eq(t *testing.T, what string, got, want any) {
	t.Helper()
	if got != want {
		t.Errorf("%s = %v, want %v", what, got, want)
	}
}

func TestReportGoldenKPIs(t *testing.T) { both(t, testKPIs) }

func testKPIs(t *testing.T, q Q) {
	r, err := q.Report(context.Background(), sep10)
	if err != nil {
		t.Fatal(err)
	}
	k := r.KPIs
	eq(t, "visitors", k.Visitors, int64(3))
	eq(t, "sessions", k.Sessions, int64(4))
	eq(t, "pageviews", k.Pageviews, int64(6))
	eq(t, "bounce", k.BounceRate, 0.5)        // B and A3
	eq(t, "avg session", k.AvgSessionS, 60.0) // (180 + 0 + 60 + 0) / 4
	eq(t, "views/session", k.ViewsPerSess, 1.5)
	if k.NewVisitors < 0.666 || k.NewVisitors > 0.667 { // B and C of A, B, C
		t.Errorf("new visitor share = %v, want 2/3", k.NewVisitors)
	}
}

func TestSourcesComeFromTheEntryPageview(t *testing.T) { both(t, testSources) }

func testSources(t *testing.T, q Q) {
	r, err := q.Report(context.Background(), sep10)
	if err != nil {
		t.Fatal(err)
	}
	ch := rowsOf(r.Dims["channel"])
	eq(t, "Search visitors", ch["Search"], int64(2))
	eq(t, "AI visitors", ch["AI"], int64(1))
	// A's SPA navigation is labelled Direct in the raw event but must not count.
	eq(t, "Direct visitors", ch["Direct"], int64(1)) // only A3
	if r.Dims["channel"][0].Value != "Search" {
		t.Errorf("top channel = %s", r.Dims["channel"][0].Value)
	}
	ref := rowsOf(r.Dims["referrer"])
	eq(t, "google.com", ref["google.com"], int64(2))
	entry := rowsOf(r.Dims["entry_page"])
	eq(t, "entry /", entry["/"], int64(1)) // A1 and A3: one visitor
	eq(t, "entry /pricing", entry["/pricing"], int64(1))
	pages := rowsOf(r.Dims["page"])
	eq(t, "page /", pages["/"], int64(2)) // A and C
	eq(t, "page /pricing", pages["/pricing"], int64(2))
	eq(t, "goals", rowsOf(r.Goals)["signup"], int64(1))
	eq(t, "country US", rowsOf(r.Dims["country"])["US"], int64(2))
}

func TestFiltersFollowTheMoney(t *testing.T) { both(t, testFilters) }

func testFilters(t *testing.T, q Q) {
	p := sep10
	p.Filters = []Filter{{Dim: "channel", Value: "Search"}}
	r, err := q.Report(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "search visitors", r.KPIs.Visitors, int64(2))
	eq(t, "search sessions", r.KPIs.Sessions, int64(2))
	eq(t, "search pageviews", r.KPIs.Pageviews, int64(4))
	eq(t, "search goals", rowsOf(r.Goals)["signup"], int64(1))

	p.Filters = []Filter{{Dim: "page", Value: "/pricing"}}
	r, _ = q.Report(context.Background(), p)
	eq(t, "sessions that saw /pricing", r.KPIs.Sessions, int64(2))

	p.Filters = []Filter{{Dim: "channel", Value: "Search"}, {Dim: "country", Value: "US"}}
	r, _ = q.Report(context.Background(), p)
	eq(t, "search AND US", r.KPIs.Visitors, int64(1))

	p.Filters = []Filter{{Dim: "channel; DROP TABLE events", Value: "x"}}
	if _, err := q.Report(context.Background(), p); err == nil {
		t.Fatal("unknown filter dimension must be rejected")
	}
}

func TestTimezoneAndDaily(t *testing.T) { both(t, testDaily) }

func testDaily(t *testing.T, q Q) {
	p := Params{Site: "s1", From: time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC), To: time.Date(2026, 9, 12, 0, 0, 0, 0, time.UTC), Daily: true, Goals: true}
	r, _ := q.Report(context.Background(), p)
	if len(r.Days) != 2 || r.Days[0].Date != "2026-09-10" || r.Days[1].KPIs.Visitors != 1 {
		t.Fatalf("UTC days: %+v", r.Days)
	}
	if top := r.Days[0].Dims["channel"][0]; top.Value != "Search" || top.Visitors != 2 {
		t.Fatalf("daily top channel: %+v", top)
	}
	// In New York (UTC−4) D's 02:00 UTC visit belongs to Sep 10 evening.
	p.TZ = "America/New_York"
	r, _ = q.Report(context.Background(), p)
	if len(r.Days) != 1 || r.Days[0].KPIs.Visitors != 4 {
		t.Fatalf("NY days: %+v", r.Days)
	}
	if _, err := q.Report(context.Background(), Params{Site: "s1", From: p.From, To: p.To, TZ: "Mars/Olympus"}); err == nil {
		t.Fatal("bad timezone must be rejected")
	}
}

// Above ExactLimit, breakdown rows are estimated and the result says so;
// headline KPIs stay exact.
func TestApproximateAboveExactLimit(t *testing.T) {
	q := golden(t, false)
	old := ExactLimit
	ExactLimit = 2
	defer func() { ExactLimit = old }()
	r, err := q.Report(context.Background(), sep10)
	if err != nil {
		t.Fatal(err)
	}
	if !r.Approximate {
		t.Fatal("expected approximate breakdowns above the limit")
	}
	eq(t, "exact visitors KPI", r.KPIs.Visitors, int64(3))
	eq(t, "tiny cardinalities stay exact under HLL", rowsOf(r.Dims["channel"])["Search"], int64(2))
}

func TestDailyKPIsIncludeNewVisitorShare(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		p := sep10
		p.Daily, p.Bucket = true, "day"
		res, err := q.Report(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		if len(res.Days) != 1 {
			t.Fatalf("days: %d", len(res.Days))
		}
		// B and C are new on Sep 10; A was first seen in January.
		eq(t, "new visitors on Sep 10", res.Days[0].KPIs.NewVisitors, 2.0/3.0)
	})
}

func TestWeeksStartOnTheSitesDay(t *testing.T) {
	// Wednesday 2026-09-23 to Wednesday 2026-10-07.
	day := func(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 0, 0, 0, 0, time.UTC) }
	p := Params{TZ: "UTC", Bucket: "week", From: day(2026, 9, 23), To: day(2026, 10, 7)}
	if got := fillSeries(nil, p)[0].T; got != "2026-09-21T00:00" {
		t.Fatalf("Monday weeks start %s", got)
	}
	p.SundayWeeks = true
	if got := fillSeries(nil, p)[0].T; got != "2026-09-20T00:00" {
		t.Fatalf("Sunday weeks start %s", got)
	}
	if got := bucketOf(p, "lstart"); !strings.Contains(got, "INTERVAL 1 DAY") {
		t.Fatalf("Sunday bucket SQL: %s", got)
	}
}

func TestFillSeriesCoversEveryBucket(t *testing.T) {
	loc, _ := time.LoadLocation("Europe/Berlin")
	day := func(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 0, 0, 0, 0, loc).UTC() }
	got := map[string]Point{"2026-09-20T09:00": {T: "2026-09-20T09:00", Visitors: 4}}
	hours := fillSeries(got, Params{TZ: "Europe/Berlin", Bucket: "hour", From: day(2026, 9, 20), To: day(2026, 9, 21)})
	if len(hours) != 24 || hours[0].T != "2026-09-20T00:00" || hours[9].Visitors != 4 {
		t.Fatalf("hours: %d first=%s h9=%v", len(hours), hours[0].T, hours[9])
	}
	// DST end: Oct 25 2026 has 25 wall-clock hours in Berlin, but buckets are
	// wall-clock, so 24 distinct labels (02:00 appears once).
	if n := len(fillSeries(nil, Params{TZ: "Europe/Berlin", Bucket: "hour", From: day(2026, 10, 25), To: day(2026, 10, 26)})); n != 24 {
		t.Fatalf("dst day: %d buckets", n)
	}
	weeks := fillSeries(nil, Params{TZ: "Europe/Berlin", Bucket: "week", From: day(2026, 9, 2), To: day(2026, 9, 30)})
	if weeks[0].T != "2026-08-31T00:00" || len(weeks) != 5 {
		t.Fatalf("weeks: %v", weeks)
	}
	months := fillSeries(nil, Params{TZ: "UTC", Bucket: "month", From: day(2025, 11, 15), To: day(2026, 2, 1)})
	if len(months) != 3 || months[2].T != "2026-01-01T00:00" {
		t.Fatalf("months: %v", months)
	}
}

// Content groups: a site read by section. The rules are applied when the
// report runs, so changing them re-reads history rather than only changing
// what comes next.
func TestContentGroups(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		p := sep10
		// The golden site's paths: /, /pricing (twice), /blog, /docs.
		p.Groups = []Group{
			{Name: "Pricing", Path: "/pricing"},
			{Name: "Writing", Path: "/blog*"},
			{Name: "Home", Path: "/"},
		}
		res, err := q.Report(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		views := map[string]int64{}
		vis := map[string]int64{}
		for _, r := range res.Dims["group"] {
			views[r.Value], vis[r.Value] = r.Pageviews, r.Visitors
		}
		eq(t, "Home pageviews (A 10:00, C 12:01, A 15:00)", views["Home"], int64(3))
		eq(t, "Home visitors (A and C)", vis["Home"], int64(2))
		eq(t, "Pricing pageviews (A 10:02, C 12:00)", views["Pricing"], int64(2))
		eq(t, "Writing pageviews (B 11:00 /blog)", views["Writing"], int64(1))
		// /docs is on Sep 11 and belongs to no group either way.
		if _, ok := views["Docs"]; ok {
			t.Error("a group nobody defined appeared")
		}

		// First match wins, so the order is the rule.
		p.Groups = []Group{{Name: "Everything", Path: "/*"}, {Name: "Pricing", Path: "/pricing"}}
		res, _ = q.Report(context.Background(), p)
		got := map[string]int64{}
		for _, r := range res.Dims["group"] {
			got[r.Value] = r.Pageviews
		}
		eq(t, "one group swallowed the site", got["Everything"], int64(6))
		eq(t, "the later rule never ran", got["Pricing"], int64(0))

		// Filtering by a section means the visits that read anything in it.
		p.Groups = []Group{{Name: "Writing", Path: "/blog*"}}
		p.Filters = []Filter{{Dim: "group", Value: "Writing"}}
		only, err := q.Report(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "visitors who read the blog", only.KPIs.Visitors, int64(1))
		eq(t, "the AI visit is the one that did", rowsOf(only.Dims["channel"])["AI"], int64(1))

		// A site with no groups pays for nothing and shows nothing.
		p.Groups, p.Filters = nil, nil
		plain, _ := q.Report(context.Background(), p)
		if plain.Dims["group"] != nil {
			t.Errorf("a site with no groups got a group breakdown: %v", plain.Dims["group"])
		}
	})
}
