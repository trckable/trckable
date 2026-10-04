package query

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/duck"
)

func heatRig(t *testing.T) Q {
	t.Helper()
	st, err := duck.Open(context.Background(), filepath.Join(t.TempDir(), "h.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	for _, q := range []string{
		// kind, el, cx, cy, n, sums of x, y, w, h; the view rows carry the window and page height
		`INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-10', '/pricing', 1280, 'v', '', 0, 0, 4, 0, 0, 5760, 20800)`,
		`INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-11', '/pricing', 1280, 'v', '', 0, 0, 6, 0, 0, 8640, 31200)`,
		`INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-10', '/pricing', 390, 'v', '', 0, 0, 3, 0, 0, 1170, 12000)`,
		`INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-10', '/pricing', 1280, 'c', 'a.buy', 2, 5, 6, 600, 300, 600, 240)`,
		`INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-11', '/pricing', 1280, 'c', 'a.buy', 2, 5, 4, 400, 200, 400, 160)`,
		`INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-10', '/pricing', 1280, 'c', 'a.buy', 7, 1, 2, 200, 100, 200, 80)`,
		`INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-10', '/pricing', 1280, 'c', 'h1', 0, 0, 1, 50, 80, 400, 60)`,
		`INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-10', '/pricing', 1280, 'd', 'div.card', 0, 0, 5, 500, 900, 1500, 400)`,
		`INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-10', '/pricing', 1280, 'r', 'a.buy', 2, 5, 2, 200, 100, 200, 80)`,
		`INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-10', '/pricing', 1280, 'fr', 'signup>email', 0, 0, 10, 0, 0, 0, 0)`,
		`INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-10', '/pricing', 1280, 'fr', 'signup>plan', 0, 0, 6, 0, 0, 0, 0)`,
		`INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-10', '/pricing', 1280, 'fd', 'signup>plan', 0, 0, 4, 0, 0, 0, 0)`,
		`INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-12', '/pricing', 1280, 'c', 'a.buy', 2, 5, 99, 0, 0, 0, 0)`, // the day after
		`INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-10', '/blog', 1280, 'c', 'a.buy', 2, 5, 99, 0, 0, 0, 0)`,    // another page
		`INSERT INTO heat_daily VALUES ('s2', DATE '2026-09-10', '/pricing', 1280, 'c', 'a.buy', 2, 5, 99, 0, 0, 0, 0)`, // another site
	} {
		if _, err := st.DB.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	// Four desktop page views of /pricing: two read to 100%, one to 40%, one only began; one phone view to 20%.
	ts := time.Date(2026, 9, 10, 9, 0, 0, 0, time.UTC)
	view := func(id, screen int, depth ...int) {
		stmts := []string{fmt.Sprintf(`INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, pageview_id, path, screen) VALUES (%d, 's1', TIMESTAMP '%s', 1, %d, %d, %d, '/pricing', %d)`,
			id*10, ts.Format("2006-01-02 15:04:05"), id, id, id, screen)}
		for i, d := range depth {
			stmts = append(stmts, fmt.Sprintf(`INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, pageview_id, path, scroll_pct) VALUES (%d, 's1', TIMESTAMP '%s', 3, %d, %d, %d, '/pricing', %d)`,
				id*10+i+1, ts.Add(time.Minute).Format("2006-01-02 15:04:05"), id, id, id, d))
		}
		for _, s := range stmts {
			if _, err := st.DB.Exec(s); err != nil {
				t.Fatal(err)
			}
		}
	}
	view(1, 1440, 60, 100)
	view(2, 1920, 100)
	view(3, 1366, 40)
	view(4, 1280) // no ping: no depth
	view(5, 390, 20)
	return Q{DB: st.DB}
}

var heatDays = Params{Site: "s1", TZ: "UTC",
	From: time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC), To: time.Date(2026, 9, 12, 0, 0, 0, 0, time.UTC)}

func TestHeatReadsOnePageAtOneWidth(t *testing.T) {
	q := heatRig(t)
	h, err := q.HeatFor(context.Background(), heatDays, "/pricing", 1280)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "width", h.Width, 1280)
	eq(t, "views", h.Views, int64(10))
	eq(t, "window", h.Window, 1440) // (5760 + 8640) / 10
	eq(t, "height", h.Height, 5200) // (20800 + 31200) / 10
	eq(t, "widths", fmt.Sprint(h.Widths), "[{390 3} {768 0} {1280 10}]")

	// The same place of the same element, on two days, is one spot with the
	// average place and size of the element over the clicks.
	if len(h.Clicks) != 3 {
		t.Fatalf("click spots = %+v", h.Clicks)
	}
	buy := h.Clicks[0]
	eq(t, "busiest spot", buy.El+fmt.Sprint(buy.CX, buy.CY), "a.buy2 5")
	eq(t, "its clicks", buy.N, int64(10))
	eq(t, "average x", buy.X, 100) // (600 + 400) / 10
	eq(t, "average y", buy.Y, 50)
	eq(t, "average width", buy.Width, 100)
	eq(t, "average height", buy.Height, 40)
	if len(h.Dead) != 1 || h.Dead[0].El != "div.card" || h.Dead[0].N != 5 {
		t.Fatalf("dead = %+v", h.Dead)
	}
	if len(h.Rage) != 1 || h.Rage[0].N != 2 {
		t.Fatalf("rage = %+v", h.Rage)
	}
	// Elements: the busiest first, with their dead and rage clicks beside.
	eq(t, "elements", fmt.Sprint(h.Elements), "[{a.buy 12 0 2} {h1 1 0 0} {div.card 0 5 0}]")

	// Fields: reached and left, by name.
	eq(t, "fields", fmt.Sprint(h.Fields), "[{signup email 10 0} {signup plan 6 4}]")
}

func TestHeatScrollIsReadFromThePingsAlreadyThere(t *testing.T) {
	q := heatRig(t)
	h, err := q.HeatFor(context.Background(), heatDays, "/pricing", 1280)
	if err != nil {
		t.Fatal(err)
	}
	// Desktop: three views with a depth (100, 100, 40; the fourth sent no ping).
	eq(t, "scroll views", h.ScrollSample, int64(3))
	if len(h.Scroll) != 10 {
		t.Fatalf("scroll = %v", h.Scroll)
	}
	eq(t, "reached 10%", h.Scroll[0], 1.0)
	eq(t, "reached 40%", h.Scroll[3], 1.0)
	eq(t, "reached 50%", h.Scroll[4], 2.0/3)
	eq(t, "reached the end", h.Scroll[9], 2.0/3)

	// The phone sees only its own view.
	ph, err := q.HeatFor(context.Background(), heatDays, "/pricing", 390)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "phone scroll views", ph.ScrollSample, int64(1))
	eq(t, "phone reached 20%", ph.Scroll[1], 1.0)
	eq(t, "phone reached 30%", ph.Scroll[2], 0.0)
	eq(t, "phone has no clicks", len(ph.Clicks), 0)
}

func TestHeatPicksTheBusiestWidthWhenNoneIsAsked(t *testing.T) {
	q := heatRig(t)
	h, err := q.HeatFor(context.Background(), heatDays, "/pricing", 0)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "width", h.Width, 1280)
	h, err = q.HeatFor(context.Background(), heatDays, "/pricing", 123) // not a width we file under
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "an unknown width", h.Width, 1280)
}

func TestHeatForAPageNobodyClickedIsEmptyNotAnError(t *testing.T) {
	q := heatRig(t)
	h, err := q.HeatFor(context.Background(), heatDays, "/nothing", 0)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "views", h.Views, int64(0))
	if h.Clicks == nil || h.Dead == nil || h.Rage == nil || h.Elements == nil || h.Fields == nil || h.Scroll == nil {
		t.Fatalf("a list is null, not empty: %+v", h)
	}
	other := heatDays
	other.Site = "none"
	if h, err = q.HeatFor(context.Background(), other, "/pricing", 0); err != nil || h.Views != 0 || len(h.Clicks) != 0 {
		t.Fatalf("another site saw %+v (%v)", h, err)
	}
}

func TestHeatInTheSitesZone(t *testing.T) {
	q := heatRig(t)
	berlin, _ := time.LoadLocation("Europe/Berlin")
	one := time.Date(2026, 9, 10, 0, 0, 0, 0, berlin)
	p := Params{Site: "s1", TZ: "Europe/Berlin", From: one.UTC(), To: one.AddDate(0, 0, 1).UTC()}
	h, err := q.HeatFor(context.Background(), p, "/pricing", 1280)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "views on the 10th", h.Views, int64(4))
}

func TestHeatAskNamesTheBusiestPageOnceItIsBusyEnough(t *testing.T) {
	q := heatRig(t)
	ctx := context.Background()
	day := time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC)
	path, views, err := q.HeatAsk(ctx, "s1", day, day.AddDate(0, 0, 1), 3)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "page", path, "/pricing")
	eq(t, "views", views, int64(5))
	if path, _, err = q.HeatAsk(ctx, "s1", day, day.AddDate(0, 0, 1), 100); err != nil || path != "" {
		t.Fatalf("below the bar it still asked: %q (%v)", path, err)
	}
	if path, _, err = q.HeatAsk(ctx, "none", day, day.AddDate(0, 0, 1), 1); err != nil || path != "" {
		t.Fatalf("a site with no views asked: %q (%v)", path, err)
	}
}
