package duck

// These tests pin down the DuckDB behaviour that trckable's exactly-once
// ingest depends on (plan §5.2): rows appended with the Appender and the
// ingest_state high-water mark must commit or roll back together, including
// batches larger than DuckDB's internal 204,800-row auto-flush size.

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"path/filepath"
	"testing"

	duckdb "github.com/duckdb/duckdb-go/v2"
)

func openTestDB(t *testing.T) (*sql.DB, *duckdb.Connector) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "t.duckdb")
	connector, err := duckdb.NewConnector(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	db := sql.OpenDB(connector)
	t.Cleanup(func() { db.Close() })
	for _, q := range []string{
		`CREATE TABLE events (seq UBIGINT, v INTEGER)`,
		`CREATE TABLE ingest_state (id INTEGER, hwm UBIGINT)`,
		`INSERT INTO ingest_state VALUES (1, 0)`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	return db, connector
}

// appendBatch appends n rows and moves the HWM inside one transaction, then
// commits or rolls back.
func appendBatch(t *testing.T, db *sql.DB, n int, commit bool) {
	t.Helper()
	ctx := context.Background()
	conn, err := db.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, "BEGIN TRANSACTION"); err != nil {
		t.Fatal(err)
	}
	err = conn.Raw(func(dc any) error {
		app, err := duckdb.NewAppenderFromConn(dc.(driver.Conn), "", "events")
		if err != nil {
			return err
		}
		for i := 0; i < n; i++ {
			if err := app.AppendRow(uint64(i+1), int32(i)); err != nil {
				return err
			}
		}
		return app.Close() // flushes into the open transaction
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.ExecContext(ctx, "UPDATE ingest_state SET hwm = ? WHERE id = 1", uint64(n)); err != nil {
		t.Fatal(err)
	}
	end := "ROLLBACK"
	if commit {
		end = "COMMIT"
	}
	if _, err := conn.ExecContext(ctx, end); err != nil {
		t.Fatal(err)
	}
}

func counts(t *testing.T, db *sql.DB) (rows int64, hwm uint64) {
	t.Helper()
	if err := db.QueryRow(`SELECT count(*) FROM events`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT hwm FROM ingest_state WHERE id = 1`).Scan(&hwm); err != nil {
		t.Fatal(err)
	}
	return rows, hwm
}

func TestAppenderCommitsWithHWM(t *testing.T) {
	for _, n := range []int{1_000, 300_000} { // below and above the 204,800 auto-flush
		db, _ := openTestDB(t)
		appendBatch(t, db, n, true)
		rows, hwm := counts(t, db)
		if rows != int64(n) || hwm != uint64(n) {
			t.Fatalf("n=%d: got rows=%d hwm=%d", n, rows, hwm)
		}
	}
}

func TestAppenderRollsBackWithHWM(t *testing.T) {
	for _, n := range []int{1_000, 300_000} {
		db, _ := openTestDB(t)
		appendBatch(t, db, n, false)
		rows, hwm := counts(t, db)
		if rows != 0 || hwm != 0 {
			t.Fatalf("n=%d: rollback leaked rows=%d hwm=%d", n, rows, hwm)
		}
	}
}
