package writer

import (
	"context"
	"testing"
	"time"
)

// Counts are added to the day's row: the same key twice is one row with the sum.
func TestBotCountsUpsert(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w, stop := e.start(t, Options{})
	defer stop()
	ctx := context.Background()
	if err := w.AddBots(ctx, []BotDay{{"s1", "2026-09-10", "bot", 3}, {"s1", "2026-09-10", "ai-crawler", 2}}); err != nil {
		t.Fatal(err)
	}
	if err := w.AddBots(ctx, []BotDay{{"s1", "2026-09-10", "bot", 4}, {"s1", "2026-09-11", "bot", 1}}); err != nil {
		t.Fatal(err)
	}
	if n := e.count(t, `SELECT n FROM bot_daily WHERE site_id = 's1' AND day = DATE '2026-09-10' AND kind = 'bot'`); n != 7 {
		t.Fatalf("bot on the 10th: want 7, got %d", n)
	}
	if n := e.count(t, `SELECT n FROM bot_daily WHERE kind = 'ai-crawler'`); n != 2 {
		t.Fatalf("ai-crawler: want 2, got %d", n)
	}
	if n := e.count(t, `SELECT count(*) FROM bot_daily`); n != 3 {
		t.Fatalf("rows: want 3, got %d", n)
	}
}

// A restart keeps what was written, and counts on from it.
func TestBotCountsSurviveARestart(t *testing.T) {
	dir := t.TempDir()
	e := newEnv(t, dir)
	w, stop := e.start(t, Options{})
	if err := w.AddBots(context.Background(), []BotDay{{"s1", "2026-09-10", "bot", 5}}); err != nil {
		t.Fatal(err)
	}
	stop()
	e.close()

	e = newEnv(t, dir)
	defer e.close()
	w, stop = e.start(t, Options{})
	defer stop()
	if n := e.count(t, `SELECT n FROM bot_daily`); n != 5 {
		t.Fatalf("after the restart: want 5, got %d", n)
	}
	if err := w.AddBots(context.Background(), []BotDay{{"s1", "2026-09-10", "bot", 2}}); err != nil {
		t.Fatal(err)
	}
	if n := e.count(t, `SELECT n FROM bot_daily`); n != 7 {
		t.Fatalf("counting on: want 7, got %d", n)
	}
}

// A site that is gone keeps no counts, and deleting a site takes them.
func TestBotCountsFollowTheSite(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w, stop := e.start(t, Options{Sites: func(_ context.Context, ids []string) (map[string]bool, error) {
		out := map[string]bool{}
		for _, id := range ids {
			out[id] = id == "s1"
		}
		return out, nil
	}})
	defer stop()
	ctx := context.Background()
	if err := w.AddBots(ctx, []BotDay{{"s1", "2026-09-10", "bot", 1}, {"gone", "2026-09-10", "bot", 9}}); err != nil {
		t.Fatal(err)
	}
	if n := e.count(t, `SELECT count(*) FROM bot_daily WHERE site_id = 'gone'`); n != 0 {
		t.Fatalf("a deleted site's counts were written: %d", n)
	}
	if _, _, err := w.PurgeSite(ctx, "s1"); err != nil {
		t.Fatal(err)
	}
	if n := e.count(t, `SELECT count(*) FROM bot_daily`); n != 0 {
		t.Fatalf("after the purge: %d rows", n)
	}
}

// Pruning old days takes their bot counts with them.
func TestBotCountsArePruned(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w, stop := e.start(t, Options{})
	defer stop()
	ctx := context.Background()
	if err := w.AddBots(ctx, []BotDay{{"s1", "2026-09-01", "bot", 1}, {"s1", "2026-09-20", "bot", 1}}); err != nil {
		t.Fatal(err)
	}
	cut := time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC).UnixMilli()
	if _, err := w.PruneBefore(ctx, "s1", cut); err != nil {
		t.Fatal(err)
	}
	if n := e.count(t, `SELECT count(*) FROM bot_daily`); n != 1 {
		t.Fatalf("after pruning: want the one recent day, got %d", n)
	}
}
