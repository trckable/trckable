package duck

import (
	"context"
	"path/filepath"
	"testing"
)

// A store from the release before the heat counters gains the table and keeps
// every row it had.
func TestHeatCountersMigrateAnExistingStore(t *testing.T) {
	ctx := context.Background()
	s, err := OpenUnmigrated(filepath.Join(t.TempDir(), "a.duckdb"), Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := s.MigrateTo(ctx, 7); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO bot_daily VALUES ('s1', DATE '2026-09-10', 'bot', 2)`); err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO heat_daily VALUES ('s1', DATE '2026-09-10', '/', 1280, 'c', 'a', 1, 2, 3, 4, 5, 6, 7)`); err != nil {
		t.Fatal(err)
	}
	var bots, clicks int64
	if err := s.DB.QueryRowContext(ctx, `SELECT sum(n) FROM bot_daily`).Scan(&bots); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.QueryRowContext(ctx, `SELECT sum(n) FROM heat_daily`).Scan(&clicks); err != nil {
		t.Fatal(err)
	}
	if bots != 2 || clicks != 3 {
		t.Fatalf("bots %d, heat %d; want 2, 3", bots, clicks)
	}
}
