package query

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// What the goals list and a goal's own page read: how often each goal was reached on each day, when each was first
// reached, and each time one was. A goal is an event the site sends (kind 2, its key is the goal) or a page goal (the
// pages a rule of the site matches, its key the rule's name, counted once per visit).

// GoalDay is how many times a goal was reached on one day of the site's calendar.
type GoalDay struct {
	Goal  string
	Day   string // 2026-11-24, in the site's zone
	Count int64
}

// goalDayExpr is the site's calendar day of an event, as text.
func goalDayExpr(tz string) string {
	return `strftime(date_trunc('day', (ts AT TIME ZONE 'UTC') AT TIME ZONE '` + tz + `'), '%Y-%m-%d')`
}

// goalCond is the condition that picks one goal's events, and the arguments it binds.
func goalCond(goal string, pages []Group) (string, []any) {
	if g, ok := pageGoal(pages, goal); ok {
		if cond, ok := pageMatch(g, "path"); ok {
			return "kind = 1 AND " + cond, nil
		}
	}
	return "kind = 2 AND goal = ?", []any{goal}
}

// pageGoalParts is one select per page goal over a column list ({goal} is the goal's quoted name), each ending in tail.
func pageGoalParts(pages []Group, cols, where, tail string) []string {
	var parts []string
	for i, g := range pages {
		if i == MaxGroupRules {
			break
		}
		cond, ok := pageMatch(g, "path")
		if !ok {
			continue
		}
		parts = append(parts, `SELECT `+strings.ReplaceAll(cols, "{goal}", lit(strings.TrimSpace(g.Name)))+` FROM events WHERE `+where+` AND kind = 1 AND `+cond+tail)
	}
	return parts
}

// goalQuerier is what both the pool and one connection can run.
type goalQuerier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

// goalScope opens what a read of goal events needs: with filters on, the connection holds the visits that pass them over
// [from, to), and only the events of those visits count; with none, the pool answers and nothing is added. `done` ends it.
func (q Q) goalScope(ctx context.Context, p Params, from time.Time) (run goalQuerier, with string, args []any, and string, done func(), err error) {
	if len(p.Filters) == 0 {
		return q.DB, "", nil, "", func() {}, nil
	}
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, "", nil, "", nil, err
	}
	scope := p
	scope.From = from
	cte, cargs, err := sessionsCTE(scope)
	if err != nil {
		q.done(conn)
		return nil, "", nil, "", nil, err
	}
	return conn, cte + " ", cargs, " AND session_id IN (SELECT session_id FROM s)", func() { q.done(conn) }, nil
}

// GoalDays counts each goal's reaches per day over [from, p.To), the site's zone: the goals the site sends, and each page goal.
// The visits are those that pass p.Filters.
func (q Q) GoalDays(ctx context.Context, p Params, from time.Time, pages []Group) ([]GoalDay, error) {
	tz, err := safeTZ(p.TZ)
	if err != nil {
		return nil, err
	}
	run, with, cargs, and, done, err := q.goalScope(ctx, p, from)
	if err != nil {
		return nil, err
	}
	defer done()
	site, to := p.Site, p.To
	day := goalDayExpr(tz)
	where := `site_id = ? AND ts >= ? AND ts < ?` + and
	text := with + `SELECT ` + day + ` AS d, goal AS g, count(*) AS n FROM events WHERE ` + where + ` AND kind = 2 AND goal IS NOT NULL GROUP BY 1, 2`
	args := append(cargs, site, from, to)
	for _, part := range pageGoalParts(pages, day+` AS d, {goal} AS g, count(DISTINCT session_id) AS n`, where, ` GROUP BY 1`) {
		text += " UNION ALL " + part
		args = append(args, site, from, to)
	}
	//nolint:gosec // the zone was checked by safeTZ; the page rules are quoted by lit; every value is bound
	rows, err := run.QueryContext(ctx, text, args...)
	if err != nil {
		return nil, fmt.Errorf("goal days: %w", err)
	}
	defer rows.Close()
	var out []GoalDay
	for rows.Next() {
		var g GoalDay
		if err := rows.Scan(&g.Day, &g.Goal, &g.Count); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// GoalFirsts is when each goal was first reached (unix seconds), and when the site's first event was (0 for none).
func (q Q) GoalFirsts(ctx context.Context, site string, pages []Group) (map[string]int64, int64, error) {
	first := map[string]int64{}
	rows, err := q.DB.QueryContext(ctx, `SELECT goal, epoch(min(ts))::BIGINT FROM events WHERE site_id = ? AND kind = 2 AND goal IS NOT NULL GROUP BY 1`, site)
	if err != nil {
		return nil, 0, fmt.Errorf("goal firsts: %w", err)
	}
	for rows.Next() {
		var g string
		var at int64
		if err := rows.Scan(&g, &at); err != nil {
			rows.Close()
			return nil, 0, err
		}
		first[g] = at
	}
	rows.Close()
	if parts := pageGoalParts(pages, `{goal} AS g, epoch(min(ts))::BIGINT AS at`, `site_id = ?`, ` HAVING count(*) > 0`); len(parts) > 0 {
		args := make([]any, len(parts))
		for i := range args {
			args[i] = site
		}
		//nolint:gosec // the page rules are quoted by lit; the site is bound
		pr, err := q.DB.QueryContext(ctx, strings.Join(parts, " UNION ALL "), args...)
		if err != nil {
			return nil, 0, fmt.Errorf("page goal firsts: %w", err)
		}
		defer pr.Close()
		for pr.Next() {
			var g string
			var at int64
			if err := pr.Scan(&g, &at); err != nil {
				return nil, 0, err
			}
			first[g] = at
		}
		if err := pr.Err(); err != nil {
			return nil, 0, err
		}
	}
	var site0 int64
	if err := q.DB.QueryRowContext(ctx, `SELECT coalesce(epoch(min(ts))::BIGINT, 0) FROM events WHERE site_id = ?`, site).Scan(&site0); err != nil {
		return nil, 0, err
	}
	return first, site0, nil
}

// GoalEvent is one time a goal was reached.
type GoalEvent struct {
	At      int64 // unix seconds
	Path    string
	Source  string // the host that sent the visitor, else the channel ("Direct")
	Country string // ISO code
	Device  string
	OS      string
}

// sourceExpr is who sent the visitor: the referring host, else the channel.
const sourceExpr = `coalesce(nullif(referrer_host, ''), nullif(channel, ''), '')`

// GoalEvents lists the times a goal was reached in [p.From, p.To), newest first, at most limit. A page goal lists the page views that matched.
func (q Q) GoalEvents(ctx context.Context, p Params, goal string, pages []Group, limit int) ([]GoalEvent, error) {
	run, with, scopeArgs, and, done, err := q.goalScope(ctx, p, p.From)
	if err != nil {
		return nil, err
	}
	defer done()
	cond, cargs := goalCond(goal, pages)
	args := append(append(scopeArgs, p.Site, p.From, p.To), cargs...)
	//nolint:gosec // the page rule is quoted by lit; every value is bound
	rows, err := run.QueryContext(ctx, with+`SELECT epoch(ts)::BIGINT, coalesce(path, ''), `+sourceExpr+`, coalesce(country, ''), coalesce(device, ''), coalesce(os, '') FROM events
		WHERE site_id = ? AND ts >= ? AND ts < ?`+and+` AND `+cond+` ORDER BY ts DESC LIMIT ?`, append(args, limit)...)
	if err != nil {
		return nil, fmt.Errorf("goal events: %w", err)
	}
	defer rows.Close()
	var out []GoalEvent
	for rows.Next() {
		var e GoalEvent
		if err := rows.Scan(&e.At, &e.Path, &e.Source, &e.Country, &e.Device, &e.OS); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// GoalSource is how many times goals were reached from one source.
type GoalSource struct {
	Source string
	Count  int64
}

// GoalSources ranks who sent the visitors over [p.From, p.To): of one goal, or (goal "") of every goal the site sends.
func (q Q) GoalSources(ctx context.Context, p Params, goal string, pages []Group, limit int) ([]GoalSource, error) {
	run, with, scopeArgs, and, done, err := q.goalScope(ctx, p, p.From)
	if err != nil {
		return nil, err
	}
	defer done()
	cond, cargs := "kind = 2 AND goal IS NOT NULL", []any(nil)
	if goal != "" {
		cond, cargs = goalCond(goal, pages)
	}
	args := append(append(scopeArgs, p.Site, p.From, p.To), cargs...)
	//nolint:gosec // the page rule is quoted by lit; every value is bound
	rows, err := run.QueryContext(ctx, with+`SELECT `+sourceExpr+` AS s, count(*) AS n FROM events
		WHERE site_id = ? AND ts >= ? AND ts < ?`+and+` AND `+cond+` GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ?`, append(args, limit)...)
	if err != nil {
		return nil, fmt.Errorf("goal sources: %w", err)
	}
	defer rows.Close()
	var out []GoalSource
	for rows.Next() {
		var s GoalSource
		if err := rows.Scan(&s.Source, &s.Count); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
