package query

import (
	"context"
	"time"
)

// WidgetNumbers are the few numbers a public widget can show: who is here
// now (the last 30 minutes, minute by minute), where from, and how many came
// this week. Nothing else about the site is read for a widget.
type WidgetNumbers struct {
	Now       int64          `json:"now"`     // distinct visitors, last 30 minutes
	Minutes   [30]int64      `json:"minutes"` // oldest first; the last is the current minute
	Countries []CountryCount `json:"countries"`
	Week      int64          `json:"week"` // distinct visitors, last 7 days
}

type CountryCount struct {
	Code     string `json:"code"`
	Visitors int64  `json:"visitors"`
}

// Widget reads them. The per-minute buckets are aligned to the minute so a
// refresh a few seconds later draws the same bars.
func (q Q) Widget(ctx context.Context, site string, now time.Time, week bool) (WidgetNumbers, error) {
	var out WidgetNumbers
	end := now.UTC().Truncate(time.Minute).Add(time.Minute)
	from := end.Add(-30 * time.Minute)
	if err := q.DB.QueryRowContext(ctx, `SELECT count(DISTINCT visitor_id) FROM events WHERE site_id = ? AND ts >= ? AND ts < ?`, site, from, end).Scan(&out.Now); err != nil {
		return out, err
	}
	rows, err := q.DB.QueryContext(ctx, `SELECT date_diff('minute', CAST(? AS TIMESTAMP), date_trunc('minute', ts)) AS m, count(DISTINCT visitor_id)
		FROM events WHERE site_id = ? AND ts >= ? AND ts < ? GROUP BY m`, from, site, from, end)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var m, n int64
		if err := rows.Scan(&m, &n); err != nil {
			rows.Close()
			return out, err
		}
		if m >= 0 && m < 30 {
			out.Minutes[m] = n
		}
	}
	rows.Close()
	rows, err = q.DB.QueryContext(ctx, `SELECT country, count(DISTINCT visitor_id) AS n FROM events
		WHERE site_id = ? AND ts >= ? AND ts < ? AND coalesce(country, '') <> '' GROUP BY country ORDER BY n DESC, country LIMIT 3`, site, from, end)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var c CountryCount
		if err := rows.Scan(&c.Code, &c.Visitors); err != nil {
			rows.Close()
			return out, err
		}
		out.Countries = append(out.Countries, c)
	}
	rows.Close()
	if week {
		err = q.DB.QueryRowContext(ctx, `SELECT count(DISTINCT visitor_id) FROM events WHERE site_id = ? AND ts >= ?`, site, now.UTC().Add(-7*24*time.Hour)).Scan(&out.Week)
	}
	return out, err
}
