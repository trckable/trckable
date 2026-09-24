package query

import (
	"context"
	"fmt"
	"time"
)

// Retention: of the people who first came in a given week, how many came back
// in the weeks after. It is the one number that says whether a site is
// building an audience or renting one.
//
// A visitor's cohort is the week they were first seen, which the tracker
// records in the id cookie — so someone who first arrived two years ago is
// not counted as new because this report starts on Monday.

// Cohorts is the retention grid.
type Cohorts struct {
	// Weeks is the cohort start (YYYY-MM-DD, local), oldest first.
	Weeks []string `json:"weeks"`
	// Size is how many people each cohort started with.
	Size []int64 `json:"size"`
	// Back[i][k] is how many of cohort i came back in week k (k = 0 is the
	// week they arrived, so it always equals Size[i]).
	Back [][]int64 `json:"back"`
}

// MaxCohorts is how many weeks the grid shows. Past that it stops being
// readable and starts being a wall.
const MaxCohorts = 12

// Retention builds the grid for the report's range.
func (q Q) Retention(ctx context.Context, p Params) (*Cohorts, error) {
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)
	tz, err := safeTZ(p.TZ)
	if err != nil {
		return nil, err
	}
	// Cohorts are about people, not about the filtered slice of their visits,
	// so this reads the site's sessions rather than the filtered CTE.
	local := func(col string) string {
		return `date_trunc('week', ((` + col + ` AT TIME ZONE 'UTC') AT TIME ZONE '` + tz + `'))`
	}
	// The first cohort week that this range covers from its very start.
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	fromLocal := p.From.In(loc).Format("2006-01-02 15:04:05")
	rows, err := conn.QueryContext(ctx, `
		WITH v AS (
			SELECT visitor_id, first_seen, start FROM sessions WHERE site_id = ? AND start >= ? AND start < ? AND first_seen IS NOT NULL
			UNION ALL
			SELECT visitor_id, first_seen, start FROM s_open WHERE site_id = ? AND start >= ? AND start < ? AND first_seen IS NOT NULL
		),
		c AS (SELECT visitor_id, `+local("min(first_seen)")+` AS cohort FROM v GROUP BY visitor_id),
		a AS (
			SELECT DISTINCT c.cohort, v.visitor_id, date_diff('week', c.cohort, `+local("v.start")+`) AS k
			FROM v JOIN c USING (visitor_id)
			-- Somebody first seen weeks before this range belongs to a cohort
			-- whose week zero this report never reads. Counting their return
			-- visits against it is how a grid ends up saying "102 of 0 came
			-- back". The boundary is the week the range starts in, so a range
			-- that begins on a Tuesday still shows that week's cohort.
			WHERE c.cohort >= date_trunc('week', CAST(? AS TIMESTAMP))
		)
		SELECT strftime(cohort, '%Y-%m-%d'), k, count(*) FROM a WHERE k >= 0 AND k < ? GROUP BY 1, 2 ORDER BY 1, 2`,
		p.Site, p.From, p.To, p.Site, p.From, p.To, fromLocal, MaxCohorts)
	if err != nil {
		return nil, fmt.Errorf("retention: %w", err)
	}
	defer rows.Close()

	byWeek := map[string][]int64{}
	var order []string
	for rows.Next() {
		var week string
		var k, n int64
		if err := rows.Scan(&week, &k, &n); err != nil {
			return nil, err
		}
		if _, ok := byWeek[week]; !ok {
			byWeek[week] = make([]int64, MaxCohorts)
			order = append(order, week)
		}
		if k >= 0 && k < MaxCohorts {
			byWeek[week][k] = n
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := &Cohorts{}
	// Oldest first, and no more than the grid holds.
	if len(order) > MaxCohorts {
		order = order[len(order)-MaxCohorts:]
	}
	for _, w := range order {
		row := byWeek[w]
		// A cohort nobody started is not a cohort. This cannot happen now
		// that week zero is always inside the range, and it is cheap to make
		// sure a division by it never reaches a page.
		if row[0] == 0 {
			continue
		}
		// A week's row only reaches as far as that week is old: showing zeros
		// for weeks that have not happened yet would read as people leaving.
		weeks := weeksSince(w, p.To, tz)
		if weeks > MaxCohorts {
			weeks = MaxCohorts
		}
		if weeks < 1 {
			weeks = 1
		}
		out.Weeks = append(out.Weeks, w)
		out.Size = append(out.Size, row[0])
		out.Back = append(out.Back, row[:weeks])
	}
	return out, nil
}

// weeksSince counts the weekly columns a cohort can have: only the weeks this
// range covers from end to end. A week that has barely started would show
// almost nobody, and that reads as people leaving rather than as a week that
// has not happened yet.
func weeksSince(week string, to time.Time, tz string) int {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	start, err := time.ParseInLocation("2006-01-02", week, loc)
	if err != nil {
		return 1
	}
	return int(to.In(loc).Sub(start).Hours() / (24 * 7))
}
