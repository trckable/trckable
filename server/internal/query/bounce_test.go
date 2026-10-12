package query

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/duck"
)

type bsess struct {
	day        string // 2026-09-xx
	page, ch   string
	device     string
	n, bounced int
}

// bounceSite seeds sessions straight into the store: n sessions per row, the
// first `bounced` of them with one page, the rest with two.
func bounceSite(t *testing.T, rows []bsess, lcp map[string]int) Q {
	t.Helper()
	ctx := context.Background()
	st, err := duck.Open(ctx, filepath.Join(t.TempDir(), "b.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	id := 0
	for _, r := range rows {
		for i := 0; i < r.n; i++ {
			id++
			pvs := 2
			if i < r.bounced {
				pvs = 1
			}
			if _, err := st.DB.ExecContext(ctx, `INSERT INTO sessions (site_id, session_id, visitor_id, start, last, channel, entry_page, device, pvs, goals, engaged_ms, dur)
				VALUES ('s1', ?, ?, CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP), ?, ?, ?, ?, 0, 0, 60)`, id, id, r.day+" 10:00:00", r.day+" 10:01:00", r.ch, r.page, r.device, pvs); err != nil {
				t.Fatal(err)
			}
		}
	}
	for page, ms := range lcp {
		for i := 0; i < 5; i++ {
			id++
			if _, err := st.DB.ExecContext(ctx, `INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, pageview_id, path)
				VALUES (?, 's1', TIMESTAMP '2026-09-20 10:00:00', 1, ?, ?, ?, ?)`, id*10+1, id, id, id, page); err != nil {
				t.Fatal(err)
			}
			if _, err := st.DB.ExecContext(ctx, `INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, pageview_id, lcp_ms)
				VALUES (?, 's1', TIMESTAMP '2026-09-20 10:00:00', 3, ?, ?, ?, ?)`, id*10+3, id, id, id, ms); err != nil {
				t.Fatal(err)
			}
		}
	}
	return Q{DB: st.DB}
}

// the period is Sep 15-21; usual is the four weeks before (Aug 18 - Sep 14).
var bouncePeriod = Params{Site: "s1", TZ: "UTC", From: time.Date(2026, 9, 15, 0, 0, 0, 0, time.UTC), To: time.Date(2026, 9, 22, 0, 0, 0, 0, time.UTC)}

func usualDays() []bsess {
	return []bsess{
		{"2026-09-01", "/", "Search", "Desktop", 100, 50},
		{"2026-09-02", "/pricing", "Direct", "Mobile", 100, 50},
		{"2026-09-03", "/blog", "Search", "Mobile", 100, 50},
	}
}

func TestBounceGuideHigh(t *testing.T) {
	rows := append(usualDays(),
		bsess{"2026-09-16", "/", "Search", "Desktop", 60, 30},
		bsess{"2026-09-18", "/pricing", "Direct", "Desktop", 60, 30},
		bsess{"2026-09-20", "/promo", "Social", "Mobile", 80, 76}, // the cause: page and source on a device
		bsess{"2026-09-20", "/tiny", "Social", "Mobile", 5, 5},    // too small to name
	)
	q := bounceSite(t, rows, map[string]int{"/promo": 4100, "/": 900})
	g, err := q.BounceGuide(context.Background(), bouncePeriod, true)
	if err != nil {
		t.Fatal(err)
	}
	if g.Direction != "high" {
		t.Fatalf("direction %s, rate %v usual %v", g.Direction, g.Rate, g.Usual)
	}
	eq(t, "usual", g.Usual, 0.5)
	eq(t, "since", g.Since, "2026-09-20")
	// The daily series runs over the usual weeks and the period, oldest first.
	var seen []string
	for _, d := range g.Days {
		seen = append(seen, d.Day)
	}
	if fmt.Sprint(seen) != "[2026-09-01 2026-09-02 2026-09-03 2026-09-16 2026-09-18 2026-09-20]" {
		t.Fatalf("days %v", seen)
	}
	eq(t, "usual day", g.Days[0].Rate, 0.5)
	eq(t, "promo day", g.Days[5].Rate, float64(81)/85)
	if g.Days[5].Sessions != 85 {
		t.Fatalf("sessions %d", g.Days[5].Sessions)
	}
	kinds := map[string]string{}
	for _, c := range g.Causes {
		kinds[c.Kind] = c.Label
	}
	if len(g.Causes) != 3 || kinds["page"] != "/promo" || kinds["source_device"] != "Social · Mobile" || kinds["speed"] != "/promo" {
		t.Fatalf("causes %+v", g.Causes)
	}
	for _, c := range g.Causes {
		if c.Kind == "speed" && c.LCP != 4100 {
			t.Fatalf("lcp %d", c.LCP)
		}
		if c.Kind == "page" && c.Was != nil {
			t.Fatalf("a page with no history has a was: %v", *c.Was)
		}
	}
	// Without the vitals module there is no speed cause.
	g, err = q.BounceGuide(context.Background(), bouncePeriod, false)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range g.Causes {
		if c.Kind == "speed" {
			t.Fatal("speed cause without vitals")
		}
	}
}

func TestBounceGuideLow(t *testing.T) {
	rows := append(usualDays(), bsess{"2026-09-17", "/", "Search", "Desktop", 200, 40})
	g, err := bounceSite(t, rows, nil).BounceGuide(context.Background(), bouncePeriod, true)
	if err != nil {
		t.Fatal(err)
	}
	if g.Direction != "low" || len(g.Causes) != 0 || g.Since != "2026-09-17" {
		t.Fatalf("%+v", g)
	}
}

func TestBounceGuideNormal(t *testing.T) {
	rows := append(usualDays(), bsess{"2026-09-17", "/", "Search", "Desktop", 200, 105})
	g, err := bounceSite(t, rows, nil).BounceGuide(context.Background(), bouncePeriod, true)
	if err != nil {
		t.Fatal(err)
	}
	if g.Direction != "normal" || len(g.Causes) != 0 || g.Since != "" || len(g.Days) != 0 {
		t.Fatalf("%+v", g)
	}
}

func TestBounceGuideSmallSite(t *testing.T) {
	rows := append(usualDays(), bsess{"2026-09-17", "/x", "Search", "Desktop", 40, 40})
	g, err := bounceSite(t, rows, nil).BounceGuide(context.Background(), bouncePeriod, true)
	if err != nil {
		t.Fatal(err)
	}
	if g.Direction != "normal" || len(g.Causes) != 0 {
		t.Fatalf("a period under 100 visits is never judged: %+v", g)
	}
}
