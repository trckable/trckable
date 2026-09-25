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
	Pages     []NamedCount   `json:"pages,omitempty"`    // most viewed paths, last 30 minutes
	Channels  []NamedCount   `json:"channels,omitempty"` // where visitors came from, last 30 minutes
	AIShare   float64        `json:"ai_share,omitempty"` // share of the week's visitors from AI assistants
}

// NamedCount is one row of a small list: a page or a channel and its visitors.
type NamedCount struct {
	Name     string `json:"name"`
	Visitors int64  `json:"visitors"`
}

// WidgetAsk says which of the extra numbers a widget shows; nothing else is read.
type WidgetAsk struct {
	Week, Pages, Channels, AI bool
}

type CountryCount struct {
	Code     string `json:"code"`
	Visitors int64  `json:"visitors"`
}

// Widget reads them. The per-minute buckets are aligned to the minute so a
// refresh a few seconds later draws the same bars.
func (q Q) Widget(ctx context.Context, site string, now time.Time, ask WidgetAsk) (WidgetNumbers, error) {
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
	top := func(col string) ([]NamedCount, error) {
		rows, err := q.DB.QueryContext(ctx, `SELECT `+col+` AS v, count(DISTINCT visitor_id) AS n FROM events
			WHERE site_id = ? AND ts >= ? AND ts < ? GROUP BY v HAVING v IS NOT NULL AND v <> '' ORDER BY n DESC, v LIMIT 3`, site, from, end)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var list []NamedCount
		for rows.Next() {
			var c NamedCount
			if err := rows.Scan(&c.Name, &c.Visitors); err != nil {
				return nil, err
			}
			list = append(list, c)
		}
		return list, rows.Err()
	}
	if ask.Pages {
		if out.Pages, err = top("path"); err != nil {
			return out, err
		}
	}
	if ask.Channels {
		if out.Channels, err = top("coalesce(channel, 'Direct')"); err != nil {
			return out, err
		}
	}
	if ask.Week || ask.AI {
		var ai int64
		err = q.DB.QueryRowContext(ctx, `SELECT count(DISTINCT visitor_id), count(DISTINCT visitor_id) FILTER (WHERE channel = 'AI') FROM events WHERE site_id = ? AND ts >= ?`,
			site, now.UTC().Add(-7*24*time.Hour)).Scan(&out.Week, &ai)
		if out.Week > 0 {
			out.AIShare = float64(ai) / float64(out.Week)
		}
	}
	return out, err
}
