package query

import (
	"context"
	"time"
)

// CountryFirst is a country's first visit ever, by the hour it happened (the
// site's own clock, "2026-09-27T20:00"). Read from the session rollups: a
// country and an hour, never a visitor.
type CountryFirst struct {
	Country string `json:"country"`
	At      string `json:"t"`
}

// CountryFirsts lists the countries whose first visit ever falls in
// [from, to), earliest first, at most limit of them.
func (q Q) CountryFirsts(ctx context.Context, site, tz string, from, to time.Time, limit int) ([]CountryFirst, error) {
	tz, err := safeTZ(tz)
	if err != nil {
		return nil, err
	}
	// The zone was checked against the zone database by safeTZ; every value
	// is bound as a parameter.
	//nolint:gosec // see above
	rows, err := q.DB.QueryContext(ctx, `SELECT country, strftime(date_trunc('hour', (min(start) AT TIME ZONE 'UTC') AT TIME ZONE '`+tz+`'), '%Y-%m-%dT%H:%M') AS t
		FROM sessions WHERE site_id = ? AND coalesce(country, '') <> ''
		GROUP BY country HAVING min(start) >= ? AND min(start) < ?
		ORDER BY t, country LIMIT ?`, site, from, to, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CountryFirst{}
	for rows.Next() {
		var c CountryFirst
		if err := rows.Scan(&c.Country, &c.At); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// TopReferrer is the referring site that sent the most visitors in
// [from, to): the "from where" of a spike. Empty when nobody was referred.
func (q Q) TopReferrer(ctx context.Context, site string, from, to time.Time) (string, error) {
	var ref string
	err := q.DB.QueryRowContext(ctx, `SELECT coalesce(max_by(referrer, n), '') FROM (
			SELECT referrer, count(DISTINCT visitor_id) AS n FROM sessions
			WHERE site_id = ? AND start >= ? AND start < ? AND coalesce(referrer, '') <> ''
			GROUP BY referrer
		)`, site, from, to).Scan(&ref)
	return ref, err
}
