package query

import (
	"context"
	"fmt"
	"time"
)

// Link is one tagged link and what it brought: a ?ref tag (with the site it
// names counted in) or a utm_source. Dim and Value are the filter that shows
// only its visits, so a tap on the row can reuse the dashboard's filter.
type Link struct {
	Dim      string  `json:"dim"` // referrer | source
	Value    string  `json:"value"`
	Visitors int64   `json:"visitors"`
	Goals    int64   `json:"goals"`             // visitors who reached a goal
	Revenue  *int64  `json:"revenue,omitempty"` // set by the caller, from the report's referrer rows
	Last     int64   `json:"last"`              // unix seconds of the latest visit in the period
	Spark    []int64 `json:"spark"`             // visitors per day over the 30 days up to the period's end
}

// linkSparkDays is how many days the little chart of a link covers.
const linkSparkDays = 30

// Links returns the tagged links of the period, the busiest first, at most
// p.Limit. A link is a visit that carried a bare ?ref tag (trustmrr), or the
// visits of the site that tag names (trustmrr.com, merged by refMergeCTEs), or
// a utm_source. One scan covers the period and the days before it that the
// small charts need.
func (q Q) Links(ctx context.Context, p Params) ([]Link, error) {
	tz, err := safeTZ(p.TZ)
	if err != nil {
		return nil, err
	}
	loc, _ := time.LoadLocation(tz)
	wide := p
	if first := p.To.AddDate(0, 0, -linkSparkDays); first.Before(wide.From) {
		wide.From = first
	}
	limit := p.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if err := acquireReport(ctx); err != nil {
		return nil, err
	}
	defer releaseReport()
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)
	cte, args, err := sessionsCTEOf(wide, "*, lower(referrer) AS rawref")
	if err != nil {
		return nil, err
	}
	// k0: every visit of a link, with the filter that finds it. k folds a
	// utm_source into the ?ref row of the same name, so ?ref=newsletter and
	// ?utm_source=newsletter are one link and its counts add up.
	//nolint:gosec // only constant fragments; values are bound as parameters
	k := cte + `, tags AS (
			SELECT DISTINCT rawref AS tag FROM s WHERE rawref <> '' AND position('.' IN rawref) = 0
		), k0 AS (
			SELECT dim, CASE WHEN dim = 'referrer' THEN referrer ELSE utm_source END AS val, visitor_id, goals, start, last, lstart
			FROM (
				SELECT *, CASE
					WHEN rawref <> '' AND position('.' IN rawref) = 0 THEN 'referrer'
					WHEN ` + siteHost + ` AND split_part(rawref, '.', 1) IN (SELECT tag FROM tags) THEN 'referrer'
					WHEN utm_source <> '' THEN 'source' END AS dim
				FROM s)
			WHERE dim IS NOT NULL
		), refname AS (
			SELECT lower(split_part(val, '.', 1)) AS tag, min(val) AS val FROM k0 WHERE dim = 'referrer' GROUP BY 1
		), k AS (
			SELECT CASE WHEN r.val IS NULL THEN k0.dim ELSE 'referrer' END AS dim, coalesce(r.val, k0.val) AS val,
			       visitor_id, goals, start, last, lstart
			FROM k0 LEFT JOIN refname r ON k0.dim = 'source' AND r.tag = lower(k0.val)
		)`
	rows, err := conn.QueryContext(ctx, k+`
		SELECT dim, val, count(DISTINCT visitor_id), count(DISTINCT visitor_id) FILTER (goals > 0),
		       epoch(max(last))::BIGINT
		FROM k WHERE start >= ? AND start < ?
		GROUP BY 1, 2 ORDER BY 3 DESC, 2 LIMIT ?`, append(append([]any{}, args...), p.From, p.To, limit)...)
	if err != nil {
		return nil, fmt.Errorf("links: %w", err)
	}
	defer rows.Close()
	out := []Link{}
	at := map[[2]string]int{}
	for rows.Next() {
		var l Link
		if err := rows.Scan(&l.Dim, &l.Value, &l.Visitors, &l.Goals, &l.Last); err != nil {
			return nil, err
		}
		l.Spark = make([]int64, linkSparkDays)
		at[[2]string{l.Dim, l.Value}] = len(out)
		out = append(out, l)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	if len(out) == 0 {
		return out, nil
	}

	// The small charts: visitors per local day, the last linkSparkDays days.
	last := p.To.In(loc).Add(-time.Nanosecond)
	day0 := time.Date(last.Year(), last.Month(), last.Day()-linkSparkDays+1, 0, 0, 0, 0, loc)
	sp, err := conn.QueryContext(ctx, k+`
		SELECT dim, val, strftime(lstart, '%Y-%m-%d'), count(DISTINCT visitor_id)
		FROM k WHERE start >= ? AND start < ? GROUP BY 1, 2, 3`, append(append([]any{}, args...), day0.UTC(), p.To)...)
	if err != nil {
		return nil, fmt.Errorf("link days: %w", err)
	}
	defer sp.Close()
	for sp.Next() {
		var dim, val, day string
		var n int64
		if err := sp.Scan(&dim, &val, &day, &n); err != nil {
			return nil, err
		}
		i, ok := at[[2]string{dim, val}]
		if !ok {
			continue
		}
		d, err := time.ParseInLocation(time.DateOnly, day, loc)
		if err != nil {
			continue
		}
		if idx := int(d.Sub(day0).Hours()/24 + 0.5); idx >= 0 && idx < linkSparkDays {
			out[i].Spark[idx] = n
		}
	}
	return out, sp.Err()
}
