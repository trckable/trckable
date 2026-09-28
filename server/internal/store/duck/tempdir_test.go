package duck

import (
	"context"
	"path/filepath"
	"testing"
)

// A query that spills to the temp directory (a backup does, 10 minutes after
// boot) used to break every connection opened after it: each one set
// temp_directory again, and DuckDB refuses that once the directory is in use.
// The reports then failed until a restart.
func TestConnectionsAfterSpillStillOpen(t *testing.T) {
	ctx := context.Background()
	s, err := Open(ctx, filepath.Join(t.TempDir(), "t.duckdb"), Options{Threads: 1, MemoryLimit: "40MB"})
	if err != nil {
		t.Fatal(err)
	}
	defer s.DB.Close()

	// The settings still reach the database, now given once as it opens.
	var threads, tmp string
	if err := s.DB.QueryRowContext(ctx, `SELECT current_setting('threads')::VARCHAR, current_setting('temp_directory')`).Scan(&threads, &tmp); err != nil {
		t.Fatal(err)
	}
	if threads != "1" || filepath.Base(tmp) != "duckdb_tmp" {
		t.Errorf("threads = %s, temp_directory = %s", threads, tmp)
	}

	// More than 40 MB to sort: it has to spill.
	if _, err := s.DB.ExecContext(ctx, `CREATE TABLE big AS SELECT range AS i, md5(range::VARCHAR) AS h FROM range(3000000)`); err != nil {
		t.Fatal(err)
	}
	var n int64
	if err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM (SELECT h FROM big ORDER BY h)`).Scan(&n); err != nil {
		t.Fatalf("the spilling query: %v", err)
	}

	// Force fresh connections, as the pool does over a day.
	s.DB.SetMaxIdleConns(0)
	for i := 0; i < 3; i++ {
		c, err := s.DB.Conn(ctx)
		if err != nil {
			t.Fatalf("a new connection after the spill: %v", err)
		}
		if err := c.QueryRowContext(ctx, `SELECT 1`).Scan(&n); err != nil {
			t.Fatalf("a query on it: %v", err)
		}
		c.Close()
	}
}
