package query

import (
	"context"
	"testing"
)

// The milestone history counts the visitors AI assistants sent the way the AI
// & search tab does: the AI channel, and only assistants it can name.
func TestMilestoneDaysCountsAIVisitors(t *testing.T) {
	q := aiRig(t)
	if _, err := q.DB.Exec(`INSERT INTO sessions (site_id, session_id, visitor_id, start, last, channel, referrer, entry_page, pvs, goals, engaged_ms, dur)
		VALUES ('s1', 90, 9, TIMESTAMP '2026-09-10 11:00:00', TIMESTAMP '2026-09-10 11:05:00', 'AI', 'unknown-bot.example', '/x', 1, 0, 0, 0)`); err != nil {
		t.Fatal(err)
	}
	days, err := q.MilestoneDays(context.Background(), "s1", "UTC", "2026-09-14")
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]int64{}
	for _, d := range days {
		got[d.Day] = d.AI
	}
	eq(t, "the 1st", got["2026-09-01"], int64(1))
	eq(t, "the 10th", got["2026-09-10"], int64(3)) // chatgpt, claude, perplexity; not Google, not the unnamed one
	eq(t, "the 11th", got["2026-09-11"], int64(1))
}
