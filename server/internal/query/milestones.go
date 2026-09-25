package query

import (
	"context"
	"time"
)

// Milestone is a moment worth celebrating that the data itself shows: when
// the site passed 10,000 visitors, its best day, its first visit from an AI
// assistant. Nothing is estimated: each one is a count and the day it was
// reached, in the site's own time.
type Milestone struct {
	ID    string `json:"id"`   // stable, so the dashboard shows each one once
	Kind  string `json:"kind"` // visitors, best_day, first_ai, first_sale
	Value int64  `json:"value"`
	Day   string `json:"day"` // 2026-09-25, local
}

var visitorSteps = []int64{100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000}

// Milestones reads the ones the site has reached.
func (q Q) Milestones(ctx context.Context, site, tz string) ([]Milestone, error) {
	tz, err := safeTZ(tz)
	if err != nil {
		return nil, err
	}
	local := func(col string) string { return `CAST(((` + col + ` AT TIME ZONE 'UTC') AT TIME ZONE '` + tz + `') AS DATE)` }
	var out []Milestone

	// Visitors, all time: the day each step was crossed, from first visits.
	rows, err := q.DB.QueryContext(ctx, `WITH f AS (SELECT visitor_id, min(start) AS s FROM sessions WHERE site_id = ? GROUP BY visitor_id)
		SELECT strftime(`+local("s")+`, '%Y-%m-%d') AS d, count(*) FROM f GROUP BY d ORDER BY d`, site)
	if err != nil {
		return nil, err
	}
	var total int64
	step := 0
	for rows.Next() {
		var day string
		var n int64
		if err := rows.Scan(&day, &n); err != nil {
			rows.Close()
			return nil, err
		}
		total += n
		for step < len(visitorSteps) && total >= visitorSteps[step] {
			v := visitorSteps[step]
			out = append(out, Milestone{ID: "visitors-" + itoa(v), Kind: "visitors", Value: v, Day: day})
			step++
		}
	}
	rows.Close()

	// The best day so far, once there is some history to beat.
	var day string
	var best, days int64
	if err := q.DB.QueryRowContext(ctx, `WITH d AS (SELECT strftime(`+local("start")+`, '%Y-%m-%d') AS d, count(DISTINCT visitor_id) AS n FROM sessions WHERE site_id = ? GROUP BY d)
		SELECT (SELECT count(*) FROM d), d, n FROM d ORDER BY n DESC, d DESC LIMIT 1`, site).Scan(&days, &day, &best); err == nil && days >= 14 && best > 0 {
		out = append(out, Milestone{ID: "best-day-" + day, Kind: "best_day", Value: best, Day: day})
	}

	// The first visitor sent by an AI assistant.
	var ai *time.Time
	if err := q.DB.QueryRowContext(ctx, `SELECT min(start) FROM sessions WHERE site_id = ? AND channel = 'AI'`, site).Scan(&ai); err == nil && ai != nil {
		d := ai.In(mustLoc(tz)).Format("2006-01-02")
		out = append(out, Milestone{ID: "first-ai", Kind: "first_ai", Value: 1, Day: d})
	}
	return out, nil
}

func mustLoc(tz string) *time.Location {
	if l, err := time.LoadLocation(tz); err == nil {
		return l
	}
	return time.UTC
}

func itoa(n int64) string {
	b := []byte{}
	if n == 0 {
		return "0"
	}
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
