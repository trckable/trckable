package query

import (
	"context"
	"time"

	"github.com/trckable/trckable/server/internal/busier"
)

// What "busier than usual" is measured from: the people online now, and the
// people online in the same hour of past days, each by how their visit began
// (the source, entry page, campaign and country of their session). Aggregates
// only; never a visitor.

// busierSlice is the width an hour is cut in to say how many are online: the
// same five minutes Online counts.
const busierSlice = 5 * time.Minute

// busierSession is how far before a window a session's first pageview is
// looked for, to say how a visit began.
const busierSession = 3 * time.Hour

// BusierFirst is the site's first event, zero when it has none.
func (q Q) BusierFirst(ctx context.Context, site string) (time.Time, error) {
	var first *time.Time
	if err := q.DB.QueryRowContext(ctx, `SELECT min(ts) FROM events WHERE site_id = ?`, site).Scan(&first); err != nil || first == nil {
		return time.Time{}, err
	}
	return first.UTC(), nil
}

// BusierHour is how many were online in one past hour: the mean, over its
// twelve five-minute slices, of the people with an event in the slice.
func (q Q) BusierHour(ctx context.Context, site string, hour time.Time) (float64, error) {
	var n int64
	err := q.DB.QueryRowContext(ctx, `SELECT count(*) FROM (
			SELECT DISTINCT epoch_ms(ts) // 300000 AS b, visitor_id FROM events
			WHERE site_id = ? AND ts >= ? AND ts < ?)`,
		site, hour.UTC(), hour.Add(time.Hour).UTC()).Scan(&n)
	return float64(n) / float64(time.Hour/busierSlice), err
}

// BusierEntries are the people with an event in [from, to), by how their visit
// began. With slices each row is one five-minute slice's people, so a sum over
// rows counts people once per slice; without, the whole window is one slice.
func (q Q) BusierEntries(ctx context.Context, site string, from, to time.Time, slices bool) ([][]busier.Entry, error) {
	bucket := `0`
	if slices {
		bucket = `epoch_ms(ts) // 300000`
	}
	//nolint:gosec // bucket is one of two constant expressions above
	rows, err := q.DB.QueryContext(ctx, `WITH act AS (
			SELECT DISTINCT `+bucket+` AS b, session_id, visitor_id FROM events
			WHERE site_id = ? AND ts >= ? AND ts < ?),
		ent AS (
			SELECT session_id,
				arg_min(coalesce(referrer_host, ''), ts) AS host, arg_min(coalesce(channel, ''), ts) AS channel,
				arg_min(coalesce(path, ''), ts) AS page, arg_min(coalesce(utm_campaign, ''), ts) AS campaign,
				arg_min(coalesce(country, ''), ts) AS country
			FROM events
			WHERE site_id = ? AND kind = 1 AND ts >= ? AND ts < ? AND session_id IN (SELECT session_id FROM act)
			GROUP BY session_id)
		SELECT act.b, ent.host, ent.channel, ent.page, ent.campaign, ent.country, count(DISTINCT act.visitor_id)
		FROM act JOIN ent USING (session_id) GROUP BY 1, 2, 3, 4, 5, 6`,
		site, from.UTC(), to.UTC(), site, from.Add(-busierSession).UTC(), to.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out [][]busier.Entry
	at := map[int64]int{}
	for rows.Next() {
		var b int64
		var e busier.Entry
		if err := rows.Scan(&b, &e.Host, &e.Channel, &e.Page, &e.Campaign, &e.Country, &e.N); err != nil {
			return nil, err
		}
		i, ok := at[b]
		if !ok {
			i = len(out)
			at[b] = i
			out = append(out, nil)
		}
		out[i] = append(out[i], e)
	}
	return out, rows.Err()
}

// BusierMinutes is who had an event in each of the last minutes up to now,
// oldest first: one set of visitors per whole minute, the last being the
// minute running now. start is where the first begins.
func (q Q) BusierMinutes(ctx context.Context, site string, now time.Time, minutes int) (seen []map[uint64]struct{}, start time.Time, err error) {
	now = now.UTC()
	start = now.Truncate(time.Minute).Add(-time.Duration(minutes-1) * time.Minute)
	rows, err := q.DB.QueryContext(ctx, `SELECT DISTINCT (epoch_ms(ts) - ?) // 60000 AS m, visitor_id FROM events
		WHERE site_id = ? AND ts >= ? AND ts <= ?`, start.UnixMilli(), site, start, now)
	if err != nil {
		return nil, start, err
	}
	defer rows.Close()
	seen = make([]map[uint64]struct{}, minutes)
	for i := range seen {
		seen[i] = map[uint64]struct{}{}
	}
	for rows.Next() {
		var m int64
		var v uint64
		if err := rows.Scan(&m, &v); err != nil {
			return nil, start, err
		}
		if m >= 0 && m < int64(minutes) {
			seen[m][v] = struct{}{}
		}
	}
	return seen, start, rows.Err()
}
