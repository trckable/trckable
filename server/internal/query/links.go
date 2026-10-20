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
	Key      string  `json:"key"` // the "link" filter value that finds every visit of this row, both spellings of the tag
	Visitors int64   `json:"visitors"`
	Goals    int64   `json:"goals"`             // visitors who reached a goal
	Revenue  *int64  `json:"revenue,omitempty"` // set by the caller, from the report's referrer rows
	Last     int64   `json:"last"`              // unix seconds of the latest visit in the period
	Spark    []int64 `json:"spark"`             // visitors per day over the 30 days up to the period's end
}

// linkRef is the tag of a visit that came by ?ref: the tag itself, or the
// label of the site a tag names (trustmrr.com) when that tag was seen in the
// period. NULL for any other visit. The tags are the bare referrers of the
// period's raw sessions, so a plain site with no tag seen is not a link.
const linkRef = `CASE WHEN referrer <> '' AND position('.' IN referrer) = 0 THEN lower(referrer)
		WHEN ` + siteHost + ` AND lower(split_part(referrer, '.', 1)) IN
			(SELECT DISTINCT lower(referrer) FROM raw WHERE referrer <> '' AND position('.' IN referrer) = 0)
		THEN lower(split_part(referrer, '.', 1)) END`

// linkUTM is the tag of a visit that carried a utm_source.
const linkUTM = `nullif(lower(utm_source), '')`

// linkKey is the "link" filter and the key of a row of Your links: the ?ref
// tag, else the utm_source, so a row and the filter its tap applies are the
// same predicate and count the same visits.
const linkKey = `coalesce(` + linkRef + `, ` + linkUTM + `)`

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
	// k0: every visit of a link, by the same key the "link" filter uses. k
	// shows a utm_source under the ?ref row of the same name, so
	// ?ref=newsletter and ?utm_source=newsletter are one link.
	//nolint:gosec // only constant fragments; values are bound as parameters
	k := cte + `, k0 AS (
			SELECT key, CASE WHEN rk IS NOT NULL THEN 'referrer' ELSE 'source' END AS dim,
			       CASE WHEN rk IS NOT NULL THEN referrer ELSE key END AS val, visitor_id, goals, start, last, lstart
			FROM (SELECT *, ` + linkRef + ` AS rk, ` + linkKey + ` AS key FROM s)
			WHERE key IS NOT NULL
		), refname AS (
			SELECT key, min(val) AS val FROM k0 WHERE dim = 'referrer' GROUP BY 1
		), k AS (
			SELECT k0.key, CASE WHEN r.val IS NULL THEN k0.dim ELSE 'referrer' END AS dim, coalesce(r.val, k0.val) AS val,
			       visitor_id, goals, start, last, lstart
			FROM k0 LEFT JOIN refname r ON r.key = k0.key
		)`
	rows, err := conn.QueryContext(ctx, k+`
		SELECT dim, val, any_value(key), count(DISTINCT visitor_id), count(DISTINCT visitor_id) FILTER (goals > 0),
		       epoch(max(last))::BIGINT
		FROM k WHERE start >= ? AND start < ?
		GROUP BY 1, 2 ORDER BY 4 DESC, 2 LIMIT ?`, append(append([]any{}, args...), p.From, p.To, limit)...)
	if err != nil {
		return nil, fmt.Errorf("links: %w", err)
	}
	defer rows.Close()
	out := []Link{}
	at := map[[2]string]int{}
	for rows.Next() {
		var l Link
		if err := rows.Scan(&l.Dim, &l.Value, &l.Key, &l.Visitors, &l.Goals, &l.Last); err != nil {
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
