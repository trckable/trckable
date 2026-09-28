package query

import (
	"context"
	"fmt"
)

// Scroll depth: how far down each page people read. The browser reports the
// furthest point it reached with every engagement ping, so a page view's
// depth is the largest of its pings. A ping that says 0 is stored as empty
// (the writer keeps zeros out of the file), which is why an empty value on a
// page view that did send pings counts as "did not scroll", not as missing.
// A page view that never sent a ping (closed within a moment) has no depth.

// Scroll is the period's reading depth, overall and by page.
type Scroll struct {
	Samples int64        `json:"samples"`         // page views with a depth
	Avg     float64      `json:"avg"`             // average depth, 0–100
	Reached [4]float64   `json:"reached"`         // share of views reaching 25, 50, 75 and 90% (the end)
	Pages   []ScrollPage `json:"pages,omitempty"` // the most viewed pages
}

// ScrollPage is one page's depth.
type ScrollPage struct {
	Path      string  `json:"path"`
	Pageviews int64   `json:"pageviews"`
	Avg       float64 `json:"avg"`
	Read      float64 `json:"read"` // share of views that got at least three quarters down
}

// ScrollFor reports reading depth for the range. Filters apply the way they do
// everywhere else: to the visits, through the report's sessions.
func (q Q) ScrollFor(ctx context.Context, p Params) (*Scroll, error) {
	if p.Limit <= 0 || p.Limit > 100 {
		p.Limit = 10
	}
	if p.TZ == "" {
		p.TZ = "UTC"
	}
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)

	cte, cargs, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	// Pings arrive after their page view, so they may fall just past the
	// range's end; a day's grace covers any real page.
	depth := cte + `, pv AS (
		SELECT e.path, e.pageview_id, max(coalesce(x.scroll_pct, 0)) AS depth
		FROM events e JOIN events x
		  ON x.site_id = e.site_id AND x.pageview_id = e.pageview_id AND x.kind = 3
		 AND x.ts >= ? AND x.ts < ? + INTERVAL 1 DAY
		WHERE e.site_id = ? AND e.ts >= ? AND e.ts < ? AND e.kind = 1 AND e.path IS NOT NULL`
	args := append(append([]any{}, cargs...), p.From, p.To, p.Site, p.From, p.To)
	if len(p.Filters) > 0 {
		depth += ` AND e.session_id IN (SELECT session_id FROM s)`
	}
	depth += ` GROUP BY e.path, e.pageview_id)`

	out := &Scroll{}
	err = conn.QueryRowContext(ctx, depth+`
		SELECT count(*), coalesce(avg(depth), 0),
		       coalesce(avg((depth >= 25)::INT), 0), coalesce(avg((depth >= 50)::INT), 0),
		       coalesce(avg((depth >= 75)::INT), 0), coalesce(avg((depth >= 90)::INT), 0)
		FROM pv`, args...).Scan(&out.Samples, &out.Avg, &out.Reached[0], &out.Reached[1], &out.Reached[2], &out.Reached[3])
	if err != nil {
		return nil, fmt.Errorf("scroll depth: %w", err)
	}
	if out.Samples == 0 {
		return out, nil
	}
	rows, err := conn.QueryContext(ctx, depth+`
		SELECT path, count(*), avg(depth), avg((depth >= 75)::INT)
		FROM pv GROUP BY path ORDER BY count(*) DESC, path LIMIT ?`, append(args, p.Limit)...)
	if err != nil {
		return nil, fmt.Errorf("scroll depth by page: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var r ScrollPage
		if err := rows.Scan(&r.Path, &r.Pageviews, &r.Avg, &r.Read); err != nil {
			return nil, err
		}
		out.Pages = append(out.Pages, r)
	}
	return out, rows.Err()
}
