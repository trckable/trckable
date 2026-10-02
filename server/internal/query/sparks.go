package query

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// MaxSparkRows is how many rows one sparkline request may ask about: the
// rows a list shows (Full's twelve), never a whole breakdown.
const MaxSparkRows = 12

// Sparks are the small per-row charts of a list: each given value's visitors
// for every day of the range. Rows are named by the dimension's own values, as
// the report lists them.
type Sparks struct {
	Days []string           `json:"days"` // YYYY-MM-DD in the report's zone, oldest first
	Rows map[string][]int64 `json:"rows"` // value → visitors per day, aligned with Days
}

// Sparks reads the daily visitors of the given values of one session
// dimension in ONE grouped scan over the range, however many rows are asked
// for: the lists never ask a row at a time. Filters apply as in the report.
func (q Q) Sparks(ctx context.Context, p Params, dim string, values []string) (*Sparks, error) {
	col, ok := sessionDims[dim]
	if !ok {
		return nil, fmt.Errorf("no sparklines for %q", dim)
	}
	if len(values) == 0 || len(values) > MaxSparkRows {
		return nil, fmt.Errorf("ask for 1 to %d rows", MaxSparkRows)
	}
	tz, err := safeTZ(p.TZ)
	if err != nil {
		return nil, err
	}
	loc, _ := time.LoadLocation(tz)
	conn, err := q.DB.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	if err := q.loadOpen(ctx, conn, p.Site); err != nil {
		return nil, err
	}
	defer func() { _, _ = conn.ExecContext(context.Background(), `DROP TABLE IF EXISTS s_open`) }()
	cte, args, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	marks := strings.TrimSuffix(strings.Repeat("?,", len(values)), ",")
	for _, v := range values {
		args = append(args, v)
	}
	//nolint:gosec // col comes from the fixed sessionDims map; the values are bound parameters
	rows, err := conn.QueryContext(ctx, cte+`
		SELECT v, strftime(lstart, '%Y-%m-%d') AS d, count(DISTINCT visitor_id)
		FROM (SELECT `+col+` AS v, lstart, visitor_id FROM s)
		WHERE v IN (`+marks+`) GROUP BY v, d`, args...)
	if err != nil {
		return nil, fmt.Errorf("sparks: %w", err)
	}
	defer rows.Close()

	out := &Sparks{Rows: map[string][]int64{}}
	at := map[string]int{}
	for d := p.From.In(loc); d.Before(p.To); d = time.Date(d.Year(), d.Month(), d.Day()+1, 0, 0, 0, 0, loc) {
		at[d.Format("2006-01-02")] = len(out.Days)
		out.Days = append(out.Days, d.Format("2006-01-02"))
	}
	for _, v := range values {
		out.Rows[v] = make([]int64, len(out.Days))
	}
	for rows.Next() {
		var v, d string
		var n int64
		if err := rows.Scan(&v, &d, &n); err != nil {
			return nil, err
		}
		if i, ok := at[d]; ok {
			out.Rows[v][i] = n
		}
	}
	return out, rows.Err()
}
