package duck

import (
	"context"
	"path/filepath"
	"testing"
)

// A store written before apps were told apart upgrades in place: its rows
// stay, the new column is empty on them.
func TestAppColumnMigratesAnExistingStore(t *testing.T) {
	ctx := context.Background()
	s, err := OpenUnmigrated(filepath.Join(t.TempDir(), "a.duckdb"), Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := s.MigrateTo(ctx, 13); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, path, device) VALUES (1, 's1', TIMESTAMP '2026-09-10 09:00:00', 1, 5, 6, '/', 'Mobile')`); err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	var device string
	var app *string
	if err := s.DB.QueryRowContext(ctx, `SELECT device, app FROM events`).Scan(&device, &app); err != nil {
		t.Fatal(err)
	}
	if device != "Mobile" || app != nil {
		t.Fatalf("old row: device %q app %v; want the row kept and the column empty", device, app)
	}
	if _, err := s.DB.ExecContext(ctx, `SELECT app FROM sessions`); err != nil {
		t.Fatal(err)
	}
	var fcp *int64
	if err := s.DB.QueryRowContext(ctx, `SELECT fcp_ms FROM events`).Scan(&fcp); err != nil {
		t.Fatal(err)
	}
	if fcp != nil {
		t.Fatalf("old row: fcp_ms %v; want the row kept and the column empty", *fcp)
	}
}
