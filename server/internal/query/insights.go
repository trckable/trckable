package query

import (
	"context"
	"time"
)

// NewReferrer is a referring site whose first visitor ever came in the range.
type NewReferrer struct {
	Referrer string `json:"referrer"`
	Visitors int64  `json:"visitors"`
}

// NewReferrers lists the referring sites that sent nobody before `from` and
// somebody in [from, to), the busiest first, at most limit of them. Read from
// the session rollups: a site's name and a count, never a visitor.
func (q Q) NewReferrers(ctx context.Context, site string, from, to time.Time, limit int) ([]NewReferrer, error) {
	rows, err := q.DB.QueryContext(ctx, `SELECT referrer, count(DISTINCT visitor_id) AS n FROM sessions
		WHERE site_id = ? AND start >= ? AND start < ? AND coalesce(referrer, '') <> ''
		  AND referrer NOT IN (SELECT DISTINCT referrer FROM sessions WHERE site_id = ? AND start < ? AND coalesce(referrer, '') <> '')
		GROUP BY referrer ORDER BY n DESC, referrer LIMIT ?`, site, from, to, site, from, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []NewReferrer{}
	for rows.Next() {
		var r NewReferrer
		if err := rows.Scan(&r.Referrer, &r.Visitors); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
