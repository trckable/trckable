package query

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// A site's headline for the all-sites view: the numbers someone with twelve
// sites scans first. It is one small scan of the session rollup per site,
// never the whole report, so a long list stays fast.

// Summary is one site's period at a glance.
type Summary struct {
	Visitors  int64   `json:"visitors"`
	Pageviews int64   `json:"pageviews"`
	Bounce    float64 `json:"bounce_rate"`
	Series    []int64 `json:"series"` // visitors per bucket, gap-filled
	// The same buckets for the other cards: pageviews, sessions (the weight of
	// a bucket's bounce rate when sites are added up) and that bounce rate.
	PageviewSeries []int64   `json:"pageview_series"`
	SessionSeries  []int64   `json:"session_series"`
	BounceSeries   []float64 `json:"bounce_series"`
	Revenue        *int64    `json:"revenue,omitempty"` // net revenue, minor units, when payments are connected
}

// SiteSummary reads the headline numbers for p (its filters are ignored: this
// is the whole site). p.Revenue asks for the period's revenue too.
func (q Q) SiteSummary(ctx context.Context, p Params) (*Summary, error) {
	if p.TZ == "" {
		p.TZ = "UTC"
	}
	if safeBucket(p.Bucket) != p.Bucket || p.Bucket == "" {
		p.Bucket = "day"
	}
	p.Filters = nil
	if err := acquireReport(ctx); err != nil {
		return nil, err
	}
	defer releaseReport()
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)
	cte, args, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	s := &Summary{}
	if err := conn.QueryRowContext(ctx, cte+`
		SELECT count(DISTINCT visitor_id), coalesce(sum(pvs), 0), coalesce(avg(`+bounce+`), 0) FROM s`, args...).
		Scan(&s.Visitors, &s.Pageviews, &s.Bounce); err != nil {
		return nil, fmt.Errorf("summary: %w", err)
	}
	rows, err := conn.QueryContext(ctx, cte+`
		SELECT `+bucketOf(p, "lstart")+` AS b, count(DISTINCT visitor_id), sum(pvs), count(*), avg(`+bounce+`) FROM s GROUP BY b`, args...)
	if err != nil {
		return nil, fmt.Errorf("summary series: %w", err)
	}
	got := map[string]Point{}
	sessions := map[string]int64{}
	for rows.Next() {
		var pt Point
		var b time.Time
		var n int64
		var br sql.NullFloat64
		if err := rows.Scan(&b, &pt.Visitors, &pt.Pageviews, &n, &br); err != nil {
			rows.Close()
			return nil, err
		}
		pt.T = b.Format(localLayout)
		pt.Bounce = br.Float64
		sessions[pt.T] = n
		got[pt.T] = pt
	}
	rows.Close()
	for _, pt := range fillSeries(got, p) {
		s.Series = append(s.Series, pt.Visitors)
		s.PageviewSeries = append(s.PageviewSeries, pt.Pageviews)
		s.SessionSeries = append(s.SessionSeries, sessions[pt.T])
		s.BounceSeries = append(s.BounceSeries, pt.Bounce)
	}
	if p.Revenue && q.Payments != nil {
		facts, on, err := q.Payments(ctx, p.Site, p.Currency, p.From, p.To, p.Test)
		if err != nil {
			return nil, fmt.Errorf("summary revenue: %w", err)
		}
		if on {
			var net int64
			for _, f := range facts {
				if f.Converted {
					net += f.Amount - f.Refunded
				}
			}
			s.Revenue = &net
		}
	}
	return s, nil
}
