package query

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
)

// Signup is how many people reached the site's signup goal in the period.
type Signup struct {
	Goal     string `json:"goal"`
	Visitors int64  `json:"visitors"`
}

// signups counts the people who reached the signup goal, in all and per row of
// every session breakdown. The visits that reached it are picked by the same
// goal filter a click on the goal would set, so the two can never disagree.
func signups(ctx context.Context, conn *sql.Conn, p Params, cte string, args []any, distinct string, res *Result) error {
	q := p
	q.Filters = []Filter{{Dim: "goal", Value: p.SignupGoal}}
	where, fargs, err := filterWhere(q, p.From, p.To)
	if err != nil {
		return err
	}
	cte = cte + `, ss AS (SELECT * FROM s` + where + `)`
	args = append(append([]any{}, args...), fargs...)
	sg := &Signup{Goal: p.SignupGoal}
	if err := conn.QueryRowContext(ctx, cte+` SELECT count(DISTINCT visitor_id) FROM ss`, args...).Scan(&sg.Visitors); err != nil {
		return fmt.Errorf("signups: %w", err)
	}
	res.Signup = sg
	if sg.Visitors == 0 {
		return nil
	}
	dims := dimsFor(p.Deep)
	for i := 0; i < len(dims); i += breakdownChunk {
		if err := signupChunk(ctx, conn, cte, args, distinct, dims[i:min(i+breakdownChunk, len(dims))], res.Dims); err != nil {
			return err
		}
	}
	return nil
}

// signupChunk is groupedChunk over the visits that signed up: it fills each
// listed row's Signups. A row the report cut off the list is not added.
func signupChunk(ctx context.Context, conn *sql.Conn, cte string, args []any, distinct string, dims []string, out map[string][]Row) error {
	cols := make([]string, len(dims))
	sets := make([]string, len(dims))
	gcols := make([]string, len(dims))
	for i, d := range dims {
		g := fmt.Sprintf("d%d", i)
		cols[i] = sessionDims[d] + " AS " + g
		sets[i] = "(" + g + ")"
		gcols[i] = g
	}
	//nolint:gosec // columns come from the fixed sessionDims map; values are bound as parameters
	rows, err := conn.QueryContext(ctx, cte+`, t AS (SELECT `+strings.Join(cols, ", ")+`, visitor_id FROM ss)
		SELECT gid, v, n FROM (
			SELECT GROUPING(`+strings.Join(gcols, ", ")+`) AS gid, coalesce(`+strings.Join(gcols, ", ")+`) AS v, `+distinct+` AS n
			FROM t GROUP BY GROUPING SETS (`+strings.Join(sets, ", ")+`)
		) WHERE v IS NOT NULL`, args...)
	if err != nil {
		return fmt.Errorf("signup breakdowns: %w", err)
	}
	defer rows.Close()
	byGID := gidFor(dims)
	got := map[string]map[string]int64{}
	for rows.Next() {
		var gid, n int64
		var v string
		if err := rows.Scan(&gid, &v, &n); err != nil {
			return err
		}
		if d, ok := byGID[gid]; ok {
			if got[d] == nil {
				got[d] = map[string]int64{}
			}
			got[d][v] = n
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for d, byValue := range got {
		for i := range out[d] {
			out[d][i].Signups = byValue[out[d][i].Value]
		}
	}
	return nil
}

// signupNames are the names a goal goes by when it is the signup, spaces,
// underscores and dashes ignored and case too.
var signupNames = map[string]bool{"signup": true, "signedup": true, "register": true, "registered": true, "createaccount": true}

// IsSignupName says whether a goal's key or name reads as a signup.
func IsSignupName(s string) bool {
	return signupNames[strings.ToLower(strings.NewReplacer(" ", "", "_", "", "-", "").Replace(strings.TrimSpace(s)))]
}

// AutoSignup picks the signup among a site's goals when its owner did not:
// the first custom goal (by key) whose key or name reads as a signup, then the
// first page goal. It returns the value a goal filter takes, or "" for none.
func AutoSignup(labels map[string]string, pages []Group) string {
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if IsSignupName(k) || IsSignupName(labels[k]) {
			return k
		}
	}
	for _, g := range pages {
		if name := strings.TrimSpace(g.Name); IsSignupName(name) {
			return name
		}
	}
	return ""
}
