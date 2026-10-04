package duck

import (
	"context"
	"path/filepath"
	"testing"
)

// A store from before the import table gets it on upgrade, empty, and the
// table is a counter store: a day, a dimension and a value is one row.
func TestImportedDailyIsAddedOnUpgrade(t *testing.T) {
	ctx := context.Background()
	s, err := OpenUnmigrated(filepath.Join(t.TempDir(), "d.duckdb"), Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := s.MigrateTo(ctx, 8); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.ExecContext(ctx, `SELECT * FROM imported_daily`); err == nil {
		t.Fatal("the table exists before its migration")
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO imported_daily VALUES ('s', DATE '2024-01-01', 'total', '', 1, 1, 1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO imported_daily VALUES ('s', DATE '2024-01-01', 'total', '', 1, 1, 1)`); err == nil {
		t.Error("the same day twice is two rows")
	}
}
