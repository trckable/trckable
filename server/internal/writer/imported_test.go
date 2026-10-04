package writer

import (
	"context"
	"testing"
)

func TestReplaceImportedLeavesOneCopyWhateverTheRunCount(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w, stop := e.start(t, Options{})
	defer stop()
	ctx := context.Background()
	rows := []ImportedRow{
		{"2024-01-01", "total", "", 10, 8, 30}, {"2024-01-02", "total", "", 0, 0, 0},
		{"2024-01-01", "page", "/", 6, 5, 20}, {"2024-01-01", "page", "/", 1, 1, 1}, // listed twice: one row
	}
	for i := 0; i < 3; i++ {
		if err := w.ReplaceImported(ctx, "s1", "2024-01-01", "2024-01-31", rows); err != nil {
			t.Fatal(err)
		}
	}
	if n := e.count(t, `SELECT count(*) FROM imported_daily`); n != 3 {
		t.Errorf("%d rows after three runs, want 3", n)
	}
	if n := e.count(t, `SELECT sessions FROM imported_daily WHERE dim = 'page'`); n != 7 {
		t.Errorf("a page listed twice has %d sessions, want 7", n)
	}
	// A rerun with less leaves less: the range is replaced, not added to.
	if err := w.ReplaceImported(ctx, "s1", "2024-01-01", "2024-01-31", rows[:1]); err != nil {
		t.Fatal(err)
	}
	if n := e.count(t, `SELECT count(*) FROM imported_daily`); n != 1 {
		t.Errorf("%d rows after a smaller rerun, want 1", n)
	}
}

func TestReplaceImportedTouchesOnlyItsRangeAndSite(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w, stop := e.start(t, Options{})
	defer stop()
	ctx := context.Background()
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(w.ReplaceImported(ctx, "s1", "2024-01-01", "2024-01-31", []ImportedRow{{"2024-01-05", "total", "", 1, 1, 1}}))
	must(w.ReplaceImported(ctx, "s1", "2024-02-01", "2024-02-29", []ImportedRow{{"2024-02-05", "total", "", 2, 2, 2}}))
	must(w.ReplaceImported(ctx, "s2", "2024-01-01", "2024-01-31", []ImportedRow{{"2024-01-05", "total", "", 3, 3, 3}}))
	must(w.ReplaceImported(ctx, "s1", "2024-01-01", "2024-01-31", nil))
	if n := e.count(t, `SELECT count(*) FROM imported_daily WHERE site_id = 's1' AND day < DATE '2024-02-01'`); n != 0 {
		t.Errorf("the replaced range still has %d rows", n)
	}
	if n := e.count(t, `SELECT count(*) FROM imported_daily`); n != 2 {
		t.Errorf("%d rows, want February of s1 and January of s2", n)
	}
	if err := w.ReplaceImported(ctx, "s1", "2024-01-01", "2024-01-31", []ImportedRow{{"2024-03-01", "total", "", 1, 1, 1}}); err == nil {
		t.Error("a day outside the range was accepted")
	}
	// Deleting the site takes its imported days too.
	if _, _, err := w.PurgeSite(ctx, "s1"); err != nil {
		t.Fatal(err)
	}
	if n := e.count(t, `SELECT count(*) FROM imported_daily WHERE site_id = 's1'`); n != 0 {
		t.Errorf("a purged site keeps %d imported rows", n)
	}
}
