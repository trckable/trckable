package writer

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func heatRow(site, day, path string, kind, el string, n uint64) HeatRow {
	return HeatRow{Site: site, Day: day, Path: path, Width: 1280, Kind: kind, El: el, CX: 1, CY: 2, N: n, X: n * 10, Y: n * 20, W: n * 30, H: n * 40}
}

// The same counter twice is one row with the sums added.
func TestHeatCountsUpsert(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w, stop := e.start(t, Options{})
	defer stop()
	ctx := context.Background()
	if err := w.AddHeat(ctx, []HeatRow{heatRow("s1", "2026-09-10", "/", "c", "a", 3), heatRow("s1", "2026-09-10", "/", "d", "a", 1)}); err != nil {
		t.Fatal(err)
	}
	if err := w.AddHeat(ctx, []HeatRow{heatRow("s1", "2026-09-10", "/", "c", "a", 4), heatRow("s1", "2026-09-11", "/", "c", "a", 1)}); err != nil {
		t.Fatal(err)
	}
	if n := e.count(t, `SELECT n FROM heat_daily WHERE day = DATE '2026-09-10' AND kind = 'c'`); n != 7 {
		t.Fatalf("clicks on the 10th: want 7, got %d", n)
	}
	if n := e.count(t, `SELECT sx FROM heat_daily WHERE day = DATE '2026-09-10' AND kind = 'c'`); n != 70 {
		t.Fatalf("summed x: want 70, got %d", n)
	}
	if n := e.count(t, `SELECT count(*) FROM heat_daily`); n != 3 {
		t.Fatalf("rows: want 3, got %d", n)
	}
}

// A restart keeps what was written, and counts on from it.
func TestHeatCountsSurviveARestart(t *testing.T) {
	dir := t.TempDir()
	e := newEnv(t, dir)
	w, stop := e.start(t, Options{})
	if err := w.AddHeat(context.Background(), []HeatRow{heatRow("s1", "2026-09-10", "/", "c", "a", 5)}); err != nil {
		t.Fatal(err)
	}
	stop()
	e.close()

	e = newEnv(t, dir)
	defer e.close()
	w, stop = e.start(t, Options{})
	defer stop()
	if n := e.count(t, `SELECT n FROM heat_daily`); n != 5 {
		t.Fatalf("after the restart: want 5, got %d", n)
	}
	if err := w.AddHeat(context.Background(), []HeatRow{heatRow("s1", "2026-09-10", "/", "c", "a", 2)}); err != nil {
		t.Fatal(err)
	}
	if n := e.count(t, `SELECT n FROM heat_daily`); n != 7 {
		t.Fatalf("counting on: want 7, got %d", n)
	}
}

// A site that is gone keeps no counts, and deleting a site takes them.
func TestHeatCountsFollowTheSite(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w, stop := e.start(t, Options{Sites: func(_ context.Context, ids []string) (map[string]bool, error) {
		out := map[string]bool{}
		for _, id := range ids {
			out[id] = id == "s1"
		}
		return out, nil
	}})
	defer stop()
	ctx := context.Background()
	if err := w.AddHeat(ctx, []HeatRow{heatRow("s1", "2026-09-10", "/", "c", "a", 1), heatRow("gone", "2026-09-10", "/", "c", "a", 9)}); err != nil {
		t.Fatal(err)
	}
	if n := e.count(t, `SELECT count(*) FROM heat_daily WHERE site_id = 'gone'`); n != 0 {
		t.Fatalf("a deleted site's counts were written: %d", n)
	}
	if _, _, err := w.PurgeSite(ctx, "s1"); err != nil {
		t.Fatal(err)
	}
	if n := e.count(t, `SELECT count(*) FROM heat_daily`); n != 0 {
		t.Fatalf("after the purge: %d rows", n)
	}
}

// Pruning old days takes their heat counts with them.
func TestHeatCountsArePruned(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w, stop := e.start(t, Options{})
	defer stop()
	ctx := context.Background()
	if err := w.AddHeat(ctx, []HeatRow{heatRow("s1", "2026-09-01", "/", "c", "a", 1), heatRow("s1", "2026-09-20", "/", "c", "a", 1)}); err != nil {
		t.Fatal(err)
	}
	cut := time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC).UnixMilli()
	if _, err := w.PruneBefore(ctx, "s1", cut); err != nil {
		t.Fatal(err)
	}
	if n := e.count(t, `SELECT count(*) FROM heat_daily`); n != 1 {
		t.Fatalf("after pruning: %d rows, want 1", n)
	}
}

// One site and day keep a bounded number of counters: the busiest stay, and a
// page's own view count always does.
func TestHeatDayIsBounded(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w, stop := e.start(t, Options{})
	defer stop()
	ctx := context.Background()
	rows := []HeatRow{heatRow("s1", "2026-09-10", "/", "v", "", 1)}
	for i := 0; i < HeatDayKeys+300; i++ {
		rows = append(rows, heatRow("s1", "2026-09-10", fmt.Sprintf("/p/%d", i), "c", "a", uint64(1+i%7)))
	}
	rows = append(rows, heatRow("s1", "2026-09-11", "/", "c", "a", 1)) // another day is its own count
	for len(rows) > 0 {                                                // the server hands them over in chunks
		n := min(2000, len(rows))
		if err := w.AddHeat(ctx, rows[:n]); err != nil {
			t.Fatal(err)
		}
		rows = rows[n:]
	}
	if n := e.count(t, `SELECT count(*) FROM heat_daily WHERE day = DATE '2026-09-10'`); n != HeatDayKeys {
		t.Fatalf("rows on the 10th: %d, want %d", n, HeatDayKeys)
	}
	if n := e.count(t, `SELECT count(*) FROM heat_daily WHERE kind = 'v'`); n != 1 {
		t.Fatalf("the page's view count was dropped")
	}
	if n := e.count(t, `SELECT count(*) FROM heat_daily WHERE day = DATE '2026-09-11'`); n != 1 {
		t.Fatalf("another day lost its row")
	}
}
