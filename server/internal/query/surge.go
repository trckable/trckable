package query

import (
	"context"
	"sort"
	"time"
)

// What a live surge is measured from: how many are online now against how
// many usually are at this hour of this weekday, and who they are. Aggregates
// only (a count, a source, a page, a country); never a visitor.

// SurgeWeeks is how many past weeks "usual" looks back over.
const SurgeWeeks = 4

// surgeBucket is the width of the slices an hour is cut in to say how many
// people are usually on the site: the same five minutes Online counts.
const surgeBucket = 5 * time.Minute

// SurgeUsualFrom is the same for the people sent by these referring hosts.
func (q Q) SurgeUsualFrom(ctx context.Context, site string, now time.Time, loc *time.Location, hosts []string) (float64, error) {
	if len(hosts) == 0 {
		return 0, nil
	}
	marks, args := "", make([]any, 0, len(hosts))
	for i, h := range hosts {
		if i > 0 {
			marks += ", "
		}
		marks += "?"
		args = append(args, h)
	}
	u, _, err := q.surgeUsual(ctx, site, now, loc, ` AND referrer_host IN (`+marks+`)`, args)
	return u, err
}

// surgeUsual runs the median; extra narrows the events (a constant fragment
// from the two callers above, its values bound as arguments).
func (q Q) surgeUsual(ctx context.Context, site string, now time.Time, loc *time.Location, extra string, args []any) (float64, int, error) {
	var first *time.Time
	if err := q.DB.QueryRowContext(ctx, `SELECT min(start) FROM sessions WHERE site_id = ?`, site).Scan(&first); err != nil {
		return 0, 0, err
	}
	if first == nil {
		return 0, 0, nil
	}
	t := now.In(loc)
	hour := time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 0, 0, 0, loc)
	per := float64(time.Hour / surgeBucket)
	var counts []float64
	for w := 1; w <= SurgeWeeks; w++ {
		from := hour.AddDate(0, 0, -7*w)
		to := from.Add(time.Hour)
		if !to.After(*first) {
			continue
		}
		var n int64
		//nolint:gosec // extra is one of two constant fragments; values are bound
		err := q.DB.QueryRowContext(ctx, `SELECT count(*) FROM (
				SELECT epoch_ms(ts) // 300000 AS b, visitor_id FROM events
				WHERE site_id = ? AND ts >= ? AND ts < ?`+extra+` GROUP BY 1, 2)`,
			append([]any{site, from.UTC(), to.UTC()}, args...)...).Scan(&n)
		if err != nil {
			return 0, 0, err
		}
		counts = append(counts, float64(n)/per)
	}
	return median(counts), len(counts), nil
}

func median(v []float64) float64 {
	if len(v) == 0 {
		return 0
	}
	s := append([]float64(nil), v...)
	sort.Float64s(s)
	if len(s)%2 == 1 {
		return s[len(s)/2]
	}
	return (s[len(s)/2-1] + s[len(s)/2]) / 2
}

// SurgeCount is one value and how many of the people online it belongs to.
type SurgeCount struct {
	Value string `json:"value"`
	N     int64  `json:"n"`
}

// SurgeWho is who is online now, by what they have in common.
type SurgeWho struct {
	Online int64 // everyone with an event in the last five minutes
	Before int64 // the same, a quarter of an hour earlier
	// Each list: most people first.
	Hosts     []SurgeCount // the referring site, where they came from
	Channels  []SurgeCount // the channel, for people with no referring site
	Pages     []SurgeCount // the page they are on
	Countries []SurgeCount
	Campaigns []SurgeCount // utm_campaign
	Devices   []SurgeCount // mobile, desktop, tablet
}

// SurgeAhead is how far back "before" looks: the jump is told as from then to now.
const SurgeAhead = 15 * time.Minute

// SurgeWho reads the people online now. Every list counts distinct visitors.
func (q Q) SurgeWho(ctx context.Context, site string, now time.Time) (*SurgeWho, error) {
	now = now.UTC()
	out := &SurgeWho{}
	from := now.Add(-NowIdle)
	if err := q.DB.QueryRowContext(ctx, `SELECT count(DISTINCT visitor_id) FROM events WHERE site_id = ? AND ts >= ? AND ts <= ?`,
		site, from, now).Scan(&out.Online); err != nil {
		return nil, err
	}
	if err := q.DB.QueryRowContext(ctx, `SELECT count(DISTINCT visitor_id) FROM events WHERE site_id = ? AND ts >= ? AND ts <= ?`,
		site, from.Add(-SurgeAhead), now.Add(-SurgeAhead)).Scan(&out.Before); err != nil {
		return nil, err
	}
	// Each column of a pageview in the window, per visitor: one row each, so a
	// person who read three pages counts once for each value they had.
	col := func(expr string) ([]SurgeCount, error) {
		//nolint:gosec // expr is one of the constant column expressions below
		rows, err := q.DB.QueryContext(ctx, `SELECT v, count(DISTINCT visitor_id) AS n FROM (
				SELECT visitor_id, `+expr+` AS v FROM events
				WHERE site_id = ? AND kind = 1 AND ts >= ? AND ts <= ?)
			WHERE v <> '' GROUP BY v ORDER BY n DESC, v LIMIT 20`, site, from, now)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var list []SurgeCount
		for rows.Next() {
			var c SurgeCount
			if err := rows.Scan(&c.Value, &c.N); err != nil {
				return nil, err
			}
			list = append(list, c)
		}
		return list, rows.Err()
	}
	var err error
	if out.Hosts, err = col(`coalesce(referrer_host, '')`); err != nil {
		return nil, err
	}
	if out.Channels, err = col(`coalesce(nullif(channel, ''), 'Direct')`); err != nil {
		return nil, err
	}
	if out.Pages, err = col(`coalesce(path, '')`); err != nil {
		return nil, err
	}
	if out.Countries, err = col(`coalesce(country, '')`); err != nil {
		return nil, err
	}
	if out.Campaigns, err = col(`coalesce(utm_campaign, '')`); err != nil {
		return nil, err
	}
	if out.Devices, err = col(`coalesce(device, '')`); err != nil {
		return nil, err
	}
	return out, nil
}

// SurgeSlices is how many five-minute slices SurgeSeries reads: the last hour.
const SurgeSlices = 12

// SurgeSeries is how many people were active in each of the last twelve
// five-minute slices, oldest first; the last slice ends at now, so it is the
// online count itself.
func (q Q) SurgeSeries(ctx context.Context, site string, now time.Time) ([]int64, error) {
	now = now.UTC()
	start := now.Add(-SurgeSlices * surgeBucket)
	rows, err := q.DB.QueryContext(ctx, `SELECT (epoch_ms(ts) - ?) // 300000 AS b, count(DISTINCT visitor_id) FROM events
		WHERE site_id = ? AND ts > ? AND ts <= ? GROUP BY b`, start.UnixMilli(), site, start, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]int64, SurgeSlices)
	for rows.Next() {
		var b, n int64
		if err := rows.Scan(&b, &n); err != nil {
			return nil, err
		}
		if b >= 0 && b < SurgeSlices {
			out[b] = n
		}
	}
	return out, rows.Err()
}
