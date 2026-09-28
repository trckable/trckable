package duck

import (
	"context"
	"path/filepath"
	"testing"
)

// Crawler hits stored as events by an older release fold into the counters,
// and the events go.
func TestCrawlerEventsFoldIntoCounters(t *testing.T) {
	ctx := context.Background()
	s, err := OpenUnmigrated(filepath.Join(t.TempDir(), "a.duckdb"), Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := s.MigrateTo(ctx, 4); err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, path, browser, os) VALUES (1, 's1', TIMESTAMP '2026-09-10 09:00:00', 4, 0, 0, '/', 'OpenAI', 'train')`,
		`INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, path, browser, os, goal) VALUES (2, 's1', TIMESTAMP '2026-09-10 10:00:00', 4, 0, 0, '/', 'OpenAI', 'train', 'error')`,
		`INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, path) VALUES (3, 's1', TIMESTAMP '2026-09-10 10:00:00', 1, 5, 6, '/')`,
	} {
		if _, err := s.DB.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	var hits, errs, left int64
	if err := s.DB.QueryRowContext(ctx, `SELECT hits, errors FROM crawler_hits WHERE site_id = 's1' AND day = DATE '2026-09-10' AND name = 'OpenAI' AND path = '/'`).Scan(&hits, &errs); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM events`).Scan(&left); err != nil {
		t.Fatal(err)
	}
	if hits != 2 || errs != 1 || left != 1 {
		t.Fatalf("hits %d errors %d events left %d; want 2, 1, 1", hits, errs, left)
	}
}
