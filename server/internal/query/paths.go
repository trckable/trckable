package query

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// Paths: how visitors move through the site. Each visit is read as the first
// three pages it saw, in order, and visits that saw the same pages are one
// route. It reads only the visits and their first pageviews: no KPIs, no
// breakdowns, no chart, so it costs a fraction of a report.

// PathsShown is the most routes one answer lists.
const PathsShown = 50

// PathRoute is one route: the pages in order (fewer than three when the
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
	Single int64       `json:"single"` // visits that saw one page
	Pages  float64     `json:"pages"`  // pages per visit, on average
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
		SELECT count(*), count(*) FILTER (pvs = 1), coalesce(avg(pvs), 0) FROM s WHERE pvs > 0`, args...).Scan(&out.Visits, &out.Single, &out.Pages)
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
		if errors.Is(err, sql.ErrNoRows) {
			continue // no page of that kind: the tile says nothing
		}
		if err != nil {
			return nil, fmt.Errorf("paths %s: %w", c.col, err)
		}
		*c.to = &pg
	}
	// A visit converted when it reached an event goal, or saw a page that is a
	// page goal: the report's own rule.
	var seen []string
	for _, g := range p.PageGoals {
		if cond, ok := pageMatch(g, "path"); ok {
			seen = append(seen, cond)
		}
	}
	reached := `SELECT NULL::UBIGINT AS session_id WHERE false`
	if len(seen) > 0 {
		//nolint:gosec // conditions are built by pageMatch from quoted literals
		reached = `SELECT DISTINCT session_id FROM events
			WHERE site_id = ? AND ts >= ? AND ts < ? + INTERVAL 1 DAY AND kind = 1 AND path IS NOT NULL AND (` + strings.Join(seen, " OR ") + `)
			  AND session_id IN (SELECT session_id FROM s)`
	}
	// The first pages of each visit (a reload counts once; a visit's pageviews
	// may fall a little past the period's end, so a day's grace covers them).
	all := append(append([]any{}, args...), p.Site, p.From, p.To)
	if len(seen) > 0 {
		all = append(all, p.Site, p.From, p.To)
	}
	//nolint:gosec // only constant fragments and pageMatch's quoted literals; values are bound as parameters
	rows, err := conn.QueryContext(ctx, cte+`, `+visitPages+`, pg AS (`+reached+`
		), t AS (
			SELECT session_id, max(path) FILTER (n = 1) AS a, max(path) FILTER (n = 2) AS b, max(path) FILTER (n = 3) AS c
			FROM o WHERE n <= 3 GROUP BY session_id
		)
		SELECT t.a, t.b, t.c, count(*), count(*) FILTER (s.goals > 0 OR t.session_id IN (SELECT session_id FROM pg))
		FROM t JOIN s USING (session_id) WHERE t.a IS NOT NULL
		GROUP BY 1, 2, 3 ORDER BY 4 DESC, 1, 2, 3 LIMIT ?`, append(all, limit)...)
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
