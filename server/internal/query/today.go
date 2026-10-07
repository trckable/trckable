package query

import (
	"context"
	"time"
)

// Live's "today so far": the visitors a site has had since its day began, set
// against the same weekday a week ago up to the same time of day, and each
// day's running total hour by hour, for the card's two lines.

// NowToday is today so far in the site's own day.
type NowToday struct {
	Visitors int64 `json:"visitors"`
	// Before is last week's visitors up to this time of day; Compare is false
	// when the site had no visit that day, so no percentage is drawn.
	Before  int64 `json:"before"`
	Compare bool  `json:"compare"`
	// Hours and Last are running totals of new visitors per hour, 24 long for
	// last week's whole day, and from midnight to the hour running now for today.
	Hours []int64 `json:"hours"`
	Last  []int64 `json:"last"`
}

// LiveToday reads today so far in loc, the site's time zone.
func (q Q) LiveToday(ctx context.Context, site string, now time.Time, loc *time.Location) (*NowToday, error) {
	local := now.In(loc)
	day := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	lastDay := day.AddDate(0, 0, -7)
	sameTime := local.AddDate(0, 0, -7)
	out := &NowToday{}
	var err error
	if out.Hours, err = q.hourlyVisitors(ctx, site, day, now, local.Hour()+1); err != nil {
		return nil, err
	}
	if out.Last, err = q.hourlyVisitors(ctx, site, lastDay, lastDay.AddDate(0, 0, 1), 24); err != nil {
		return nil, err
	}
	out.Visitors = out.Hours[len(out.Hours)-1]
	if out.Last[len(out.Last)-1] > 0 {
		out.Compare = true
		err = q.DB.QueryRowContext(ctx, `
			SELECT count(DISTINCT visitor_id) FROM events
			WHERE site_id = ? AND kind = 1 AND ts >= ? AND ts <= ?`,
			site, lastDay, sameTime).Scan(&out.Before)
		if err != nil {
			return nil, err
		}
	}
	return out, nil
}

// hourlyVisitors is the running count of distinct visitors by hour, each
// counted in the hour of their first page in [from, to), n hours long.
func (q Q) hourlyVisitors(ctx context.Context, site string, from, to time.Time, n int) ([]int64, error) {
	rows, err := q.DB.QueryContext(ctx, `
		SELECT h, count(*) FROM (
			SELECT visitor_id, (epoch_ms(min(ts)) - ?) // 3600000 AS h
			FROM events
			WHERE site_id = ? AND kind = 1 AND ts >= ? AND ts < ?
			GROUP BY visitor_id
		) GROUP BY h`,
		from.UnixMilli(), site, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]int64, n)
	for rows.Next() {
		var h, c int64
		if err := rows.Scan(&h, &c); err != nil {
			return nil, err
		}
		// A day with a clock change has 23 or 25 hours: the odd ones land in the ends.
		out[min(max(h, 0), int64(n-1))] += c
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := 1; i < n; i++ {
		out[i] += out[i-1]
	}
	return out, rows.Err()
}
