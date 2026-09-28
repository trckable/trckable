package query

import (
	"context"
	"database/sql"
	"fmt"
)

// Core Web Vitals, as the browsers on the site measured them. Reported at the
// 75th percentile, which is how Google scores a site: the experience three
// quarters of visits were at least as good as, not the average nobody had.

// Vitals is one period's scores, with the thresholds Google uses.
type Vitals struct {
	Samples int64 `json:"samples"` // page views that reported anything

	LCP  *int64 `json:"lcp_ms,omitempty"` // largest contentful paint, ms
	CLS  *int64 `json:"cls_1k,omitempty"` // cumulative layout shift, thousandths
	INP  *int64 `json:"inp_ms,omitempty"` // slowest interaction, ms
	Good int64  `json:"good"`             // of the three, how many are in the green
	Rows []Row  `json:"pages,omitempty"`  // the slowest pages by LCP
}

// Thresholds are the "good" boundaries. Above them a score is "needs work",
// and above the second it is poor — the same numbers Google publishes.
const (
	GoodLCP = 2500 // ms
	GoodCLS = 100  // thousandths, i.e. 0.1
	GoodINP = 200  // ms
)

// VitalsFor reports the 75th percentile of each score in the range, and the
// pages with the worst LCP. It reads the engagement events, which is where a
// browser's measurements arrive.
func (q Q) VitalsFor(ctx context.Context, p Params) (*Vitals, error) {
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)
	where, args := eventScope(p)

	v := &Vitals{}
	var lcp, cls, inp sql.NullFloat64
	err = conn.QueryRowContext(ctx, `
		SELECT count(*) FILTER (lcp_ms IS NOT NULL OR cls_1k IS NOT NULL OR inp_ms IS NOT NULL),
		       quantile_cont(lcp_ms, 0.75), quantile_cont(cls_1k, 0.75), quantile_cont(inp_ms, 0.75)
		FROM events WHERE `+where+` AND kind = 3`, args...).Scan(&v.Samples, &lcp, &cls, &inp)
	if err != nil {
		return nil, fmt.Errorf("web vitals: %w", err)
	}
	if v.Samples == 0 {
		return v, nil
	}
	set := func(dst **int64, n sql.NullFloat64, good int64) {
		if !n.Valid {
			return
		}
		x := int64(n.Float64 + 0.5)
		*dst = &x
		if x <= good {
			v.Good++
		}
	}
	set(&v.LCP, lcp, GoodLCP)
	set(&v.CLS, cls, GoodCLS)
	set(&v.INP, inp, GoodINP)

	// The pages worth fixing first: slowest by LCP, with enough views to mean
	// something.
	rows, err := conn.QueryContext(ctx, `
		SELECT e.path, count(*), quantile_cont(v.lcp_ms, 0.75)
		FROM events v JOIN events e ON e.site_id = v.site_id AND e.pageview_id = v.pageview_id AND e.kind = 1
		WHERE v.site_id = ? AND v.ts >= ? AND v.ts < ? AND v.kind = 3 AND v.lcp_ms IS NOT NULL AND e.path IS NOT NULL
		GROUP BY e.path HAVING count(*) >= 3 ORDER BY 3 DESC LIMIT ?`, append(append([]any{}, args...), p.Limit)...)
	if err != nil {
		return nil, fmt.Errorf("web vitals by page: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var r Row
		var at float64
		if err := rows.Scan(&r.Value, &r.Pageviews, &at); err != nil {
			return nil, err
		}
		r.Visitors = int64(at + 0.5) // the page's own p75 LCP, in ms
		v.Rows = append(v.Rows, r)
	}
	return v, rows.Err()
}
