package query

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// NewReferrer is a referring site whose first visitor in a year came in the range.
type NewReferrer struct {
	Referrer string `json:"referrer"`
	Visitors int64  `json:"visitors"`
}

// NewReferrerLookback is how far back a referrer must have been absent to be
// new: a site that sent someone in the year before is not news. It also bounds
// the scan, which reads this much history and no more.
const NewReferrerLookback = 365 * 24 * time.Hour

// newReferrers lists the referring sites that sent nobody in the year before
// p.From and somebody in [p.From, p.To), the busiest first, at most
// p.NewReferrers of them. It reads the session rollups, closed and still open:
// a site's name and a count, never a visitor. Filters do not apply: it is about
// the whole site.
func newReferrers(ctx context.Context, conn *sql.Conn, p Params) ([]NewReferrer, error) {
	from := p.From.Add(-NewReferrerLookback)
	rows, err := conn.QueryContext(ctx, `WITH w AS (
			SELECT referrer, visitor_id, start FROM sessions WHERE site_id = ? AND start >= ? AND start < ? AND coalesce(referrer, '') <> ''
			UNION ALL
			SELECT referrer, visitor_id, start FROM s_open WHERE site_id = ? AND start >= ? AND start < ? AND coalesce(referrer, '') <> ''
		)
		SELECT referrer, count(DISTINCT visitor_id) AS n FROM w
		WHERE start >= ? AND referrer NOT IN (SELECT referrer FROM w WHERE start < ?)
		GROUP BY referrer ORDER BY n DESC, referrer LIMIT ?`, p.Site, from, p.To, p.Site, from, p.To, p.From, p.From, p.NewReferrers)
	if err != nil {
		return nil, fmt.Errorf("new referrers: %w", err)
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
