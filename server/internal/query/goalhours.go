package query

import (
	"context"
	"time"
)

// GoalHour is how many times a goal was reached in one hour of the site's day.
type GoalHour struct {
	Hour  string // 2026-09-25T14:00, the site's own clock
	Goal  string
	Count int64
}

// GoalHours lists the goals reached in [from, to) hour by hour (the site's time zone), newest first, at most limit.
func (q Q) GoalHours(ctx context.Context, site, tz string, from, to time.Time, limit int) ([]GoalHour, error) {
	tz, err := safeTZ(tz)
	if err != nil {
		return nil, err
	}
	local := `date_trunc('hour', (ts AT TIME ZONE 'UTC') AT TIME ZONE '` + tz + `')`
	//nolint:gosec // the zone was checked against the zone database by safeTZ; every value is bound as a parameter
	rows, err := q.DB.QueryContext(ctx, `SELECT strftime(`+local+`, '%Y-%m-%dT%H:00'), goal, count(*) FROM events
		WHERE site_id = ? AND kind = 2 AND goal IS NOT NULL AND ts >= ? AND ts < ?
		GROUP BY 1, 2 ORDER BY 1 DESC, 2 LIMIT ?`, site, from, to, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []GoalHour
	for rows.Next() {
		var g GoalHour
		if err := rows.Scan(&g.Hour, &g.Goal, &g.Count); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}
