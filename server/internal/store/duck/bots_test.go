package duck

import (
	"context"
	"path/filepath"
	"testing"
)

// A store from the release before the bot counters gains the table and keeps
// every row it had.
func TestBotCountersMigrateAnExistingStore(t *testing.T) {
	ctx := context.Background()
	s, err := OpenUnmigrated(filepath.Join(t.TempDir(), "a.duckdb"), Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := s.MigrateTo(ctx, 6); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO crawler_hits VALUES ('s1', DATE '2026-09-10', 'OpenAI', 'train', '/', 4, 0)`); err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO bot_daily VALUES ('s1', DATE '2026-09-10', 'bot', 2)`); err != nil {
		t.Fatal(err)
	}
	var hits, bots int64
	if err := s.DB.QueryRowContext(ctx, `SELECT sum(hits) FROM crawler_hits`).Scan(&hits); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.QueryRowContext(ctx, `SELECT sum(n) FROM bot_daily`).Scan(&bots); err != nil {
		t.Fatal(err)
	}
	if hits != 4 || bots != 2 {
		t.Fatalf("crawler hits %d, bots %d; want 4, 2", hits, bots)
	}
}
