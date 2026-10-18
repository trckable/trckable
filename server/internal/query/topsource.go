package query

import (
	"context"
	"fmt"
)

// TopSource is where the most visitors of p's range came from: the referring
// site, or the channel (Direct, Search, ...) for the visits that carry none.
// Empty when the range has no visit. It names a source, never a visitor, and
// the whole site is read: filters do not apply.
func (q Q) TopSource(ctx context.Context, p Params) (string, error) {
	if p.TZ == "" {
		p.TZ = "UTC"
	}
	p.Filters = nil
	if err := acquireReport(ctx); err != nil {
		return "", err
	}
	defer releaseReport()
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return "", err
	}
	defer q.done(conn)
	cte, args, err := sessionsCTE(p)
	if err != nil {
		return "", err
	}
	rows, err := conn.QueryContext(ctx, cte+`
		SELECT CASE WHEN coalesce(referrer, '') <> '' THEN referrer ELSE coalesce(nullif(channel, ''), 'Direct') END AS src,
			count(DISTINCT visitor_id) AS n FROM s GROUP BY src ORDER BY n DESC, src LIMIT 1`, args...)
	if err != nil {
		return "", fmt.Errorf("top source: %w", err)
	}
	defer rows.Close()
	var src string
	if rows.Next() {
		var n int64
		if err := rows.Scan(&src, &n); err != nil {
			return "", err
		}
	}
	return src, rows.Err()
}
