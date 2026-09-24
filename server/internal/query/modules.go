package query

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Full-mode modules. Each is its own request, so Core never pays for them:
// the weekly rhythm, funnels, goal properties, and one visitor's journey.

// Heatmap is visitors by local weekday (Monday = 0) and hour.
type Heatmap struct {
	Cells [7][24]int64 `json:"cells"`
	Peak  int64        `json:"peak"`
	Total int64        `json:"total"`
}

// Heatmap counts the report's visits by weekday and hour in the site's zone.
func (q Q) Heatmap(ctx context.Context, p Params) (*Heatmap, error) {
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)
	cte, args, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	rows, err := conn.QueryContext(ctx, cte+`
		SELECT (extract('dow' FROM lstart) + 6) % 7 AS d, extract('hour' FROM lstart) AS h, count(*)
		FROM s GROUP BY d, h`, args...)
	if err != nil {
		return nil, fmt.Errorf("heatmap: %w", err)
	}
	defer rows.Close()
	out := &Heatmap{}
	for rows.Next() {
		var d, h, n int64
		if err := rows.Scan(&d, &h, &n); err != nil {
			return nil, err
		}
		if d < 0 || d > 6 || h < 0 || h > 23 {
			continue
		}
		out.Cells[d][h] = n
		out.Total += n
		if n > out.Peak {
			out.Peak = n
		}
	}
	return out, rows.Err()
}

// Step is one funnel step: a page path or a goal name.
type Step struct {
	Kind  string `json:"kind"` // "page" | "goal"
	Value string `json:"value"`
}

// FunnelStep is one step's result.
type FunnelStep struct {
	Step
	Visitors int64   `json:"visitors"`
	Rate     float64 `json:"rate"`     // share of the step before
	Total    float64 `json:"of_total"` // share of step 1
	MedianS  float64 `json:"median_s"` // median time from the previous step
	Dropped  int64   `json:"dropped"`  // visitors who stopped here
}

// MaxFunnelSteps caps a funnel (each step is one more self-join).
const MaxFunnelSteps = 8

// Funnel counts visitors who completed the steps in order inside the report's
// range: step 2 must happen at or after step 1, and so on. Filters apply, so
// "the signup funnel for AI visitors" is one request.
func (q Q) Funnel(ctx context.Context, p Params, steps []Step) ([]FunnelStep, error) {
	if len(steps) < 2 {
		return nil, fmt.Errorf("a funnel needs at least 2 steps")
	}
	if len(steps) > MaxFunnelSteps {
		return nil, fmt.Errorf("a funnel takes at most %d steps", MaxFunnelSteps)
	}
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)
	cte, args, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}

	// One CTE per step: the first time each visitor reached it, at or after
	// the step before.
	var b strings.Builder
	b.WriteString(cte + ", ev AS (SELECT visitor_id, ts, kind, path, goal FROM events WHERE site_id = ? AND ts >= ? AND ts < ?")
	args = append(args, p.Site, p.From, p.To)
	if len(p.Filters) > 0 {
		b.WriteString(" AND session_id IN (SELECT session_id FROM s)")
	}
	b.WriteString(")")
	for i, st := range steps {
		match := "kind = 1 AND path = ?"
		if st.Kind == "goal" {
			match = "kind = 2 AND goal = ?"
		}
		name := fmt.Sprintf("f%d", i)
		if i == 0 {
			fmt.Fprintf(&b, ", %s AS (SELECT visitor_id, min(ts) AS t FROM ev WHERE %s GROUP BY 1)", name, match)
		} else {
			fmt.Fprintf(&b, ", %s AS (SELECT e.visitor_id, min(e.ts) AS t, any_value(p.t) AS prev FROM ev e JOIN f%d p ON p.visitor_id = e.visitor_id AND e.ts >= p.t WHERE %s GROUP BY 1)",
				name, i-1, match)
		}
		args = append(args, st.Value)
	}
	parts := make([]string, len(steps))
	for i := range steps {
		if i == 0 {
			parts[i] = fmt.Sprintf("SELECT %d AS step, count(*) AS vis, 0.0 AS med FROM f0", i)
		} else {
			parts[i] = fmt.Sprintf("SELECT %d, count(*), coalesce(median(epoch_ms(t - prev)) / 1000.0, 0) FROM f%d", i, i)
		}
	}
	b.WriteString(" " + strings.Join(parts, " UNION ALL ") + " ORDER BY step")

	rows, err := conn.QueryContext(ctx, b.String(), args...)
	if err != nil {
		return nil, fmt.Errorf("funnel: %w", err)
	}
	defer rows.Close()
	out := make([]FunnelStep, len(steps))
	for i, st := range steps {
		out[i] = FunnelStep{Step: st}
	}
	for rows.Next() {
		var i int
		var vis int64
		var med float64
		if err := rows.Scan(&i, &vis, &med); err != nil {
			return nil, err
		}
		if i >= 0 && i < len(out) {
			out[i].Visitors, out[i].MedianS = vis, med
		}
	}
	for i := range out {
		if first := out[0].Visitors; first > 0 {
			out[i].Total = float64(out[i].Visitors) / float64(first)
		}
		if i > 0 && out[i-1].Visitors > 0 {
			out[i].Rate = float64(out[i].Visitors) / float64(out[i-1].Visitors)
			out[i-1].Dropped = out[i-1].Visitors - out[i].Visitors
		}
	}
	return out, rows.Err()
}

// PropRow is one goal property value.
type PropRow struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Visitors int64  `json:"visitors"`
	Events   int64  `json:"events"`
}

// GoalProps breaks a goal down by the properties sent with it
// (data-trckable-goal-plan="pro" → plan / pro).
func (q Q) GoalProps(ctx context.Context, p Params, goal string) ([]PropRow, error) {
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)
	cte, args, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	where := ""
	if len(p.Filters) > 0 {
		where = " AND session_id IN (SELECT session_id FROM s)"
	}
	args = append(args, p.Site, p.From, p.To, goal, p.Limit)
	rows, err := conn.QueryContext(ctx, cte+`, g AS (
			SELECT visitor_id, props FROM events
			WHERE site_id = ? AND ts >= ? AND ts < ? AND kind = 2 AND goal = ? AND props IS NOT NULL AND props <> ''`+where+`
		), kv AS (
			SELECT visitor_id, k, json_extract_string(props, '$."' || k || '"') AS v
			FROM (SELECT visitor_id, props, unnest(json_keys(props)) AS k FROM g)
		)
		SELECT k, coalesce(v, ''), count(DISTINCT visitor_id), count(*) FROM kv
		GROUP BY k, v
		QUALIFY row_number() OVER (PARTITION BY k ORDER BY count(DISTINCT visitor_id) DESC, v) <= ?
		ORDER BY k, 3 DESC, v`, args...)
	if err != nil {
		return nil, fmt.Errorf("goal props: %w", err)
	}
	defer rows.Close()
	out := []PropRow{}
	for rows.Next() {
		var r PropRow
		if err := rows.Scan(&r.Key, &r.Value, &r.Visitors, &r.Events); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// JourneyVisit is one visit in a visitor's journey.
type JourneyVisit struct {
	Start     time.Time      `json:"start"`
	End       time.Time      `json:"end"`
	Channel   string         `json:"channel,omitempty"`
	Referrer  string         `json:"referrer,omitempty"`
	Campaign  string         `json:"campaign,omitempty"`
	Country   string         `json:"country,omitempty"`
	Device    string         `json:"device,omitempty"`
	Browser   string         `json:"browser,omitempty"`
	Pageviews int64          `json:"pageviews"`
	EngagedS  float64        `json:"engaged_s"`
	Events    []JourneyEvent `json:"events"`
}

// JourneyEvent is a pageview or goal inside a visit.
type JourneyEvent struct {
	At       time.Time `json:"at"`
	Kind     string    `json:"kind"` // pageview | goal
	Path     string    `json:"path,omitempty"`
	Goal     string    `json:"goal,omitempty"`
	Props    string    `json:"props,omitempty"`
	EngagedS float64   `json:"engaged_s,omitempty"`
}

// Journey is one visitor's history: every visit, what they did, and (added by
// the API) what they paid.
type Journey struct {
	Visitor   string         `json:"visitor"`
	FirstSeen *time.Time     `json:"first_seen,omitempty"`
	Visits    []JourneyVisit `json:"visits"`
	Truncated bool           `json:"truncated,omitempty"`
}

// MaxJourneyVisits caps how much of one visitor's history is returned.
const MaxJourneyVisits = 50

// Journey returns a visitor's visits and events, newest visit first.
func (q Q) Journey(ctx context.Context, site string, visitor uint64, upTo time.Time) (*Journey, error) {
	conn, err := q.conn(ctx, site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)
	out := &Journey{Visitor: fmt.Sprintf("%d", visitor), Visits: []JourneyVisit{}}
	// Visitor and session ids are unsigned 64-bit: database/sql refuses those
	// with the high bit set, so they go in as literal numbers (they are our
	// own ids, never user input).
	rows, err := conn.QueryContext(ctx, `
		SELECT session_id, start, last, coalesce(channel, 'Direct'), coalesce(referrer, ''), coalesce(campaign, ''),
		       coalesce(country, ''), coalesce(device, ''), coalesce(browser, ''), pvs, engaged_ms, first_seen
		FROM (SELECT * FROM sessions UNION ALL SELECT * FROM s_open)
		WHERE site_id = ? AND visitor_id = `+strconv.FormatUint(visitor, 10)+` AND start < ?
		ORDER BY start DESC LIMIT ?`, site, upTo, MaxJourneyVisits+1)
	if err != nil {
		return nil, fmt.Errorf("journey visits: %w", err)
	}
	var ids []uint64
	byID := map[uint64]*JourneyVisit{}
	for rows.Next() {
		var v JourneyVisit
		var id, eng uint64
		var first sql.NullTime
		if err := rows.Scan(&id, &v.Start, &v.End, &v.Channel, &v.Referrer, &v.Campaign, &v.Country, &v.Device, &v.Browser, &v.Pageviews, &eng, &first); err != nil {
			rows.Close()
			return nil, err
		}
		v.EngagedS = float64(eng) / 1000
		if first.Valid && (out.FirstSeen == nil || first.Time.Before(*out.FirstSeen)) {
			t := first.Time
			out.FirstSeen = &t
		}
		out.Visits = append(out.Visits, v)
		ids = append(ids, id)
		byID[id] = &out.Visits[len(out.Visits)-1]
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out.Visits) > MaxJourneyVisits {
		out.Truncated = true
		delete(byID, ids[MaxJourneyVisits])
		out.Visits, ids = out.Visits[:MaxJourneyVisits], ids[:MaxJourneyVisits]
	}
	if len(ids) == 0 {
		return out, nil
	}
	list := make([]string, len(ids))
	for i, id := range ids {
		list[i] = strconv.FormatUint(id, 10)
	}
	rows, err = conn.QueryContext(ctx, `
		SELECT session_id, ts, kind, coalesce(path, ''), coalesce(goal, ''), coalesce(props, ''), coalesce(engaged_ms, 0)
		FROM events WHERE site_id = ? AND session_id IN (`+strings.Join(list, ", ")+`) AND kind <> 3
		ORDER BY ts LIMIT 2000`, site)
	if err != nil {
		return nil, fmt.Errorf("journey events: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id, eng uint64
		var kind uint8
		var e JourneyEvent
		if err := rows.Scan(&id, &e.At, &kind, &e.Path, &e.Goal, &e.Props, &eng); err != nil {
			return nil, err
		}
		e.Kind, e.EngagedS = "pageview", float64(eng)/1000
		if kind == 2 {
			e.Kind = "goal"
		}
		if v := byID[id]; v != nil {
			v.Events = append(v.Events, e)
		}
	}
	return out, rows.Err()
}

// conn opens a connection with the writer's open sessions loaded, so every
// module sees today's traffic too.
func (q Q) conn(ctx context.Context, site string) (*sql.Conn, error) {
	conn, err := q.DB.Conn(ctx)
	if err != nil {
		return nil, err
	}
	if err := q.loadOpen(ctx, conn, site); err != nil {
		conn.Close()
		return nil, err
	}
	return conn, nil
}

func (q Q) done(conn *sql.Conn) {
	conn.ExecContext(context.Background(), `DROP TABLE IF EXISTS s_open`)
	conn.Close()
}
