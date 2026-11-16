package query

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// pageDims are the breakdowns whose values are page paths.
var pageDims = []string{"page", "entry_page", "exit_page"}

// addTitles puts each page row's title next to its path: one read of the
// small page_titles table for every path the report lists, however many
// breakdowns list it.
func addTitles(ctx context.Context, conn *sql.Conn, site string, res *Result) error {
	paths := map[string]bool{}
	for _, lists := range []map[string][]Row{res.Dims, res.RevenueDims} {
		for _, d := range pageDims {
			for _, r := range lists[d] {
				paths[r.Value] = true
			}
		}
	}
	if len(paths) == 0 {
		return nil
	}
	args := []any{site}
	for v := range paths {
		args = append(args, v)
	}
	marks := strings.TrimSuffix(strings.Repeat("?,", len(paths)), ",")
	rows, err := conn.QueryContext(ctx, `SELECT path, title FROM page_titles WHERE site_id = ? AND path IN (`+marks+`)`, args...) //nolint:gosec // only placeholders are built; the values are bound
	if err != nil {
		return fmt.Errorf("page titles: %w", err)
	}
	defer rows.Close()
	titles := map[string]string{}
	for rows.Next() {
		var path, title string
		if err := rows.Scan(&path, &title); err != nil {
			return err
		}
		titles[path] = title
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, lists := range []map[string][]Row{res.Dims, res.RevenueDims} {
		for _, d := range pageDims {
			for i := range lists[d] {
				lists[d][i].Title = titles[lists[d][i].Value]
			}
		}
	}
	return nil
}
