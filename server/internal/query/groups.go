package query

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// Content groups: a site read by section rather than by four hundred URLs.
// The rules live in the site's settings and are applied here, at read time, so
// changing them re-reads history instead of only affecting what comes next.

// Group is one rule: a name, and the paths that belong to it.
type Group struct {
	Name string
	Path string // a trailing * matches a prefix; anything else is exact
}

// MaxGroupRules caps how many rules one report will evaluate, so a settings
// page cannot turn every scan into a hundred comparisons per row.
const MaxGroupRules = 30

// groupExpr builds the CASE that maps a path to its group. First match wins,
// so the order of the rules is the rule. Anything unmatched is left out
// rather than lumped into "Other": a group nobody defined is not a finding.
//
// The path values are quoted here rather than bound, because they are part of
// a CASE the query planner has to see. Quoting is done by doubling the single
// quotes, and a rule containing anything stranger is dropped.
func groupExpr(gs []Group, col string) (string, bool) {
	var b strings.Builder
	b.WriteString("CASE ")
	n := 0
	for _, g := range gs {
		if n == MaxGroupRules {
			break
		}
		name, path := strings.TrimSpace(g.Name), strings.TrimSpace(g.Path)
		if name == "" || path == "" || !strings.HasPrefix(path, "/") {
			continue
		}
		if prefix, ok := strings.CutSuffix(path, "*"); ok {
			fmt.Fprintf(&b, "WHEN starts_with(%s, %s) THEN %s ", col, lit(prefix), lit(name))
		} else {
			fmt.Fprintf(&b, "WHEN %s = %s THEN %s ", col, lit(path), lit(name))
		}
		n++
	}
	b.WriteString("END")
	return b.String(), n > 0
}

// lit quotes a string for SQL. Only the rules an owner typed reach this, and
// they are checked above, but doubling the quotes makes it safe regardless.
func lit(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

// groupRows counts pageviews and visitors per content group.
func groupRows(ctx context.Context, conn *sql.Conn, cte string, cteArgs []any, where string, args []any, gs []Group, limit int, filtered bool, distinct string) ([]Row, error) {
	expr, matched := groupExpr(gs, "path")
	if !matched {
		return nil, nil
	}
	q := `SELECT g, ` + distinct + ` AS vis, count(*) FROM (
		SELECT ` + expr + ` AS g, visitor_id, session_id FROM events
		WHERE ` + where + ` AND kind = 1 AND path IS NOT NULL`
	all := append([]any{}, args...)
	if filtered {
		q = cte + " " + q + ` AND session_id IN (SELECT session_id FROM s)`
		all = append(append([]any{}, cteArgs...), args...)
	}
	q += `) WHERE g IS NOT NULL GROUP BY g ORDER BY vis DESC, g LIMIT ?`
	rows, err := conn.QueryContext(ctx, q, append(all, limit)...)
	if err != nil {
		return nil, fmt.Errorf("content groups: %w", err)
	}
	defer rows.Close()
	out := []Row{}
	for rows.Next() {
		var r Row
		if err := rows.Scan(&r.Value, &r.Visitors, &r.Pageviews); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// pageMatch is the condition for one rule on a path column: a prefix when the
// rule ends in *, the exact path otherwise. False when the rule is not a path.
func pageMatch(g Group, col string) (string, bool) {
	path := strings.TrimSpace(g.Path)
	if strings.TrimSpace(g.Name) == "" || !strings.HasPrefix(path, "/") {
		return "", false
	}
	if prefix, ok := strings.CutSuffix(path, "*"); ok {
		return fmt.Sprintf("starts_with(%s, %s)", col, lit(prefix)), true
	}
	return fmt.Sprintf("%s = %s", col, lit(path)), true
}

// pageGoal finds the page goal with this name.
func pageGoal(gs []Group, name string) (Group, bool) {
	for _, g := range gs {
		if strings.TrimSpace(g.Name) == name {
			return g, true
		}
	}
	return Group{}, false
}

// pageGoalRows counts each page goal: visitors who saw a matching page, and
// visits that did (a goal is reached once per visit, however many matching
// pages it read). One page view can reach several goals.
func pageGoalRows(ctx context.Context, conn *sql.Conn, cte string, cteArgs []any, where string, args []any, gs []Group, filtered bool, distinct string) ([]Row, error) {
	var parts []string
	var all []any
	if filtered {
		all = append(all, cteArgs...)
	}
	for i, g := range gs {
		if i == MaxGroupRules {
			break
		}
		cond, ok := pageMatch(g, "path")
		if !ok {
			continue
		}
		part := `SELECT ` + lit(strings.TrimSpace(g.Name)) + ` AS g, ` + distinct + ` AS vis, count(DISTINCT session_id) AS n
			FROM events WHERE ` + where + ` AND kind = 1 AND ` + cond
		if filtered {
			part += ` AND session_id IN (SELECT session_id FROM s)`
		}
		parts = append(parts, part)
		all = append(all, args...)
	}
	if len(parts) == 0 {
		return nil, nil
	}
	q := strings.Join(parts, " UNION ALL ")
	if filtered {
		q = cte + " " + q
	}
	rows, err := conn.QueryContext(ctx, q, all...)
	if err != nil {
		return nil, fmt.Errorf("page goals: %w", err)
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var r Row
		if err := rows.Scan(&r.Value, &r.Visitors, &r.Pageviews); err != nil {
			return nil, err
		}
		if r.Visitors > 0 {
			out = append(out, r)
		}
	}
	return out, rows.Err()
}
