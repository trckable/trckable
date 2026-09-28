package query

import (
	"context"
	"strconv"
	"time"
)

// Live mode's numbers: the last 30 minutes, read straight from the events
// (every event is committed there the moment it is written, so nothing
// waits for a session to close). Filters never apply: Live is always the
// whole site, right now.

// NowMinutes is how many one-minute buckets the Live chart shows.
const NowMinutes = 30

// NowWindow is the stretch "visitors" and "sources" count over; Previous is
// the same length just before it.
const NowWindow = 30 * time.Minute

// NowIdle is how long a visitor stays "on the site" after their last event:
// the same five minutes Online counts.
const NowIdle = 5 * time.Minute

// NowRows caps the list of who is on the site.
const NowRows = 50

// Now is Live mode's picture of a site at one moment.
type Now struct {
	At int64 `json:"at"` // unix ms the numbers were taken at
	// Start is where Minutes[0] begins (unix ms, on a whole minute); the last
	// bucket is the minute running now, so the chart moves once a minute.
	Start   int64   `json:"start"`
	Minutes []int64 `json:"minutes"` // pageviews per minute, oldest first
	Online  int64   `json:"online"`
	// Visitors viewed a page in the last 30 minutes; Previous in the 30
	// before that.
	Visitors int64       `json:"visitors"`
	Previous int64       `json:"previous"`
	Sources  []NowSource `json:"sources"`
	Recent   []NowVisit  `json:"recent"`
}

// NowSource is one channel's visitors in the last 30 minutes.
type NowSource struct {
	Channel  string `json:"channel"`
	Visitors int64  `json:"visitors"`
}

// NowVisit is one visitor on the site now: their latest page (or goal) and
// when they were last seen doing anything. Its fields are named as the live
// stream's visits are, so the dashboard reads both the same way.
type NowVisit struct {
	Kind    string `json:"kind"` // pageview | goal
	TS      int64  `json:"ts"`   // unix ms of that page or goal
	Last    int64  `json:"last"` // unix ms of their latest event of any kind
	Path    string `json:"path,omitempty"`
	Goal    string `json:"goal,omitempty"`
	Channel string `json:"channel,omitempty"`
	Ref     string `json:"referrer,omitempty"`
	Country string `json:"country,omitempty"`
	City    string `json:"city,omitempty"`
	Device  string `json:"device,omitempty"`
	Browser string `json:"browser,omitempty"`
	Visitor string `json:"visitor,omitempty"` // only when asked for (the journeys module)
}

// LiveNow reads the last 30 minutes of a site. withVisitor says whether each
// row may carry the visitor's pseudonymous id.
func (q Q) LiveNow(ctx context.Context, site string, now time.Time, withVisitor bool) (*Now, error) {
	now = now.UTC()
	start := now.Truncate(time.Minute).Add(-(NowMinutes - 1) * time.Minute)
	out := &Now{At: now.UnixMilli(), Start: start.UnixMilli(), Minutes: make([]int64, NowMinutes), Sources: []NowSource{}, Recent: []NowVisit{}}

	rows, err := q.DB.QueryContext(ctx, `
		SELECT (epoch_ms(ts) - ?) // 60000 AS m, count(*)
		FROM events
		WHERE site_id = ? AND kind = 1 AND ts >= ? AND ts <= ?
		GROUP BY m`,
		start.UnixMilli(), site, start, now)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var m, n int64
		if err := rows.Scan(&m, &n); err != nil {
			rows.Close()
			return nil, err
		}
		if m >= 0 && m < NowMinutes {
			out.Minutes[m] = n
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	from, before := now.Add(-NowWindow), now.Add(-2*NowWindow)
	err = q.DB.QueryRowContext(ctx, `
		SELECT count(DISTINCT visitor_id) FILTER (WHERE ts >= ?),
		       count(DISTINCT visitor_id) FILTER (WHERE ts < ?)
		FROM events
		WHERE site_id = ? AND kind = 1 AND ts >= ? AND ts <= ?`,
		from, from, site, before, now).Scan(&out.Visitors, &out.Previous)
	if err != nil {
		return nil, err
	}

	rows, err = q.DB.QueryContext(ctx, `
		SELECT coalesce(nullif(channel, ''), 'Direct') AS c, count(DISTINCT visitor_id) AS n
		FROM events
		WHERE site_id = ? AND kind = 1 AND ts >= ? AND ts <= ?
		GROUP BY c ORDER BY n DESC, c`,
		site, from, now)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var s NowSource
		if err := rows.Scan(&s.Channel, &s.Visitors); err != nil {
			rows.Close()
			return nil, err
		}
		out.Sources = append(out.Sources, s)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if out.Online, err = q.Online(ctx, site, now); err != nil {
		return nil, err
	}
	if out.Recent, err = q.onSite(ctx, site, now, withVisitor); err != nil {
		return nil, err
	}
	return out, nil
}

// onSite is everyone Online counts (any event in the last five minutes) who
// viewed a page or reached a goal in the last 30: one row each, their latest
// one, most recently active first.
func (q Q) onSite(ctx context.Context, site string, now time.Time, withVisitor bool) ([]NowVisit, error) {
	rows, err := q.DB.QueryContext(ctx, `
		WITH act AS (
			SELECT visitor_id, max(ts) AS last
			FROM events WHERE site_id = ? AND ts >= ? AND ts <= ?
			GROUP BY visitor_id
		), pv AS (
			SELECT visitor_id, ts, kind, coalesce(path, '') AS path, coalesce(goal, '') AS goal,
			       coalesce(channel, '') AS channel, coalesce(referrer_host, '') AS ref,
			       coalesce(country, '') AS country, coalesce(city, '') AS city,
			       coalesce(device, '') AS device, coalesce(browser, '') AS browser,
			       row_number() OVER (PARTITION BY visitor_id ORDER BY ts DESC, seq DESC) AS rn
			FROM events
			WHERE site_id = ? AND kind IN (1, 2) AND ts >= ? AND ts <= ?
			  AND visitor_id IN (SELECT visitor_id FROM act)
		)
		SELECT pv.visitor_id, epoch_ms(pv.ts), epoch_ms(act.last), pv.kind, pv.path, pv.goal,
		       pv.channel, pv.ref, pv.country, pv.city, pv.device, pv.browser
		FROM pv JOIN act USING (visitor_id)
		WHERE pv.rn = 1
		ORDER BY act.last DESC, pv.ts DESC, pv.visitor_id
		LIMIT ?`,
		site, now.Add(-NowIdle), now, site, now.Add(-NowWindow), now, NowRows)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []NowVisit{}
	for rows.Next() {
		var v NowVisit
		var kind uint8
		var visitor uint64
		if err := rows.Scan(&visitor, &v.TS, &v.Last, &kind, &v.Path, &v.Goal, &v.Channel, &v.Ref, &v.Country, &v.City, &v.Device, &v.Browser); err != nil {
			return nil, err
		}
		v.Kind = "pageview"
		if kind == 2 {
			v.Kind = "goal"
		}
		// The same id the live stream sends, so a row opens the same journey.
		if withVisitor {
			v.Visitor = strconv.FormatUint(visitor, 36)
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
