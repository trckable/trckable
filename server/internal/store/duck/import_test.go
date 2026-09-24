package duck

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A store exported the way backups export it comes back row for row, and the
// seed watermark row is replaced rather than duplicated.
func TestImportExport(t *testing.T) {
	ctx := context.Background()
	src, err := Open(ctx, filepath.Join(t.TempDir(), "a.duckdb"), Options{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := src.DB.ExecContext(ctx, `
		INSERT INTO events (seq, site_id, kind, ts, event_id, visitor_id, session_id, path)
		SELECT i + 1, 'tkb_1', 1, TIMESTAMP '2026-09-01' + INTERVAL (i) MINUTE, i, i % 7, i % 11, '/p' || (i % 5)
		FROM range(1000) t(i);
		UPDATE ingest_state SET hwm = 1234`); err != nil {
		t.Fatal(err)
	}
	export := filepath.Join(t.TempDir(), "analytics")
	if _, err := src.DB.ExecContext(ctx, fmt.Sprintf(`EXPORT DATABASE '%s' (FORMAT PARQUET)`, export)); err != nil {
		t.Fatal(err)
	}
	src.Close()
	files, _ := os.ReadDir(export)
	var names []string
	for _, f := range files {
		names = append(names, f.Name())
	}
	t.Logf("export: %s", strings.Join(names, " "))

	dst, err := Open(ctx, filepath.Join(t.TempDir(), "b.duckdb"), Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer dst.Close()
	if _, err := dst.Import(ctx, export); err != nil {
		t.Fatal(err)
	}
	var events, states int
	var hwm uint64
	dst.DB.QueryRowContext(ctx, `SELECT count(*) FROM events`).Scan(&events)
	dst.DB.QueryRowContext(ctx, `SELECT count(*), max(hwm) FROM ingest_state`).Scan(&states, &hwm)
	if events != 1000 || states != 1 || hwm != 1234 {
		t.Fatalf("events %d, watermark rows %d at %d", events, states, hwm)
	}

	// A backup from a newer schema is refused.
	os.WriteFile(filepath.Join(export, "load.sql"), []byte("DROP TABLE events;"), 0o600)
	if _, err := dst.DB.ExecContext(ctx, fmt.Sprintf(`COPY (SELECT 999 AS version) TO '%s' (FORMAT PARQUET)`, filepath.Join(export, "schema_version.parquet"))); err != nil {
		t.Fatal(err)
	}
	if _, err := dst.Import(ctx, export); err == nil || !strings.Contains(err.Error(), "newer") {
		t.Fatalf("newer schema: %v", err)
	}
	dst.DB.QueryRowContext(ctx, `SELECT count(*) FROM events`).Scan(&events)
	if events != 1000 {
		t.Fatal("a refused import changed the store")
	}
}
