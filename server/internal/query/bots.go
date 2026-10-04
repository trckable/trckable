package query

import (
	"context"
	"time"
)

// Bots is what the ingest endpoint turned away over a period: robots, AI
// crawlers, headless browsers and data-centre visits. It is the number behind
// "filtered" on the Visitors tile, and never part of Visitors.
type Bots struct {
	Total int64            `json:"total"`
	Kinds map[string]int64 `json:"kinds"` // bot | ai-crawler | headless | hosting
}

// Bots sums the site's bot counters over the days of [p.From, p.To) as the
// period names them. The counters are kept per UTC day, so a site far from UTC
// sees its first and last days shifted by the hours between: a count of how
// much was filtered, not a visit list.
func (q Q) Bots(ctx context.Context, p Params) (*Bots, error) {
	loc, err := time.LoadLocation(p.TZ)
	if err != nil {
		loc = time.UTC
	}
	from := p.From.In(loc).Format(time.DateOnly)
	to := p.To.In(loc).Add(-time.Nanosecond).AddDate(0, 0, 1).Format(time.DateOnly)
	rows, err := q.DB.QueryContext(ctx, `
		SELECT kind, sum(n)::BIGINT FROM bot_daily
		WHERE site_id = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE)
		GROUP BY kind`, p.Site, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := &Bots{Kinds: map[string]int64{}}
	for rows.Next() {
		var kind string
		var n int64
		if err := rows.Scan(&kind, &n); err != nil {
			return nil, err
		}
		out.Kinds[kind] = n
		out.Total += n
	}
	return out, rows.Err()
}
