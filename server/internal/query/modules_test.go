package query

import (
	"context"
	"testing"
	"time"
)

// The golden site again (Sep 10 2026 is a Thursday, so weekday index 3):
//
//	A 10:00 / → 10:02 /pricing → 10:03 signup{plan:pro, seats:3}
//	B 11:00 /blog · C 12:00 /pricing → 12:01 / · A 15:00 / · D Sep 11 02:00 /docs
func TestHeatmap(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		h, err := q.Heatmap(context.Background(), sep10)
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "total visits", h.Total, int64(4))
		eq(t, "peak", h.Peak, int64(1))
		for _, c := range []struct {
			d, hour int
			want    int64
		}{{3, 10, 1}, {3, 11, 1}, {3, 12, 1}, {3, 15, 1}, {3, 13, 0}, {0, 10, 0}} {
			eq(t, "cell", h.Cells[c.d][c.hour], c.want)
		}
	})
}

func TestFunnel(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		ctx := context.Background()
		steps := []Step{{Kind: "page", Value: "/"}, {Kind: "goal", Value: "signup"}}
		f, err := q.Funnel(ctx, sep10, steps)
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "steps", len(f), 2)
		eq(t, "saw /", f[0].Visitors, int64(2)) // A and C (A's second visit is the same visitor)
		eq(t, "then signed up", f[1].Visitors, int64(1))
		eq(t, "rate", f[1].Rate, 0.5)
		eq(t, "dropped after /", f[0].Dropped, int64(1))
		eq(t, "median seconds between steps", f[1].MedianS, 180.0) // 10:00 → 10:03

		// Order matters: signup never comes before the pageview that follows it.
		back, err := q.Funnel(ctx, sep10, []Step{{Kind: "goal", Value: "signup"}, {Kind: "page", Value: "/blog"}})
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "signup → /blog", back[1].Visitors, int64(0))

		// Filters apply to the funnel too.
		p := sep10
		p.Filters = []Filter{{Dim: "channel", Value: "AI"}}
		ai, err := q.Funnel(ctx, p, steps)
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "AI visitors who saw /", ai[0].Visitors, int64(0))

		if _, err := q.Funnel(ctx, sep10, steps[:1]); err == nil {
			t.Error("a one-step funnel was accepted")
		}
	})
}

func TestGoalProps(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		p := sep10
		p.Limit = 10
		rows, err := q.GoalProps(context.Background(), p, "signup")
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "property rows", len(rows), 2)
		eq(t, "first key", rows[0].Key, "plan")
		eq(t, "first value", rows[0].Value, "pro")
		eq(t, "visitors", rows[0].Visitors, int64(1))
		eq(t, "second key", rows[1].Key, "seats")
		if none, _ := q.GoalProps(context.Background(), p, "nope"); len(none) != 0 {
			t.Errorf("unknown goal returned %d rows", len(none))
		}
	})
}

func TestJourney(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		ctx := context.Background()
		upTo := time.Date(2026, 9, 12, 0, 0, 0, 0, time.UTC)
		j, err := q.Journey(ctx, "s1", 1, upTo)
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "visits", len(j.Visits), 2)
		eq(t, "newest visit first", j.Visits[0].Channel, "Direct") // 15:00
		eq(t, "older visit", j.Visits[1].Channel, "Search")
		eq(t, "referrer", j.Visits[1].Referrer, "google.com")
		eq(t, "pageviews in the first visit", j.Visits[1].Pageviews, int64(2))
		eq(t, "engaged seconds", j.Visits[1].EngagedS, 90.0) // 60 s + 30 s
		eq(t, "events", len(j.Visits[1].Events), 3)
		eq(t, "first event", j.Visits[1].Events[0].Path, "/")
		eq(t, "goal event", j.Visits[1].Events[2].Goal, "signup")
		if j.Visits[1].Events[2].Props == "" {
			t.Error("goal props missing from the journey")
		}
		if j.FirstSeen == nil || !j.FirstSeen.Equal(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)) {
			t.Errorf("first seen = %v", j.FirstSeen)
		}
		// A visitor with no history is empty, not an error.
		none, err := q.Journey(ctx, "s1", 999, upTo)
		if err != nil || len(none.Visits) != 0 {
			t.Fatalf("unknown visitor: %+v %v", none, err)
		}
	})
}

// Crawler hits are counted by category, by crawler and by page — and never
// mixed with the visits people make.
func TestCrawlersSplitByKind(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		rep, err := q.Crawlers(context.Background(), sep10)
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "crawler hits", rep.Total, int64(4))
		eq(t, "training hits", rep.Kinds["train"], int64(2))
		eq(t, "answer hits", rep.Kinds["answer"], int64(1))
		eq(t, "indexing hits", rep.Kinds["index"], int64(1))
		eq(t, "errors", rep.Errors, int64(1))
		eq(t, "crawlers", len(rep.Series), 3)
		eq(t, "busiest crawler", rep.Series[0].Name, "OpenAI")
		eq(t, "busiest crawler hits", rep.Series[0].Total, int64(2))
		if len(rep.Pages) == 0 || rep.Pages[0].Value != "/" {
			t.Fatalf("pages: %+v", rep.Pages)
		}
	})
}

// Core Web Vitals: the 75th percentile, and the pages worth fixing first.
func TestWebVitals(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		p := sep10
		p.Limit = 10
		v, err := q.VitalsFor(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		// The golden site predates the module: no measurements, and the card
		// says so rather than reporting a zero anyone could mistake for fast.
		eq(t, "samples", v.Samples, int64(0))
		if v.LCP != nil || v.CLS != nil || v.INP != nil {
			t.Fatalf("a site with no measurements reported scores: %+v", v)
		}
	})
}

func TestScrollDepth(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		ctx := context.Background()
		p := sep10
		p.Limit = 10
		s, err := q.ScrollFor(ctx, p)
		if err != nil {
			t.Fatal(err)
		}
		// Two page views sent pings: A's / reached 80% (the larger of 40 and
		// 80) and A's /pricing 30%. Page views with no ping have no depth.
		eq(t, "samples", s.Samples, int64(2))
		eq(t, "avg", s.Avg, 55.0)
		eq(t, "reached 25", s.Reached[0], 1.0)
		eq(t, "reached 50", s.Reached[1], 0.5)
		eq(t, "reached 75", s.Reached[2], 0.5)
		eq(t, "reached the end", s.Reached[3], 0.0)
		if len(s.Pages) != 2 || s.Pages[0].Path != "/" || s.Pages[0].Avg != 80 || s.Pages[0].Read != 1 || s.Pages[1].Path != "/pricing" || s.Pages[1].Read != 0 {
			t.Fatalf("pages = %+v", s.Pages)
		}

		// Filters narrow the visits, as everywhere else.
		p.Filters = []Filter{{Dim: "channel", Value: "Search"}}
		if s, _ = q.ScrollFor(ctx, p); s.Samples != 2 {
			t.Fatalf("A arrived from Search: %d samples", s.Samples)
		}
		p.Filters = []Filter{{Dim: "country", Value: "US"}}
		if s, _ = q.ScrollFor(ctx, p); s.Samples != 0 || s.Pages != nil {
			t.Fatalf("no US visit sent a ping: %+v", s)
		}
	})
}

func TestPageGoals(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		ctx := context.Background()
		p := sep10
		p.PageGoals = []Group{{Name: "Saw pricing", Path: "/pricing"}, {Name: "Read anything", Path: "/*"}, {Name: "Broken", Path: "no-slash"}}
		r, err := q.Report(ctx, p)
		if err != nil {
			t.Fatal(err)
		}
		// Sep 10: A read / and /pricing, B /blog, C /pricing and /, A came back to /.
		got := map[string][2]int64{}
		for _, g := range r.Goals {
			got[g.Value] = [2]int64{g.Visitors, g.Pageviews}
		}
		eq(t, "saw pricing", got["Saw pricing"], [2]int64{2, 2}) // A and C, one visit each
		eq(t, "read anything", got["Read anything"], [2]int64{3, 4})
		eq(t, "event goal", got["signup"][0], int64(1))
		if _, ok := got["Broken"]; ok {
			t.Fatal("a rule that is not a path became a goal")
		}
		if r.Goals[0].Value != "Read anything" {
			t.Fatalf("goals are not ranked by visitors: %+v", r.Goals)
		}

		// A page goal filters like any other goal: the visits that reached it.
		p.Filters = []Filter{{Dim: "goal", Value: "Saw pricing"}}
		if r, err = q.Report(ctx, p); err != nil {
			t.Fatal(err)
		}
		eq(t, "visitors who saw pricing", r.KPIs.Visitors, int64(2))
		p.Filters = []Filter{{Dim: "goal", Value: "signup"}}
		if r, _ = q.Report(ctx, p); r.KPIs.Visitors != 1 {
			t.Fatalf("event goals still filter: %d", r.KPIs.Visitors)
		}
	})
}

func TestSiteSummary(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		p := sep10
		p.Filters = []Filter{{Dim: "channel", Value: "AI"}} // ignored: a summary is the whole site
		s, err := q.SiteSummary(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		// Sep 10: A (twice), B and C; six pageviews; B and A's second visit bounced.
		eq(t, "visitors", s.Visitors, int64(3))
		eq(t, "pageviews", s.Pageviews, int64(6))
		eq(t, "bounce", s.Bounce, 0.5)
		if len(s.Series) != 1 || s.Series[0] != 3 {
			t.Fatalf("series = %v", s.Series)
		}
		if s.Revenue != nil {
			t.Fatal("revenue without payments connected")
		}
	})
}
