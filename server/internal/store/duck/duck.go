// Package duck owns trckable's analytics store (DuckDB).
//
// Rules:
//   - Exactly one writer, on a dedicated connection (see Writer()).
//   - Append-only event tables with no PK/UNIQUE constraints.
//   - Lightweight defaults: 2 threads, 256 MB memory cap, temp files on the data volume.
package duck

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	duckdb "github.com/duckdb/duckdb-go/v2"
)

// Options configure resource usage.
type Options struct {
	Threads     int    // default 2
	MemoryLimit string // default "256MB"
	// NoUpgrade refuses to migrate a store that already holds a schema: the
	// server upgrades before it opens the store for the writer, with a copy
	// kept first, and never lets this open do it without one.
	NoUpgrade bool
}

// ErrNeedsUpgrade is Open's answer with NoUpgrade set, for a store written by
// an older trckable.
var ErrNeedsUpgrade = errors.New("the analytics store is from an older trckable and was not upgraded (with a copy kept) before it was opened: restart trckabled")

// Store is the analytics database.
type Store struct {
	DB   *sql.DB // read pool
	path string
}

// Open opens (creating if needed) the DuckDB file at path and runs migrations.
func Open(ctx context.Context, path string, opts Options) (*Store, error) {
	s, err := OpenUnmigrated(path, opts)
	if err != nil {
		return nil, err
	}
	if opts.NoUpgrade {
		if have, want, err := s.Schema(ctx); err != nil || (have > 0 && have < want) {
			s.DB.Close()
			if err == nil {
				err = ErrNeedsUpgrade
			}
			return nil, err
		}
	}
	if err := s.Migrate(ctx); err != nil {
		s.DB.Close()
		return nil, err
	}
	return s, nil
}

// OpenUnmigrated opens the DuckDB file with the same settings and runs no
// migration, so an upgrade can copy the store before changing it.
func OpenUnmigrated(path string, opts Options) (*Store, error) {
	if opts.Threads <= 0 {
		opts.Threads = 2
	}
	if opts.MemoryLimit == "" {
		opts.MemoryLimit = "256MB"
	}
	tmp := filepath.Join(filepath.Dir(path), "duckdb_tmp")
	// Settings of the whole database go in once, as it opens. temp_directory
	// cannot be set again once a query has spilled there (a backup does), so
	// setting it on every new connection broke every connection after the
	// first spill, and with them the reports, until a restart.
	once := url.Values{}
	once.Set("threads", fmt.Sprint(opts.Threads))
	once.Set("memory_limit", opts.MemoryLimit)
	once.Set("temp_directory", tmp)
	settings := []string{
		// Appends are already time-ordered (zonemaps stay effective); not forcing
		// order preservation in query operators keeps memory low under the cap.
		"SET preserve_insertion_order = false",
		"SET TimeZone = 'UTC'",
		// DuckDB's allocator keeps up to 128 MB of freed memory before giving
		// any back; a server that idles most of the day should keep a few.
		"SET allocator_flush_threshold = '4MB'",
		"SET allocator_bulk_deallocation_flush_threshold = '16MB'",
	}
	// Applied on every new pooled connection.
	connInit := func(execer driver.ExecerContext) error {
		for _, q := range settings {
			if _, err := execer.ExecContext(context.Background(), q, nil); err != nil {
				return fmt.Errorf("duckdb %q: %w", q, err)
			}
		}
		return nil
	}
	connector, err := duckdb.NewConnector(path+"?"+once.Encode(), connInit)
	if err != nil {
		return nil, err
	}
	db := sql.OpenDB(connector)
	// sql.OpenDB connects lazily: connect now, so a file another process
	// holds is an error here and not at the first query.
	if err := db.PingContext(context.Background()); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{DB: db, path: path}, nil
}

// Migrations is how many migrations this binary knows.
func Migrations() int { return len(migrations) }

// Migrate applies the pending migrations.
func (s *Store) Migrate(ctx context.Context) error { return s.migrate(ctx) }

// Schema is the migration the store is at, and the one this binary brings it
// to. have is 0 for a store nothing has been written to.
func (s *Store) Schema(ctx context.Context) (have, want int, err error) {
	var n int
	if err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM information_schema.tables
		WHERE table_schema = 'main' AND table_name = 'schema_version'`).Scan(&n); err != nil || n == 0 {
		return 0, len(migrations), err
	}
	err = s.DB.QueryRowContext(ctx, `SELECT coalesce(max(version), 0) FROM schema_version`).Scan(&have)
	return have, len(migrations), err
}

// migrations are forward-only. Never edit a shipped migration; append a new one.
var migrations = []string{
	// 1: events + ingest bookkeeping
	`CREATE TABLE events (
		seq          UBIGINT   NOT NULL,
		site_id      VARCHAR   NOT NULL,
		ts           TIMESTAMP NOT NULL,
		kind         UTINYINT  NOT NULL,
		event_id     UBIGINT,
		visitor_id   UBIGINT   NOT NULL,
		first_seen   TIMESTAMP,
		session_id   UBIGINT   NOT NULL,
		pageview_id  UBIGINT,
		hostname     VARCHAR,
		path         VARCHAR,
		referrer_host VARCHAR,
		referrer_url VARCHAR,
		channel      VARCHAR,
		utm_source   VARCHAR,
		utm_medium   VARCHAR,
		utm_campaign VARCHAR,
		utm_term     VARCHAR,
		utm_content  VARCHAR,
		country      VARCHAR,
		region       VARCHAR,
		city         VARCHAR,
		browser      VARCHAR,
		os           VARCHAR,
		device       VARCHAR,
		language     VARCHAR,
		screen       USMALLINT,
		goal         VARCHAR,
		props        VARCHAR,
		engaged_ms   UINTEGER,
		scroll_pct   UTINYINT
	);
	CREATE TABLE ingest_state (id INTEGER NOT NULL, hwm UBIGINT NOT NULL);
	INSERT INTO ingest_state VALUES (1, 0);`,
	// 2: session rollups, written once per session by the writer in the same
	// transaction as its events. sessions_w: every session with any event
	// before it has been written (bounds crash recovery).
	`CREATE TABLE sessions (
		site_id    VARCHAR   NOT NULL,
		session_id UBIGINT   NOT NULL,
		visitor_id UBIGINT   NOT NULL,
		start      TIMESTAMP NOT NULL,
		last       TIMESTAMP NOT NULL,
		first_seen TIMESTAMP,
		channel VARCHAR, referrer VARCHAR, entry_page VARCHAR, exit_page VARCHAR,
		campaign VARCHAR, utm_source VARCHAR, utm_medium VARCHAR,
		country VARCHAR, region VARCHAR, city VARCHAR,
		device VARCHAR, browser VARCHAR, os VARCHAR, language VARCHAR,
		pvs UINTEGER NOT NULL, goals UINTEGER NOT NULL, engaged_ms UBIGINT NOT NULL, dur DOUBLE NOT NULL
	);
	ALTER TABLE ingest_state ADD COLUMN sessions_w TIMESTAMP DEFAULT TIMESTAMP '1970-01-01 00:00:00';
	UPDATE ingest_state SET sessions_w = TIMESTAMP '1970-01-01 00:00:00';`,
	// 3: Core Web Vitals, reported by the browser with the engagement event.
	// Null everywhere else, and null on every row a site recorded before it
	// turned the module on — which is the truth, not a zero.
	`ALTER TABLE events ADD COLUMN lcp_ms UINTEGER;
	ALTER TABLE events ADD COLUMN cls_1k UINTEGER;
	ALTER TABLE events ADD COLUMN inp_ms UINTEGER;`,
	// 7: rows brought in by `trckabled import`: history, not traffic, so an
	// operator's meter can leave them out. Null for everything recorded live.
	`ALTER TABLE events ADD COLUMN imported BOOLEAN;`,
	// 5: crawler hits as counters, one row per (site, day, crawler, errand,
	// path). A robot's request is never stored as an event: no timestamp
	// finer than the day, nothing that could describe a person. Hits
	// recorded as events before this release fold into the counters.
	`CREATE TABLE crawler_hits (
		site_id VARCHAR NOT NULL,
		day     DATE    NOT NULL,
		name    VARCHAR NOT NULL,
		kind    VARCHAR NOT NULL,
		path    VARCHAR NOT NULL,
		hits    UBIGINT NOT NULL,
		errors  UBIGINT NOT NULL,
		PRIMARY KEY (site_id, day, name, kind, path)
	);
	INSERT INTO crawler_hits
		SELECT site_id, CAST(ts AS DATE), coalesce(browser, ''), coalesce(os, ''), coalesce(path, ''),
		       count(*), count(*) FILTER (WHERE goal = 'error')
		FROM events WHERE kind = 4 GROUP BY ALL;
	DELETE FROM events WHERE kind = 4;`,
}

// tableSince is the migration that created each table added after the first
// release, so a backup written before it restores without one.
var tableSince = map[string]int{"crawler_hits": 5}

func (s *Store) migrate(ctx context.Context) error { return s.migrateTo(ctx, len(migrations)) }

// MigrateTo brings a store to schema n and no further, the way the release
// that stopped at n left it: tests of upgrades start from there.
func (s *Store) MigrateTo(ctx context.Context, n int) error {
	if n > len(migrations) {
		return fmt.Errorf("no schema %d", n)
	}
	return s.migrateTo(ctx, n)
}

func (s *Store) migrateTo(ctx context.Context, n int) error {
	if _, err := s.DB.ExecContext(ctx,
		`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`); err != nil {
		return err
	}
	var v int
	err := s.DB.QueryRowContext(ctx, `SELECT version FROM schema_version`).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		if _, err := s.DB.ExecContext(ctx, `INSERT INTO schema_version VALUES (0)`); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	if v > len(migrations) {
		return fmt.Errorf("duckdb schema version %d is newer than this binary (%d): refusing to start (downgrade guard)", v, len(migrations))
	}
	for i := v; i < n; i++ {
		tx, err := s.DB.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, migrations[i]); err != nil {
			tx.Rollback()
			return fmt.Errorf("duckdb migration %d: %w", i+1, err)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE schema_version SET version = ?`, i+1); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// HWM returns the highest WAL sequence number applied to the database.
func (s *Store) HWM(ctx context.Context) (uint64, error) {
	var hwm uint64
	err := s.DB.QueryRowContext(ctx, `SELECT hwm FROM ingest_state WHERE id = 1`).Scan(&hwm)
	return hwm, err
}

// Close checkpoints (so the next boot has no WAL to replay) and closes.
func (s *Store) Close() error {
	_, cerr := s.DB.ExecContext(context.Background(), `FORCE CHECKPOINT`)
	err := s.DB.Close()
	return errors.Join(cerr, err)
}

// Import loads a backup's analytics export (EXPORT DATABASE … FORMAT PARQUET)
// into this freshly migrated store, in one transaction.
//
// The export's own load.sql is never run: a backup may come from someone
// else's bucket, and a file of SQL is a file of commands. Instead each of
// this store's tables is filled from the Parquet file of the same name, by
// column name, so a backup from an older release restores into a newer one.
// A backup written by a newer release than this binary is refused, as the
// downgrade guard refuses its database.
func (s *Store) Import(ctx context.Context, dir string) (rows int64, err error) {
	file := func(table string) string { return filepath.Join(dir, table+".parquet") }
	v, err := exportVersion(ctx, s.DB, file("schema_version"))
	if err != nil {
		return 0, err
	} else if v > len(migrations) {
		return 0, fmt.Errorf("the backup's analytics are from a newer trckable (schema %d, this one knows %d): restore with that version or later", v, len(migrations))
	}
	tables, err := s.tables(ctx)
	if err != nil {
		return 0, err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	for _, t := range tables {
		if t == "schema_version" {
			continue
		}
		path := file(t)
		if v < tableSince[t] {
			continue // the backup predates this table; it starts empty
		}
		if _, err := os.Stat(path); err != nil {
			return 0, fmt.Errorf("the backup has no %s table: %w", t, err)
		}
		// A fresh store starts with seed rows (the ingest watermark at 0);
		// the backup's rows replace them.
		if _, err := tx.ExecContext(ctx, `DELETE FROM `+quoteIdent(t)); err != nil { //nolint:gosec // t is one of this store's own tables, quoted
			return 0, err
		}
		res, err := tx.ExecContext(ctx, `INSERT INTO `+quoteIdent(t)+` BY NAME SELECT * FROM read_parquet(?)`, path) //nolint:gosec // t is one of this store's own tables, quoted; the path is bound
		if err != nil {
			return 0, fmt.Errorf("restore %s: %w", t, err)
		}
		n, _ := res.RowsAffected()
		rows += n
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	_, err = s.DB.ExecContext(ctx, `FORCE CHECKPOINT`)
	return rows, err
}

// tables lists this store's own tables.
func (s *Store) tables(ctx context.Context) ([]string, error) {
	rs, err := s.DB.QueryContext(ctx, `SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_type = 'BASE TABLE' ORDER BY 1`)
	if err != nil {
		return nil, err
	}
	defer rs.Close()
	var out []string
	for rs.Next() {
		var t string
		if err := rs.Scan(&t); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rs.Err()
}

func exportVersion(ctx context.Context, db *sql.DB, path string) (int, error) {
	if _, err := os.Stat(path); err != nil {
		return 0, fmt.Errorf("the backup's analytics have no schema version: %w", err)
	}
	var v int
	err := db.QueryRowContext(ctx, `SELECT max(version) FROM read_parquet(?)`, path).Scan(&v)
	return v, err
}

func quoteIdent(s string) string { return `"` + strings.ReplaceAll(s, `"`, `""`) + `"` }
