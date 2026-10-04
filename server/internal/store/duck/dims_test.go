package duck

import (
	"context"
	"path/filepath"
	"testing"
)

// A store written before browser versions and screens existed upgrades in
// place: its rows stay, the new columns are empty on them, and a row written
// afterwards carries both.
func TestBrowserVersionAndScreenMigrateAnExistingStore(t *testing.T) {
	ctx := context.Background()
	s, err := OpenUnmigrated(filepath.Join(t.TempDir(), "a.duckdb"), Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := s.MigrateTo(ctx, 5); err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, path, browser, screen) VALUES (1, 's1', TIMESTAMP '2026-09-10 09:00:00', 1, 5, 6, '/', 'Chrome', 1280)`,
		`INSERT INTO sessions (site_id, session_id, visitor_id, start, last, browser, pvs, goals, engaged_ms, dur) VALUES ('s1', 6, 5, TIMESTAMP '2026-09-10 09:00:00', TIMESTAMP '2026-09-10 09:00:00', 'Chrome', 1, 0, 0, 0)`,
	} {
		if _, err := s.DB.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if have, want, _ := s.Schema(ctx); have != want || have != 6 {
		t.Fatalf("schema %d of %d, want 6", have, want)
	}
	var evV, seV *string
	var seS *int
	var browser string
	if err := s.DB.QueryRowContext(ctx, `SELECT browser, browser_version FROM events`).Scan(&browser, &evV); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.QueryRowContext(ctx, `SELECT browser_version, screen FROM sessions`).Scan(&seV, &seS); err != nil {
		t.Fatal(err)
	}
	if browser != "Chrome" || evV != nil || seV != nil || seS != nil {
		t.Fatalf("old rows: browser %q, versions %v %v, screen %v; want the old row kept and the new columns empty", browser, evV, seV, seS)
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO sessions (site_id, session_id, visitor_id, start, last, pvs, goals, engaged_ms, dur, browser_version, screen) VALUES ('s1', 7, 5, TIMESTAMP '2026-09-11 09:00:00', TIMESTAMP '2026-09-11 09:00:00', 1, 0, 0, 0, 'Chrome 130', 390)`); err != nil {
		t.Fatal(err)
	}
}
