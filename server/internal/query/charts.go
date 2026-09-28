package query

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"time"
)

// Full mode's chart grid. Each chart answers one question and reads the same
// sessions the report does (range, zone, filters), so a filter set on the
// dashboard narrows every card the same way. One request, one connection.

// TopSources is how many channels get their own band in the stacked area;
// the rest share one "Other" band, so the chart never needs a rainbow.
const TopSources = 5

// FlowWidth is how many pages each page-flow column shows by name.
const FlowWidth = 4

// Chart grid node kinds for the page flow.
const (
	FlowPage  = "page"
	FlowOther = "other" // every page past the FlowWidth busiest
	FlowExit  = "exit"  // the visit ended here
)

// Charts is everything the Full grid draws that the report does not have.
type Charts struct {
	Labels     []string      `json:"labels"`  // bucket starts, local wall clock, like Result.Series
	Sources    []SourceBand  `json:"sources"` // biggest first; "Other" last when there is one
	Visitors   NewReturning  `json:"visitors"`
	Flow       Flow          `json:"flow"`
	Conversion []ConvStep    `json:"conversion,omitempty"` // nil with fewer than two steps
	ToConvert  []ConvertSpan `json:"to_convert,omitempty"` // nil without payments
}

// SourceBand is one channel's visits per bucket.
type SourceBand struct {
	Channel string  `json:"channel"`
	Other   bool    `json:"other,omitempty"`
	Total   int64   `json:"total"`
	Values  []int64 `json:"values"`
}

// NewReturning splits each bucket's visitors by whether this was their first
// visit. Visitors with no first-visit date (a cookieless visit) are in
// neither line and are counted in Unknown, so the lines never pretend.
type NewReturning struct {
	New       []int64 `json:"new"`
	Returning []int64 `json:"returning"`
	Unknown   int64   `json:"unknown"`
}

// Flow is the first three pages of each visit, repeats of the same page
// collapsed (a reload is not a step).
type Flow struct {
	Visits int64         `json:"visits"`
	Steps  [3][]FlowNode `json:"steps"`
	Links  []FlowLink    `json:"links"`
}

// FlowNode is one box in a page-flow column.
type FlowNode struct {
	Kind   string `json:"kind"`
	Path   string `json:"path,omitempty"`
	Visits int64  `json:"visits"`
}

// FlowLink is the visits going from a node in column Step to one in Step+1.
type FlowLink struct {
	Step   int    `json:"step"`
	From   string `json:"from"` // node key: its path, or "(other)" / "(exit)"
	To     string `json:"to"`
	Visits int64  `json:"visits"`
}

// ConvStep is one step of visit → goal → sale, each counted among the
// visitors of the step before, in order.
type ConvStep struct {
	Kind     string  `json:"kind"` // "visit" | "goal" | "sale"
	Value    string  `json:"value,omitempty"`
	Visitors int64   `json:"visitors"`
	Rate     float64 `json:"rate"` // share of the step before (1 for the first)
}

// ConvertSpan is how many first sales came that long after the first visit.
type ConvertSpan struct {
	Span  string `json:"span"` // "visit" | "3d" | "7d" | "14d" | "more"
	Sales int64  `json:"sales"`
}

// ConvertSpans are the time-to-convert buckets, in order.
var ConvertSpans = []string{"visit", "3d", "7d", "14d", "more"}

// ChartsFor computes the grid. goal picks the conversion goal; empty means
// the goal most visitors reached. Revenue parts need p.Revenue and payments.
func (q Q) ChartsFor(ctx context.Context, p Params, goal string) (*Charts, error) {
	if p.TZ == "" {
		p.TZ = "UTC"
	}
	p.Bucket = safeBucket(p.Bucket)
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)
	cte, args, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	out := &Charts{}
	for _, pt := range fillSeries(map[string]Point{}, p) {
		out.Labels = append(out.Labels, pt.T)
	}
	if out.Sources, err = sourceBands(ctx, conn, cte, args, p, out.Labels); err != nil {
		return nil, err
	}
	if out.Visitors, err = newReturning(ctx, conn, cte, args, p, out.Labels); err != nil {
		return nil, err
	}
	if out.Flow, err = pageFlow(ctx, conn, cte, args, p); err != nil {
		return nil, err
	}
	paid := false
	if q.Payments != nil && p.Revenue {
		if paid, err = q.loadPayments(ctx, conn, p); err != nil {
			return nil, err
		}
		defer func() { _, _ = conn.ExecContext(context.Background(), `DROP TABLE IF EXISTS p_facts`) }()
	}
	if out.Conversion, err = conversion(ctx, conn, cte, args, p, goal, paid); err != nil {
		return nil, err
	}
	if paid {
		if out.ToConvert, err = timeToConvert(ctx, conn, cte, args, p); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// loadPayments fills p_facts with the period's payments; false when no
// provider was ever connected.
func (q Q) loadPayments(ctx context.Context, conn *sql.Conn, p Params) (bool, error) {
	cur := p.Currency
	if cur == "" {
		cur = "USD"
	}
	facts, enabled, err := q.Payments(ctx, p.Site, cur, p.From, p.To, p.Test)
	if err != nil || !enabled {
		return false, err
	}
	return true, loadFacts(ctx, conn, facts)
}

// labelIndex maps a bucket start to its position in the labels.
func labelIndex(labels []string) map[string]int {
	at := make(map[string]int, len(labels))
	for i, l := range labels {
		at[l] = i
	}
	return at
}

// sourceBands counts visits (sessions, so the bands add up) by channel per
// bucket, the TopSources busiest channels by name and the rest as Other.
func sourceBands(ctx context.Context, conn *sql.Conn, cte string, args []any, p Params, labels []string) ([]SourceBand, error) {
	rows, err := conn.QueryContext(ctx, cte+`
		SELECT strftime(`+bucketOf(p, "lstart")+`, '%Y-%m-%dT%H:%M') AS b, coalesce(channel, 'Direct') AS ch, count(*)
		FROM s GROUP BY b, ch`, args...)
	if err != nil {
		return nil, fmt.Errorf("sources over time: %w", err)
	}
	defer rows.Close()
	type cell struct {
		b  string
		ch string
		n  int64
	}
	var cells []cell
	totals := map[string]int64{}
	for rows.Next() {
		var c cell
		if err := rows.Scan(&c.b, &c.ch, &c.n); err != nil {
			return nil, err
		}
		cells = append(cells, c)
		totals[c.ch] += c.n
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	names := make([]string, 0, len(totals))
	for ch := range totals {
		names = append(names, ch)
	}
	sort.Slice(names, func(i, j int) bool {
		if totals[names[i]] != totals[names[j]] {
			return totals[names[i]] > totals[names[j]]
		}
		return names[i] < names[j]
	})
	band := map[string]int{}
	var out []SourceBand
	for i, ch := range names {
		if i == TopSources && len(names) > TopSources+1 {
			band[ch] = len(out)
			out = append(out, SourceBand{Channel: "Other", Other: true, Values: make([]int64, len(labels))})
			continue
		}
		if i > TopSources && len(names) > TopSources+1 {
			band[ch] = len(out) - 1
			continue
		}
		band[ch] = len(out)
		out = append(out, SourceBand{Channel: ch, Values: make([]int64, len(labels))})
	}
	at := labelIndex(labels)
	for _, c := range cells {
		i, ok := at[c.b]
		if !ok {
			continue
		}
		b := &out[band[c.ch]]
		b.Values[i] += c.n
		b.Total += c.n
	}
	return out, nil
}

// newReturning counts each bucket's visitors once: new when any of their
// visits in it was their first (the same 30-minute rule as the KPI).
func newReturning(ctx context.Context, conn *sql.Conn, cte string, args []any, p Params, labels []string) (NewReturning, error) {
	out := NewReturning{New: make([]int64, len(labels)), Returning: make([]int64, len(labels))}
	rows, err := conn.QueryContext(ctx, cte+`, v AS (
			SELECT strftime(`+bucketOf(p, "lstart")+`, '%Y-%m-%dT%H:%M') AS b, visitor_id,
			       bool_or(first_seen >= start - INTERVAL 30 MINUTE) AS fresh
			FROM s GROUP BY b, visitor_id)
		SELECT b, count(*) FILTER (fresh), count(*) FILTER (NOT fresh), count(*) FILTER (fresh IS NULL)
		FROM v GROUP BY b`, args...)
	if err != nil {
		return out, fmt.Errorf("new vs returning: %w", err)
	}
	defer rows.Close()
	at := labelIndex(labels)
	for rows.Next() {
		var b string
		var fresh, back, unknown int64
		if err := rows.Scan(&b, &fresh, &back, &unknown); err != nil {
			return out, err
		}
		out.Unknown += unknown
		if i, ok := at[b]; ok {
			out.New[i], out.Returning[i] = fresh, back
		}
	}
	return out, rows.Err()
}

const (
	otherKey = "(other)"
	exitKey  = "(exit)"
)

// pageFlow reads each visit's first three distinct-in-a-row pages.
func pageFlow(ctx context.Context, conn *sql.Conn, cte string, args []any, p Params) (Flow, error) {
	rows, err := conn.QueryContext(ctx, cte+`,
		ev AS (
			SELECT session_id, ts, pageview_id, path FROM events
			WHERE site_id = ? AND ts >= ? AND ts < ? + INTERVAL 1 DAY AND kind = 1
			  AND session_id IN (SELECT session_id FROM s)),
		d AS (SELECT *, lag(path) OVER (PARTITION BY session_id ORDER BY ts, pageview_id) AS prev FROM ev),
		o AS (SELECT session_id, path, row_number() OVER (PARTITION BY session_id ORDER BY ts, pageview_id) AS n
		      FROM d WHERE prev IS NULL OR prev <> path),
		v AS (SELECT session_id, max(path) FILTER (n = 1) AS p1, max(path) FILTER (n = 2) AS p2, max(path) FILTER (n = 3) AS p3
		      FROM o WHERE n <= 3 GROUP BY session_id)
		SELECT p1, p2, p3, count(*) FROM v WHERE p1 IS NOT NULL GROUP BY ALL`,
		append(append([]any{}, args...), p.Site, p.From, p.To)...)
	if err != nil {
		return Flow{}, fmt.Errorf("page flow: %w", err)
	}
	defer rows.Close()
	type path3 struct {
		p [3]sql.NullString
		n int64
	}
	var all []path3
	for rows.Next() {
		var r path3
		if err := rows.Scan(&r.p[0], &r.p[1], &r.p[2], &r.n); err != nil {
			return Flow{}, err
		}
		all = append(all, r)
	}
	if err := rows.Err(); err != nil {
		return Flow{}, err
	}
	return buildFlow(func(yield func(p [3]sql.NullString, n int64)) {
		for _, r := range all {
			yield(r.p, r.n)
		}
	}), nil
}

// buildFlow names the FlowWidth busiest pages in each column and folds the
// rest into Other. A visit that ended stops at its exit node.
func buildFlow(each func(func(p [3]sql.NullString, n int64))) Flow {
	var counts [3]map[string]int64
	for i := range counts {
		counts[i] = map[string]int64{}
	}
	each(func(p [3]sql.NullString, n int64) {
		for i := 0; i < 3; i++ {
			if p[i].Valid {
				counts[i][p[i].String] += n
			}
		}
	})
	var keep [3]map[string]bool
	for i := range counts {
		keep[i] = topPaths(counts[i], FlowWidth)
	}
	keyOf := func(col int, p sql.NullString) string {
		if !p.Valid {
			return exitKey
		}
		if keep[col][p.String] {
			return p.String
		}
		return otherKey
	}
	var f Flow
	nodes := [3]map[string]int64{{}, {}, {}}
	links := map[FlowLink]int64{}
	each(func(p [3]sql.NullString, n int64) {
		f.Visits += n
		prev := keyOf(0, p[0])
		nodes[0][prev] += n
		for col := 1; col < 3; col++ {
			k := keyOf(col, p[col])
			nodes[col][k] += n
			links[FlowLink{Step: col - 1, From: prev, To: k}] += n
			if k == exitKey {
				break
			}
			prev = k
		}
	})
	for col := range nodes {
		f.Steps[col] = sortNodes(nodes[col])
	}
	for l, n := range links {
		l.Visits = n
		f.Links = append(f.Links, l)
	}
	sort.Slice(f.Links, func(i, j int) bool {
		a, b := f.Links[i], f.Links[j]
		if a.Step != b.Step {
			return a.Step < b.Step
		}
		if a.Visits != b.Visits {
			return a.Visits > b.Visits
		}
		return a.From+a.To < b.From+b.To
	})
	return f
}

func topPaths(counts map[string]int64, n int) map[string]bool {
	paths := make([]string, 0, len(counts))
	for p := range counts {
		paths = append(paths, p)
	}
	sort.Slice(paths, func(i, j int) bool {
		if counts[paths[i]] != counts[paths[j]] {
			return counts[paths[i]] > counts[paths[j]]
		}
		return paths[i] < paths[j]
	})
	keep := map[string]bool{}
	for i, p := range paths {
		if i == n && len(paths) > n+1 {
			break
		}
		keep[p] = true
	}
	return keep
}

// sortNodes orders a column: named pages busiest first, then Other, then the exit.
func sortNodes(m map[string]int64) []FlowNode {
	var out []FlowNode
	for k, n := range m {
		switch k {
		case otherKey:
			out = append(out, FlowNode{Kind: FlowOther, Visits: n})
		case exitKey:
			out = append(out, FlowNode{Kind: FlowExit, Visits: n})
		default:
			out = append(out, FlowNode{Kind: FlowPage, Path: k, Visits: n})
		}
	}
	rank := map[string]int{FlowPage: 0, FlowOther: 1, FlowExit: 2}
	sort.Slice(out, func(i, j int) bool {
		if rank[out[i].Kind] != rank[out[j].Kind] {
			return rank[out[i].Kind] < rank[out[j].Kind]
		}
		if out[i].Visits != out[j].Visits {
			return out[i].Visits > out[j].Visits
		}
		return out[i].Path < out[j].Path
	})
	return out
}

// conversion is visit → goal → sale. The goal is the one asked for, or the
// one most visitors reached; a sale is a first payment (renewals are not a
// new decision) made at or after the goal. Missing parts drop out.
func conversion(ctx context.Context, conn *sql.Conn, cte string, args []any, p Params, goal string, paid bool) ([]ConvStep, error) {
	var visitors int64
	if err := conn.QueryRowContext(ctx, cte+` SELECT count(DISTINCT visitor_id) FROM s`, args...).Scan(&visitors); err != nil {
		return nil, fmt.Errorf("conversion visitors: %w", err)
	}
	steps := []ConvStep{{Kind: "visit", Visitors: visitors, Rate: 1}}
	evArgs := append(append([]any{}, args...), p.Site, p.From, p.To)
	goals := cte + `, g AS (
		SELECT visitor_id, goal, min(ts) AS t FROM events
		WHERE site_id = ? AND ts >= ? AND ts < ? + INTERVAL 1 DAY AND kind = 2 AND goal IS NOT NULL
		  AND session_id IN (SELECT session_id FROM s)
		GROUP BY ALL)`
	if p.Goals && goal == "" {
		err := conn.QueryRowContext(ctx, goals+` SELECT goal FROM g GROUP BY goal ORDER BY count(*) DESC, goal LIMIT 1`, evArgs...).Scan(&goal)
		if err != nil && err != sql.ErrNoRows {
			return nil, fmt.Errorf("conversion goal: %w", err)
		}
	}
	if !p.Goals {
		goal = ""
	}
	if goal != "" {
		var n int64
		if err := conn.QueryRowContext(ctx, goals+` SELECT count(*) FROM g WHERE goal = ?`, append(evArgs, goal)...).Scan(&n); err != nil {
			return nil, fmt.Errorf("conversion goal visitors: %w", err)
		}
		steps = append(steps, ConvStep{Kind: "goal", Value: goal, Visitors: n})
	}
	if paid {
		sales := `, f AS (SELECT visitor_id, min(paid_at) AS t FROM p_facts
			WHERE converted AND kind <> 'renewal' AND visitor_id <> 0 GROUP BY 1)`
		var n int64
		var err error
		if goal != "" {
			err = conn.QueryRowContext(ctx, goals+sales+` SELECT count(*) FROM f JOIN g ON g.visitor_id = f.visitor_id AND g.goal = ? AND f.t >= g.t`,
				append(evArgs, goal)...).Scan(&n)
		} else {
			err = conn.QueryRowContext(ctx, cte+sales+` SELECT count(*) FROM f WHERE visitor_id IN (SELECT visitor_id FROM s)`, args...).Scan(&n)
		}
		if err != nil {
			return nil, fmt.Errorf("conversion sales: %w", err)
		}
		steps = append(steps, ConvStep{Kind: "sale", Visitors: n})
	}
	if len(steps) < 2 {
		return nil, nil
	}
	for i := 1; i < len(steps); i++ {
		if prev := steps[i-1].Visitors; prev > 0 {
			steps[i].Rate = float64(steps[i].Visitors) / float64(prev)
		}
	}
	return steps, nil
}

// timeToConvert buckets each first sale by the time since the buyer's first
// visit. "visit" means they paid during that first visit (within 30 minutes
// of its last event); the rest go by whole days.
func timeToConvert(ctx context.Context, conn *sql.Conn, cte string, args []any, p Params) ([]ConvertSpan, error) {
	rows, err := conn.QueryContext(ctx, cte+`,
		pay AS (SELECT visitor_id, paid_at FROM p_facts
		        WHERE converted AND kind <> 'renewal' AND visitor_id <> 0 AND visitor_id IN (SELECT visitor_id FROM s)),
		vs AS (
			SELECT visitor_id, start, last, first_seen FROM sessions WHERE site_id = ? AND start < ? AND visitor_id IN (SELECT visitor_id FROM pay)
			UNION ALL
			SELECT visitor_id, start, last, first_seen FROM s_open WHERE site_id = ? AND start < ? AND visitor_id IN (SELECT visitor_id FROM pay)),
		fv AS (SELECT visitor_id, least(coalesce(min(first_seen), min(start)), min(start)) AS first FROM vs GROUP BY 1),
		x AS (
			SELECT pay.paid_at - fv.first AS gap,
			       EXISTS (SELECT 1 FROM vs WHERE vs.visitor_id = pay.visitor_id AND vs.start <= fv.first + INTERVAL 30 MINUTE
			               AND pay.paid_at >= vs.start AND pay.paid_at <= vs.last + INTERVAL 30 MINUTE) AS same
			FROM pay JOIN fv USING (visitor_id))
		SELECT CASE WHEN same THEN 0
		            WHEN gap < INTERVAL 4 DAY THEN 1
		            WHEN gap < INTERVAL 8 DAY THEN 2
		            WHEN gap < INTERVAL 15 DAY THEN 3
		            ELSE 4 END AS b, count(*)
		FROM x GROUP BY b`, append(append([]any{}, args...), p.Site, p.To.Add(time.Hour*24), p.Site, p.To.Add(time.Hour*24))...)
	if err != nil {
		return nil, fmt.Errorf("time to convert: %w", err)
	}
	defer rows.Close()
	out := make([]ConvertSpan, len(ConvertSpans))
	for i, s := range ConvertSpans {
		out[i].Span = s
	}
	for rows.Next() {
		var b int
		var n int64
		if err := rows.Scan(&b, &n); err != nil {
			return nil, err
		}
		if b >= 0 && b < len(out) {
			out[b].Sales = n
		}
	}
	return out, rows.Err()
}
