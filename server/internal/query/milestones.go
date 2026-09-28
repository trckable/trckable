package query

import (
	"context"
)

// MilestoneDay is one finished day of a site, in its own time: what the
// milestones check needs, read from the session rollups (never raw events).
type MilestoneDay struct {
	Day       string // 2026-09-25
	Visitors  int64  // unique visitors that day
	Pageviews int64
	Goals     bool  // any goal reached that day
	Countries int64 // countries seen for the first time that day
}

// MilestoneDays reads a site's history day by day, up to but not including
// before (YYYY-MM-DD, the site's today): a day counts once it is over.
func (q Q) MilestoneDays(ctx context.Context, site, tz, before string) ([]MilestoneDay, error) {
	tz, err := safeTZ(tz)
	if err != nil {
		return nil, err
	}
	// The zone was checked against the zone database by safeTZ; every value
	// is bound as a parameter.
	local := `CAST(((start AT TIME ZONE 'UTC') AT TIME ZONE '` + tz + `') AS DATE)`
	//nolint:gosec // see above
	rows, err := q.DB.QueryContext(ctx, `WITH s AS (
			SELECT `+local+` AS d, visitor_id, pvs, goals, country FROM sessions WHERE site_id = ?
		), f AS (
			SELECT min(d) AS d FROM s WHERE coalesce(country, '') <> '' GROUP BY country
		), c AS (SELECT d, count(*) AS n FROM f GROUP BY d)
		SELECT strftime(s.d, '%Y-%m-%d'), count(DISTINCT s.visitor_id), sum(s.pvs), max(s.goals) > 0, coalesce(any_value(c.n), 0)
		FROM s LEFT JOIN c ON c.d = s.d
		WHERE s.d < CAST(? AS DATE)
		GROUP BY s.d ORDER BY s.d`, site, before)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MilestoneDay
	for rows.Next() {
		var d MilestoneDay
		if err := rows.Scan(&d.Day, &d.Visitors, &d.Pageviews, &d.Goals, &d.Countries); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
