package query

import (
	"context"
	"fmt"
)

// Paths: how visitors move through the site. Each visit is read as the first
// three pages it saw, in order, and visits that saw the same pages are one
// route. It reads only the visits and their first pageviews: no KPIs, no
// breakdowns, no chart, so it costs a fraction of a report.

// pathSteps is how many pages of a visit a route holds.
const pathSteps = 3

// PathsShown is the most routes one answer lists.
const PathsShown = 50

// PathRoute is one route: the pages in order (fewer than pathSteps when the
// visit ended there), how many visits took it and how many of them reached a
// goal.
type PathRoute struct {
	Steps     []string `json:"steps"`
	Visits    int64    `json:"visits"`
	Converted int64    `json:"converted"`
}

// PathPage is a page and how many visits began or ended on it.
type PathPage struct {
	Path   string `json:"path"`
	Visits int64  `json:"visits"`
}

// PathsResult is the period's routes with the numbers above them.
type PathsResult struct {
	Visits int64       `json:"visits"`
	Pages  float64     `json:"pages"` // pages per visit, on average
	First  *PathPage   `json:"first,omitempty"`
	Last   *PathPage   `json:"last,omitempty"`
	Routes []PathRoute `json:"routes"`
}

// Paths reads the period's routes, the busiest first, at most p.Limit (and
// PathsShown). Filters apply to the visits, as everywhere else.
func (q Q) Paths(ctx context.Context, p Params) (*PathsResult, error) {
	out, err := q.paths(ctx, p)
	if err != nil && isOutOfMemory(err) {
		out, err = q.paths(ctx, p)
	}
	return out, err
}

func (q Q) paths(ctx context.Context, p Params) (*PathsResult, error) {
	limit := p.Limit
	if limit <= 0 || limit > PathsShown {
		limit = PathsShown
	}
	if err := acquireReport(ctx); err != nil {
		return nil, err
	}
	defer releaseReport()
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)
	cte, args, err := sessionsCTEOf(p, "*")
	if err != nil {
		return nil, err
	}
	out := &PathsResult{Routes: []PathRoute{}}
	err = conn.QueryRowContext(ctx, cte+`
		SELECT count(*), coalesce(avg(pvs), 0) FROM s WHERE pvs > 0`, args...).Scan(&out.Visits, &out.Pages)
	if err != nil {
		return nil, fmt.Errorf("paths totals: %w", err)
	}
	if out.Visits == 0 {
		return out, nil
	}
	// The pages a visit began and ended on, the busiest of each.
	for _, c := range []struct {
		col string
		to  **PathPage
	}{{"entry_page", &out.First}, {"exit_page", &out.Last}} {
		var pg PathPage
		//nolint:gosec // the column is one of two constants; values are bound as parameters
		err := conn.QueryRowContext(ctx, cte+`
			SELECT `+c.col+`, count(*) FROM s WHERE `+c.col+` IS NOT NULL AND `+c.col+` <> ''
			GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1`, args...).Scan(&pg.Path, &pg.Visits)
		if err != nil {
			continue // no page of that kind: the tile says nothing
		}
		*c.to = &pg
	}
	// The first pageviews of each visit. A visit's pageviews may fall a little
	// past the period's end, so a day's grace covers them.
	rows, err := conn.QueryContext(ctx, cte+`, pv AS (
			SELECT session_id, path, row_number() OVER (PARTITION BY session_id ORDER BY ts, seq) AS n
			FROM events
			WHERE site_id = ? AND ts >= ? AND ts < ? + INTERVAL 1 DAY AND kind = 1 AND path IS NOT NULL
			  AND session_id IN (SELECT session_id FROM s)
		), t AS (
			SELECT session_id, max(path) FILTER (n = 1) AS a, max(path) FILTER (n = 2) AS b, max(path) FILTER (n = 3) AS c
			FROM pv WHERE n <= 3 GROUP BY session_id
		)
		SELECT t.a, t.b, t.c, count(*), count(*) FILTER (s.goals > 0)
		FROM t JOIN s USING (session_id) WHERE t.a IS NOT NULL
		GROUP BY 1, 2, 3 ORDER BY 4 DESC, 1, 2, 3 LIMIT ?`, append(append([]any{}, args...), p.Site, p.From, p.To, limit)...)
	if err != nil {
		return nil, fmt.Errorf("paths: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var a string
		var b, c *string
		var r PathRoute
		if err := rows.Scan(&a, &b, &c, &r.Visits, &r.Converted); err != nil {
			return nil, err
		}
		r.Steps = []string{a}
		if b != nil {
			r.Steps = append(r.Steps, *b)
			if c != nil {
				r.Steps = append(r.Steps, *c)
			}
		}
		out.Routes = append(out.Routes, r)
	}
	return out, rows.Err()
}
