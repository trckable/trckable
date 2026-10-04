package writer

import (
	"context"
	"database/sql"
	"fmt"
)

// BotDay is a count of visits turned away for one site on one UTC day, of one
// kind. A number: nothing about who sent them.
type BotDay struct {
	Site string
	Day  string // YYYY-MM-DD
	Kind string
	N    uint64
}

// AddBots adds counts to the per-day bot counters, in one transaction on the
// writer's connection, so it never races an ingest batch. A count for a site
// that no longer exists is dropped, like its queued events. A second call with
// the same rows adds them again: the caller hands each count over once.
func (w *Writer) AddBots(ctx context.Context, rows []BotDay) error {
	if len(rows) == 0 {
		return nil
	}
	return w.Do(ctx, func(ctx context.Context, conn *sql.Conn) error {
		if w.opts.Sites != nil {
			seen := map[string]bool{}
			var ids []string
			for _, r := range rows {
				if !seen[r.Site] {
					seen[r.Site] = true
					ids = append(ids, r.Site)
				}
			}
			live, err := w.opts.Sites(ctx, ids)
			if err != nil {
				return fmt.Errorf("bot counts: %w", err)
			}
			kept := rows[:0:0]
			for _, r := range rows {
				if live[r.Site] {
					kept = append(kept, r)
				}
			}
			rows = kept
		}
		tx, err := conn.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback() //nolint:errcheck // a rollback after a commit has nothing to do
		for _, r := range rows {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO bot_daily VALUES (?, CAST(? AS DATE), ?, ?)
				ON CONFLICT DO UPDATE SET n = n + excluded.n`,
				r.Site, r.Day, r.Kind, r.N); err != nil {
				return fmt.Errorf("bot counts: %w", err)
			}
		}
		return tx.Commit()
	})
}
