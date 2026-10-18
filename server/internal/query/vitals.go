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

	LCP *int64 `json:"lcp_ms,omitempty"` // largest contentful paint, ms
	CLS *int64 `json:"cls_1k,omitempty"` // cumulative layout shift, thousandths
	INP *int64 `json:"inp_ms,omitempty"` // slowest interaction, ms
	// How many page views each score is built from. A browser reports what it
	// can measure (Safari has no layout shift, a visitor who never tapped has
	// no INP), so the three differ, and a score from a handful is not shown.
	LCPn int64 `json:"lcp_n"`
	CLSn int64 `json:"cls_n"`
	INPn int64 `json:"inp_n"`

	Good    int64       `json:"good"`              // of the three, how many are in the green
	Rows    []Row       `json:"pages,omitempty"`   // the slowest pages by LCP
	Devices []VitalsRow `json:"devices,omitempty"` // the same scores, by kind of device
}

// VitalsRow is one device's scores, each at the 75th percentile.
type VitalsRow struct {
	Value string `json:"value"`
	N     int64  `json:"n"` // page views that reported anything
	LCP   *int64 `json:"lcp_ms,omitempty"`
	CLS   *int64 `json:"cls_1k,omitempty"`
	INP   *int64 `json:"inp_ms,omitempty"`
}

// Thresholds are the "good" boundaries. Above them a score is "needs work",
// and above the second it is poor — the same numbers Google publishes.
const (
	GoodLCP = 2500 // ms
	GoodCLS = 100  // thousandths, i.e. 0.1
	GoodINP = 200  // ms
)

// VitalsFor reports the 75th percentile of each score in the range, the
// pages with the worst LCP, and the scores by device. A browser reports again
// each time the page is hidden (a tab left and come back to), so what counts
// is one page view, with the largest of its reports: that is the final score
// of an LCP, a layout shift and an interaction, which only grow. The page
// views are the range's, narrowed by the filters like everywhere else.
func (q Q) VitalsFor(ctx context.Context, p Params) (*Vitals, error) {
	if p.Limit <= 0 || p.Limit > 100 {
		p.Limit = 10
	}
	if p.TZ == "" {
		p.TZ = "UTC"
	}
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)

	cte, cargs, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	// Reports arrive after their page view, so they may fall just past the
	// range's end; a day's grace covers any real page.
	with := cte + `, pv AS (
		SELECT e.pageview_id, any_value(e.path) AS path, any_value(e.device) AS device,
		       max(x.lcp_ms) AS lcp, max(x.cls_1k) AS cls, max(x.inp_ms) AS inp
		FROM events e JOIN events x
		  ON x.site_id = e.site_id AND x.pageview_id = e.pageview_id AND x.kind = 3
		 AND x.ts >= ? AND x.ts < ? + INTERVAL 1 DAY
		WHERE e.site_id = ? AND e.ts >= ? AND e.ts < ? AND e.kind = 1 AND e.path IS NOT NULL`
	args := append(append([]any{}, cargs...), p.From, p.To, p.Site, p.From, p.To)
	if len(p.Filters) > 0 {
		with += ` AND e.session_id IN (SELECT session_id FROM s)`
	}
	// "This page" is that page's own views, not every page of the visits that
	// read it: a page's speed is the page's.
	var pages []any
	for _, f := range p.Filters {
		if f.Dim == "page" && (f.Op == "" || f.Op == OpIs) {
			pages = append(pages, f.Value)
		}
	}
	if len(pages) > 0 {
		with += ` AND e.path IN (` + marks(len(pages)) + `)`
		args = append(args, pages...)
	}
	with += ` GROUP BY e.pageview_id)`

	v := &Vitals{}
	var lcp, cls, inp sql.NullFloat64
	err = conn.QueryRowContext(ctx, with+`
		SELECT count(*) FILTER (lcp IS NOT NULL OR cls IS NOT NULL OR inp IS NOT NULL),
		       count(lcp), count(cls), count(inp),
		       quantile_cont(lcp, 0.75), quantile_cont(cls, 0.75), quantile_cont(inp, 0.75)
		FROM pv`, args...).Scan(&v.Samples, &v.LCPn, &v.CLSn, &v.INPn, &lcp, &cls, &inp)
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
	rows, err := conn.QueryContext(ctx, with+`
		SELECT path, count(lcp), quantile_cont(lcp, 0.75)
		FROM pv WHERE lcp IS NOT NULL
		GROUP BY path HAVING count(lcp) >= 3 ORDER BY 3 DESC, path LIMIT ?`, append(append([]any{}, args...), p.Limit)...)
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
	if err := rows.Err(); err != nil {
		return nil, err
	}

	devs, err := conn.QueryContext(ctx, with+`
		SELECT device, count(*) FILTER (lcp IS NOT NULL OR cls IS NOT NULL OR inp IS NOT NULL),
		       quantile_cont(lcp, 0.75), quantile_cont(cls, 0.75), quantile_cont(inp, 0.75)
		FROM pv WHERE device IS NOT NULL GROUP BY device ORDER BY 2 DESC, device`, args...)
	if err != nil {
		return nil, fmt.Errorf("web vitals by device: %w", err)
	}
	defer devs.Close()
	for devs.Next() {
		var d VitalsRow
		var l, c, i sql.NullFloat64
		if err := devs.Scan(&d.Value, &d.N, &l, &c, &i); err != nil {
			return nil, err
		}
		if d.N == 0 {
			continue
		}
		for _, s := range []struct {
			dst **int64
			n   sql.NullFloat64
		}{{&d.LCP, l}, {&d.CLS, c}, {&d.INP, i}} {
			if s.n.Valid {
				x := int64(s.n.Float64 + 0.5)
				*s.dst = &x
			}
		}
		v.Devices = append(v.Devices, d)
	}
	return v, devs.Err()
}
