package writer

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// ImportedRow is one imported number for a day: the day's total (Dim
// "total", empty Value) or one value of a dimension.
type ImportedRow struct {
	Day      string // YYYY-MM-DD
	Dim      string
	Value    string
	Sessions uint64
	Users    uint64
	Views    uint64
}

// ReplaceImported makes the days from..to (inclusive) of a site hold exactly
// rows, in one transaction on the writer's connection: what was there is
// deleted first, so importing a range again leaves one copy, never two. Rows
// outside the range are refused, and a site that no longer exists gets
// nothing.
func (w *Writer) ReplaceImported(ctx context.Context, site, from, to string, rows []ImportedRow) error {
	for _, r := range rows {
		if r.Day < from || r.Day > to {
			return fmt.Errorf("imported day %s is outside %s..%s", r.Day, from, to)
		}
	}
	return w.Do(ctx, func(ctx context.Context, conn *sql.Conn) error {
		if w.opts.Sites != nil {
			live, err := w.opts.Sites(ctx, []string{site})
			if err != nil {
				return fmt.Errorf("imported days: %w", err)
			}
			if !live[site] {
				return nil
			}
		}
		tx, err := conn.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback() //nolint:errcheck // a rollback after a commit has nothing to do
		if _, err := tx.ExecContext(ctx, `DELETE FROM imported_daily WHERE site_id = ? AND day >= CAST(? AS DATE) AND day <= CAST(? AS DATE)`, site, from, to); err != nil {
			return fmt.Errorf("imported days: %w", err)
		}
		// One row per (day, dimension, value), however the caller listed them.
		type key struct{ day, dim, value string }
		at := map[key]int{}
		var uniq []ImportedRow
		for _, r := range rows {
			k := key{r.Day, r.Dim, r.Value}
			if i, ok := at[k]; ok {
				uniq[i].Sessions += r.Sessions
				uniq[i].Users += r.Users
				uniq[i].Views += r.Views
				continue
			}
			at[k] = len(uniq)
			uniq = append(uniq, r)
		}
		const batch = 200 // rows per statement: a statement per row is slow in DuckDB
		for lo := 0; lo < len(uniq); lo += batch {
			part := uniq[lo:min(lo+batch, len(uniq))]
			marks := strings.TrimSuffix(strings.Repeat("(?, CAST(? AS DATE), ?, ?, ?, ?, ?),", len(part)), ",")
			args := make([]any, 0, 7*len(part))
			for _, r := range part {
				args = append(args, site, r.Day, r.Dim, r.Value, r.Sessions, r.Users, r.Views)
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO imported_daily VALUES `+marks, args...); err != nil { //nolint:gosec // only placeholders are built; the values are bound
				return fmt.Errorf("imported days: %w", err)
			}
		}
		return tx.Commit()
	})
}
