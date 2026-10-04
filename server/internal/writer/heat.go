package writer

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// HeatRow is one counter of what the heatmaps script reported for a site on
// one UTC day: how many times, and the sums its average place and size are
// worked out from. Counts and nothing about whoever caused them.
type HeatRow struct {
	Site, Day, Path string
	Width           uint16
	Kind, El        string
	CX, CY          uint8
	N, X, Y, W, H   uint64
}

// HeatDayKeys is the most distinct counters one site keeps for one day. A page
// with thousands of made-up paths or elements cannot grow the file without
// bound: past it the counters that counted least are dropped (a page's own
// views never are).
const HeatDayKeys = 20_000

// heatPerStatement is how many counters one INSERT carries.
const heatPerStatement = 200

// AddHeat adds counters to the day's rows, in one transaction on the writer's
// connection, so it never races an ingest batch. Like AddBots, a count for a
// site that no longer exists is dropped and a second call with the same rows
// adds them again: the caller hands each count over once.
func (w *Writer) AddHeat(ctx context.Context, rows []HeatRow) error {
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
				return fmt.Errorf("heat counts: %w", err)
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
		type day struct{ site, day string }
		days := map[day]bool{}
		// Many rows to a statement: one statement a row costs the store three
		// milliseconds and a lot of memory each, and a busy minute holds
		// thousands. The rows of one statement must be different counters, so
		// the same one twice is added up first.
		type key struct {
			site, day, path string
			width           uint16
			kind, el        string
			cx, cy          uint8
		}
		sums := map[key]*HeatRow{}
		var order []key
		for i := range rows {
			r := rows[i]
			k := key{r.Site, r.Day, r.Path, r.Width, r.Kind, r.El, r.CX, r.CY}
			if cur, ok := sums[k]; ok {
				cur.N, cur.X, cur.Y, cur.W, cur.H = cur.N+r.N, cur.X+r.X, cur.Y+r.Y, cur.W+r.W, cur.H+r.H
				continue
			}
			sums[k] = &r
			order = append(order, k)
			days[day{r.Site, r.Day}] = true
		}
		for len(order) > 0 {
			n := min(heatPerStatement, len(order))
			var sb strings.Builder
			args := make([]any, 0, n*13)
			sb.WriteString(`INSERT INTO heat_daily SELECT * FROM (VALUES `)
			for i, k := range order[:n] {
				r := sums[k]
				if i > 0 {
					sb.WriteByte(',')
				}
				sb.WriteString(`(?, CAST(? AS DATE), ?, CAST(? AS USMALLINT), ?, ?, CAST(? AS UTINYINT), CAST(? AS UTINYINT), CAST(? AS UBIGINT), CAST(? AS UBIGINT), CAST(? AS UBIGINT), CAST(? AS UBIGINT), CAST(? AS UBIGINT))`)
				args = append(args, r.Site, r.Day, r.Path, r.Width, r.Kind, r.El, r.CX, r.CY, r.N, r.X, r.Y, r.W, r.H)
			}
			sb.WriteString(`) ON CONFLICT DO UPDATE SET n = n + excluded.n, sx = sx + excluded.sx, sy = sy + excluded.sy, sw = sw + excluded.sw, sh = sh + excluded.sh`)
			if _, err := tx.ExecContext(ctx, sb.String(), args...); err != nil { //nolint:gosec // the text is made of placeholders; every value is bound
				return fmt.Errorf("heat counts: %w", err)
			}
			order = order[n:]
		}
		for d := range days {
			var n int
			if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM heat_daily WHERE site_id = ? AND day = CAST(? AS DATE)`, d.site, d.day).Scan(&n); err != nil {
				return fmt.Errorf("heat counts: %w", err)
			}
			if n <= HeatDayKeys {
				continue
			}
			if _, err := tx.ExecContext(ctx, `
				DELETE FROM heat_daily WHERE site_id = ? AND day = CAST(? AS DATE)
				AND (path, width, kind, el, cx, cy) IN (
					SELECT path, width, kind, el, cx, cy FROM heat_daily WHERE site_id = ? AND day = CAST(? AS DATE)
					ORDER BY (kind = 'v') DESC, n DESC, path, el OFFSET ?)`,
				d.site, d.day, d.site, d.day, HeatDayKeys); err != nil {
				return fmt.Errorf("heat counts: %w", err)
			}
		}
		return tx.Commit()
	})
}
