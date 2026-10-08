// Package query holds trckable's report engine. Every query is scoped by site
// and time range, and only whitelisted dimensions can be grouped or filtered
// by, so user input never becomes SQL.
//
// Reports read the sessions rollup (one row per visit, written by the writer)
// plus the writer's in-memory open sessions, so today's numbers are live and a
// 90-day report never rebuilds sessions from raw events. All breakdowns come
// from ONE grouped scan (GROUPING SETS).
package query

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"sort"
	"strings"
	"time"

	duckdb "github.com/duckdb/duckdb-go/v2"

	"github.com/trckable/trckable/server/internal/writer"
)

// OpenSessions returns the writer's not-yet-written sessions for a site.
type OpenSessions func(site string) ([]writer.Session, bool)

// Q runs report queries against the analytics store.
type Q struct {
	DB       *sql.DB
	Open     OpenSessions // optional; nil = closed sessions only
	Payments Payments     // optional; nil = no revenue
}

// Params select a report.
type Params struct {
	Site     string
	From, To time.Time // UTC, half-open
	TZ       string    // IANA zone for buckets
	Filters  []Filter
	Bucket   string // "hour" | "day" | "week" | "month"
	// SundayWeeks starts weekly buckets on Sunday, as the site's "Week starts
	// on" setting says; otherwise weeks start on Monday (ISO).
	SundayWeeks bool
	Limit       int // rows per breakdown (default 10)
	// Export lifts the ceiling on Limit from 100 to ExportMaxRows, for the CSV
	// export, which wants the long tail.
	Export   bool
	Daily    bool   // include per-day breakdowns (scrubber / replay)
	Currency string // site currency for revenue (ISO 4217)
	Test     bool   // count test/sandbox payments instead of live ones
	// Revenue includes attributed revenue in the report. It follows the site's
	// revenue module: with the module off no payment is read or attributed, so
	// the report costs nothing extra and shows no money anywhere.
	Revenue bool
	// Goals includes the goal breakdown. It follows the goals module, so a site
	// with goals off does not pay for the scan and does not see the card.
	Goals bool
	// Groups collect pages into sections ("Blog", "Docs"). Empty means the
	// site has none, and the scan does not happen.
	Groups []Group
	// PageGoals are goals reached by visiting a page ("Saw pricing =
	// /pricing"). They appear among the goals and filter like them.
	PageGoals []Group
	// Attribution is which visit a sale is credited to: FirstTouch or, by
	// default, LastTouch. It changes only who gets the credit — the totals are
	// the same money either way.
	Attribution string
	// Deep adds the breakdowns only Full mode shows. Core never asks for
	// them, so its scan stays the size it has always been.
	Deep bool
	// Sales adds the payments bucket by bucket (Result.Sales), for Replay's
	// moments. Only with Revenue on.
	Sales bool
	// SalePages adds the pages that sold (Result.SalePages): the revenue
	// credited to visits that read each page. Only with Revenue on.
	SalePages bool
	// Buyers adds the latest sales with the way to each (Result.Buyers): this
	// many, newest first. Only with Revenue on.
	Buyers int
	// NewReferrers adds the referring sites that sent nobody before the period
	// (Result.NewReferrers): this many, the busiest first.
	NewReferrers int
}

// KPIs are the headline numbers.
type KPIs struct {
	Visitors     int64   `json:"visitors"`
	Sessions     int64   `json:"sessions"`
	Pageviews    int64   `json:"pageviews"`
	BounceRate   float64 `json:"bounce_rate"`
	AvgSessionS  float64 `json:"avg_session_s"`
	ViewsPerSess float64 `json:"views_per_session"`
	NewVisitors  float64 `json:"new_visitor_share"`
}

// Row is one breakdown line.
type Row struct {
	Value     string  `json:"value"`
	Visitors  int64   `json:"visitors"`
	Sessions  int64   `json:"sessions,omitempty"`
	Pageviews int64   `json:"pageviews,omitempty"`
	Bounce    float64 `json:"bounce_rate,omitempty"`
	Revenue   *int64  `json:"revenue,omitempty"` // attributed net revenue, minor units (when payments are connected)
	Payers    int64   `json:"customers,omitempty"`
}

// Point is one chart bucket.
//
// T is the bucket start as local wall-clock time in the report's timezone
// ("2026-09-20T09:00"); every bucket in the range is present, empty ones as 0.
type Point struct {
	T         string `json:"t"`
	Visitors  int64  `json:"visitors"`
	Pageviews int64  `json:"pageviews"`
	Revenue   int64  `json:"revenue,omitempty"`
	// Bounce and AvgS are the bucket's bounce rate and mean session length
	// (seconds), for the Story tiles' charts; absent for a bucket with no sessions.
	Bounce   float64 `json:"bounce_rate,omitempty"`
	AvgS     float64 `json:"avg_session_s,omitempty"`
	Imported bool    `json:"imported,omitempty"` // counts from an imported day (Google Analytics) are in this bucket
}

// Day is one day's numbers for the scrubber.
type Day struct {
	Date  string           `json:"date"` // YYYY-MM-DD in the site's zone
	KPIs  KPIs             `json:"kpis"`
	Dims  map[string][]Row `json:"dims"`
	Money *DayMoney        `json:"money,omitempty"`
}

// ExactLimit is the number of sessions in a range up to which every
// breakdown row counts unique visitors exactly. Above it, breakdown rows use
// HyperLogLog (≈2% error) and Result.Approximate is set; headline KPIs are
// always exact. It keeps big ranges on big sites fast on one small CPU.
var ExactLimit int64 = 250_000

// Result is a full report.
type Result struct {
	Approximate  bool             `json:"approximate"` // breakdown visitor counts are HyperLogLog estimates
	KPIs         KPIs             `json:"kpis"`
	Series       []Point          `json:"series"`
	Imported     *Imported        `json:"imported,omitempty"` // nil unless days from an import are in the report
	Dims         map[string][]Row `json:"dims"`
	Goals        []Row            `json:"goals"`
	Days         []Day            `json:"days,omitempty"`
	Money        *Money           `json:"money,omitempty"`        // nil until a payment provider is connected
	RevenueDims  map[string][]Row `json:"revenue_dims,omitempty"` // top rows by revenue
	Sales        []SaleBucket     `json:"-"`                      // with Params.Sales: the payments per bucket
	SalePages    []Row            `json:"-"`                      // with Params.SalePages: revenue per page the credited visit read
	Buyers       []Buyer          `json:"-"`                      // with Params.Buyers: the latest sales and their way there
	NewReferrers []NewReferrer    `json:"-"`                      // with Params.NewReferrers: sites that sent nobody before
}

// sessionDims maps API dimension names to sessions columns (the whitelist).
var sessionDims = map[string]string{
	"channel":    "coalesce(channel, 'Direct')",
	"referrer":   "referrer",
	"entry_page": "entry_page",
	"exit_page":  "exit_page",
	"campaign":   "campaign",
	"source":     "utm_source",
	"medium":     "utm_medium",
	"country":    "country",
	"region":     "region",
	"city":       "city",
	"device":     "device",
	"browser":    "browser",
	"os":         "os",
	"language":   "language",

	// A version only newer visits carry: the rest are Unknown, not missing.
	"browser_version": "coalesce(browser_version, 'Unknown')",
	"screen":          screenBucket,
}

// screenBucket groups the width of the window a visit began in. Exact widths
// would be a list of a thousand one-visit rows; these five are the ones a
// designer chooses between. A visit that never said stays out of the list.
const screenBucket = `CASE WHEN screen IS NULL THEN NULL
		WHEN screen <= 640 THEN '≤640'
		WHEN screen <= 1024 THEN '641–1024'
		WHEN screen <= 1440 THEN '1025–1440'
		WHEN screen <= 1920 THEN '1441–1920'
		ELSE '>1920' END`

// DefaultDims are computed for every report (Core + Full).
var DefaultDims = []string{"channel", "referrer", "campaign", "entry_page", "country", "device", "browser", "os"}

// DeepDims are the ones only Full mode shows, and the ones its filter menu
// offers. They ride along in the same GROUPING SETS scan, so asking for them
// costs one wider scan rather than six more queries — but Core does not ask.
var DeepDims = []string{"exit_page", "region", "city", "source", "medium", "language", "browser_version", "screen"}

// dimsFor is the breakdowns one report computes.
func dimsFor(deep bool) []string {
	if deep {
		return append(append([]string{}, DefaultDims...), DeepDims...)
	}
	return DefaultDims
}

// DailyDims are computed per day for the scrubber.
var DailyDims = []string{"channel", "entry_page", "country", "device"}

// ValidDim reports whether d can be grouped or filtered by.
func ValidDim(d string) bool {
	_, ok := sessionDims[d]
	return ok || d == "page" || d == "goal" || d == "group"
}

const bounce = "CASE WHEN pvs <= 1 AND goals = 0 THEN 1.0 ELSE 0.0 END"

// ExportMaxRows is the most rows per breakdown an export may ask for.
const ExportMaxRows = 1000

func maxRows(export bool) int {
	if export {
		return ExportMaxRows
	}
	return 100
}

// concurrentReports is how many reports read the store at the same time.
const concurrentReports = 4

var reportSlots = make(chan struct{}, concurrentReports)

func acquireReport(ctx context.Context) error {
	select {
	case reportSlots <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func releaseReport() { <-reportSlots }

// Report runs a full report.
func (q Q) Report(ctx context.Context, p Params) (*Result, error) {
	res, err := q.report(ctx, p)
	if err != nil && isOutOfMemory(err) {
		// Another query may have held the memory a moment ago.
		res, err = q.report(ctx, p)
	}
	return res, err
}

// isOutOfMemory reports whether DuckDB gave up for want of memory.
func isOutOfMemory(err error) bool {
	return strings.Contains(err.Error(), "Out of Memory")
}

func (q Q) report(ctx context.Context, p Params) (*Result, error) {
	if p.TZ == "" {
		p.TZ = "UTC"
	}
	switch p.Bucket {
	case "hour", "day", "week", "month":
	default:
		p.Bucket = "day"
	}
	if p.Limit <= 0 || p.Limit > maxRows(p.Export) {
		p.Limit = 10
	}
	if _, err := time.LoadLocation(p.TZ); err != nil {
		return nil, fmt.Errorf("bad timezone %q", p.TZ)
	}
	// Only a few reports read at once: a burst of them (a launch) queues here
	// instead of fighting over memory and cores, and a caller whose time runs
	// out while waiting gives up with its context's error.
	if err := acquireReport(ctx); err != nil {
		return nil, err
	}
	defer releaseReport()
	conn, err := q.DB.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	if err := q.loadOpen(ctx, conn, p.Site); err != nil {
		return nil, err
	}
	defer func() {
		// Frees the memory early; the next use replaces the table anyway.
		_, _ = conn.ExecContext(context.Background(), `DROP TABLE IF EXISTS s_open`)
	}()

	cte, args, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	res := &Result{Dims: map[string][]Row{}}

	// KPIs.
	var newShare sql.NullFloat64
	if err := conn.QueryRowContext(ctx, cte+`
		SELECT count(DISTINCT visitor_id), count(*), coalesce(sum(pvs), 0),
		       coalesce(avg(`+bounce+`), 0), coalesce(avg(dur), 0),
		       count(DISTINCT visitor_id) FILTER (first_seen >= start - INTERVAL 30 MINUTE)::DOUBLE
		         / nullif(count(DISTINCT visitor_id) FILTER (first_seen IS NOT NULL), 0)
		FROM s`, args...).Scan(&res.KPIs.Visitors, &res.KPIs.Sessions, &res.KPIs.Pageviews,
		&res.KPIs.BounceRate, &res.KPIs.AvgSessionS, &newShare); err != nil {
		return nil, fmt.Errorf("kpis: %w", err)
	}
	res.KPIs.NewVisitors = newShare.Float64
	res.Approximate = res.KPIs.Sessions > ExactLimit
	distinct := "count(DISTINCT visitor_id)"
	if res.Approximate {
		distinct = "approx_count_distinct(visitor_id)"
	}
	if res.KPIs.Sessions > 0 {
		res.KPIs.ViewsPerSess = float64(res.KPIs.Pageviews) / float64(res.KPIs.Sessions)
	}

	// Chart series.
	rows, err := conn.QueryContext(ctx, cte+`
		SELECT `+bucketOf(p, "lstart")+` AS b, `+distinct+`, sum(pvs), avg(`+bounce+`), avg(dur)
		FROM s GROUP BY b ORDER BY b`, args...)
	if err != nil {
		return nil, fmt.Errorf("series: %w", err)
	}
	got := map[string]Point{}
	for rows.Next() {
		var pt Point
		var b time.Time
		var br, dur sql.NullFloat64
		if err := rows.Scan(&b, &pt.Visitors, &pt.Pageviews, &br, &dur); err != nil {
			rows.Close()
			return nil, err
		}
		pt.Bounce, pt.AvgS = br.Float64, dur.Float64
		pt.T = b.Format(localLayout)
		got[pt.T] = pt
	}
	rows.Close()
	res.Series = fillSeries(got, p)

	// All session breakdowns in one grouped scan.
	if err := groupedBreakdowns(ctx, conn, cte, args, p.Limit, distinct, dimsFor(p.Deep), res.Dims); err != nil {
		return nil, err
	}

	// Page and goal breakdowns read events (every pageview, not just entries).
	evWhere, evArgs := eventScope(p)
	if res.Dims["page"], err = eventRows(ctx, conn, cte, args, evWhere, evArgs, "path", 1, p.Limit, len(p.Filters) > 0, distinct); err != nil {
		return nil, err
	}
	if p.Goals {
		if res.Goals, err = eventRows(ctx, conn, cte, args, evWhere, evArgs, "goal", 2, p.Limit, len(p.Filters) > 0, distinct); err != nil {
			return nil, err
		}
		if len(p.PageGoals) > 0 {
			pg, err := pageGoalRows(ctx, conn, cte, args, evWhere, evArgs, p.PageGoals, len(p.Filters) > 0, distinct)
			if err != nil {
				return nil, err
			}
			res.Goals = append(res.Goals, pg...)
			sortRows(res.Goals)
			if len(res.Goals) > p.Limit {
				res.Goals = res.Goals[:p.Limit]
			}
		}
	}
	if len(p.Groups) > 0 {
		if res.Dims["group"], err = groupRows(ctx, conn, cte, args, evWhere, evArgs, p.Groups, p.Limit, len(p.Filters) > 0, distinct); err != nil {
			return nil, err
		}
	}

	if p.Daily {
		if res.Days, err = daily(ctx, conn, cte, args, p.Limit, distinct); err != nil {
			return nil, err
		}
	}
	if q.Payments != nil && p.Revenue {
		if err := q.revenue(ctx, conn, p, cte, args, res); err != nil {
			return nil, fmt.Errorf("revenue: %w", err)
		}
	}
	if p.NewReferrers > 0 {
		if res.NewReferrers, err = newReferrers(ctx, conn, p); err != nil {
			return nil, err
		}
	}
	if err := mergeImported(ctx, conn, p, res); err != nil {
		return nil, err
	}
	return res, nil
}

// loadOpen copies the writer's open sessions for the site into a temp table.
func (q Q) loadOpen(ctx context.Context, conn *sql.Conn, site string) error {
	if _, err := conn.ExecContext(ctx, `CREATE OR REPLACE TEMP TABLE s_open AS SELECT * FROM sessions LIMIT 0`); err != nil {
		return err
	}
	if q.Open == nil {
		return nil
	}
	open, _ := q.Open(site)
	if len(open) == 0 {
		return nil
	}
	return conn.Raw(func(dc any) error {
		app, err := duckdb.NewAppender(dc.(driver.Conn), "temp", "main", "s_open")
		if err != nil {
			return err
		}
		for i := range open {
			if err := writer.AppendSession(app, &open[i]); err != nil {
				app.Close()
				return err
			}
		}
		return app.Close()
	})
}

// safeTZ validates a timezone before it goes into SQL. Callers already check
// it, so this is the layer that fails closed if one ever forgets.
func safeTZ(tz string) (string, error) {
	if tz == "" {
		return "UTC", nil
	}
	if _, err := time.LoadLocation(tz); err != nil {
		return "", fmt.Errorf("unknown timezone %q", tz)
	}
	return tz, nil
}

// safeBucket validates a bucket name before it goes into SQL.
// bucketOf truncates a local timestamp column to the report's bucket. A week
// that starts on Sunday is the ISO week of the day after, moved back a day.
func bucketOf(p Params, col string) string {
	b := safeBucket(p.Bucket)
	if b == "week" && p.SundayWeeks {
		return "(date_trunc('week', " + col + " + INTERVAL 1 DAY) - INTERVAL 1 DAY)"
	}
	return "date_trunc('" + b + "', " + col + ")"
}

func safeBucket(b string) string {
	switch b {
	case "hour", "day", "week", "month":
		return b
	}
	return "day"
}

// sessionsCTE returns "WITH s AS (...)" selecting the report's sessions
// (closed + open, by start time, filtered), with lstart in the site's zone.
func sessionsCTE(p Params) (string, []any, error) {
	tz, err := safeTZ(p.TZ)
	if err != nil {
		return "", nil, err
	}
	where, fargs, err := filterWhere(p, p.From, p.To)
	if err != nil {
		return "", nil, err
	}
	args := append([]any{p.Site, p.From, p.To, p.Site, p.From, p.To}, fargs...)
	cte := `WITH s AS (
		SELECT *, ((start AT TIME ZONE 'UTC') AT TIME ZONE '` + tz + `') AS lstart FROM (
			SELECT * FROM sessions WHERE site_id = ? AND start >= ? AND start < ?
			UNION ALL
			SELECT * FROM s_open WHERE site_id = ? AND start >= ? AND start < ?
		)` + where + `)`
	return cte, args, nil
}

func eventScope(p Params) (string, []any) {
	return `site_id = ? AND ts >= ? AND ts < ?`, []any{p.Site, p.From, p.To}
}

// gidFor maps GROUPING() ids back to dimensions: GROUPING sets bit (n-1-i)
// for every grouped column that is NOT in the current set.
func gidFor(dims []string) map[int64]string {
	n := len(dims)
	all := int64(1)<<n - 1
	out := map[int64]string{}
	for i, d := range dims {
		out[all&^(int64(1)<<(n-1-i))] = d
	}
	return out
}

// breakdownChunk is how many breakdowns one grouped scan computes. Every
// grouping set holds a hash table with a distinct-visitor set per value, so
// all sixteen at once need memory in proportion to the traffic; a few at a
// time fit a small memory limit on a big site, for a few more scans.
const breakdownChunk = 2

// groupedBreakdowns computes every breakdown with GROUPING SETS, a few
// dimensions per scan, keeping the top `limit` rows of each.
func groupedBreakdowns(ctx context.Context, conn *sql.Conn, cte string, args []any, limit int, distinct string, dims []string, out map[string][]Row) error {
	for i := 0; i < len(dims); i += breakdownChunk {
		if err := groupedChunk(ctx, conn, cte, args, limit, distinct, dims[i:min(i+breakdownChunk, len(dims))], out); err != nil {
			return err
		}
	}
	return nil
}

func groupedChunk(ctx context.Context, conn *sql.Conn, cte string, args []any, limit int, distinct string, dims []string, out map[string][]Row) error {
	cols := make([]string, len(dims))
	sets := make([]string, len(dims))
	gcols := make([]string, len(dims))
	for i, d := range dims {
		g := fmt.Sprintf("d%d", i)
		cols[i] = sessionDims[d] + " AS " + g
		sets[i] = "(" + g + ")"
		gcols[i] = g
	}
	//nolint:gosec // columns come from the fixed sessionDims map and constant fragments; values are bound as parameters
	sqlText := cte + `, t AS (SELECT ` + strings.Join(cols, ", ") + `, visitor_id, pvs, goals FROM s)
		SELECT gid, v, vis, sess, pv, br FROM (
			SELECT GROUPING(` + strings.Join(gcols, ", ") + `) AS gid,
			       coalesce(` + strings.Join(gcols, ", ") + `) AS v,
			       ` + distinct + ` AS vis, count(*) AS sess, sum(pvs) AS pv,
			       avg(` + bounce + `) AS br
			FROM t GROUP BY GROUPING SETS (` + strings.Join(sets, ", ") + `)
		) WHERE v IS NOT NULL
		QUALIFY row_number() OVER (PARTITION BY gid ORDER BY vis DESC, v) <= ?`
	rows, err := conn.QueryContext(ctx, sqlText, append(append([]any{}, args...), limit)...)
	if err != nil {
		return fmt.Errorf("breakdowns: %w", err)
	}
	defer rows.Close()
	byGID := gidFor(dims)
	for _, d := range dims {
		out[d] = []Row{}
	}
	for rows.Next() {
		var gid int64
		var r Row
		if err := rows.Scan(&gid, &r.Value, &r.Visitors, &r.Sessions, &r.Pageviews, &r.Bounce); err != nil {
			return err
		}
		if d, ok := byGID[gid]; ok {
			out[d] = append(out[d], r)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, d := range dims {
		sortRows(out[d])
	}
	return nil
}

func sortRows(rs []Row) {
	sort.SliceStable(rs, func(i, j int) bool {
		if rs[i].Visitors != rs[j].Visitors {
			return rs[i].Visitors > rs[j].Visitors
		}
		return rs[i].Value < rs[j].Value
	})
}

// eventRows is a breakdown over events of one kind (pages, goals). With
// filters, only events of the report's sessions count.
func eventRows(ctx context.Context, conn *sql.Conn, cte string, cteArgs []any, where string, args []any, col string, kind, limit int, filtered bool, distinct string) ([]Row, error) {
	//nolint:gosec // col and where are constant fragments chosen by the caller; values are bound as parameters
	q := `SELECT ` + col + `, ` + distinct + ` AS vis, count(*) FROM events
		WHERE ` + where + ` AND kind = ` + fmt.Sprint(kind) + ` AND ` + col + ` IS NOT NULL`
	all := append([]any{}, args...)
	if filtered {
		q = cte + " " + q + ` AND session_id IN (SELECT session_id FROM s)`
		all = append(append([]any{}, cteArgs...), args...)
	}
	q += ` GROUP BY ` + col + ` ORDER BY vis DESC, ` + col + ` LIMIT ?`
	rows, err := conn.QueryContext(ctx, q, append(all, limit)...)
	if err != nil {
		return nil, fmt.Errorf("%s breakdown: %w", col, err)
	}
	defer rows.Close()
	out := []Row{}
	for rows.Next() {
		var r Row
		if err := rows.Scan(&r.Value, &r.Visitors, &r.Pageviews); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// daily returns per-day KPIs and top rows in two grouped queries.
func daily(ctx context.Context, conn *sql.Conn, cte string, args []any, limit int, distinct string) ([]Day, error) {
	if limit > 8 {
		limit = 8
	}
	byDate := map[string]*Day{}
	get := func(d string) *Day {
		if x, ok := byDate[d]; ok {
			return x
		}
		x := &Day{Date: d, Dims: map[string][]Row{}}
		byDate[d] = x
		return x
	}
	rows, err := conn.QueryContext(ctx, cte+`
		SELECT strftime(lstart, '%Y-%m-%d') AS d, count(DISTINCT visitor_id), count(*), sum(pvs),
		       avg(`+bounce+`), avg(dur),
		       count(DISTINCT visitor_id) FILTER (first_seen >= start - INTERVAL 30 MINUTE)::DOUBLE
		         / nullif(count(DISTINCT visitor_id) FILTER (first_seen IS NOT NULL), 0)
		FROM s GROUP BY d`, args...)
	if err != nil {
		return nil, fmt.Errorf("daily kpis: %w", err)
	}
	for rows.Next() {
		var d string
		var k KPIs
		var newShare sql.NullFloat64
		if err := rows.Scan(&d, &k.Visitors, &k.Sessions, &k.Pageviews, &k.BounceRate, &k.AvgSessionS, &newShare); err != nil {
			rows.Close()
			return nil, err
		}
		if k.Sessions > 0 {
			k.ViewsPerSess = float64(k.Pageviews) / float64(k.Sessions)
		}
		k.NewVisitors = newShare.Float64
		get(d).KPIs = k
	}
	rows.Close()

	cols := []string{"strftime(lstart, '%Y-%m-%d') AS day"}
	sets := make([]string, len(DailyDims))
	gcols := make([]string, len(DailyDims))
	for i, dim := range DailyDims {
		g := fmt.Sprintf("d%d", i)
		cols = append(cols, sessionDims[dim]+" AS "+g)
		gcols[i] = g
		sets[i] = "(day, " + g + ")"
	}
	rows, err = conn.QueryContext(ctx, cte+`, t AS (SELECT `+strings.Join(cols, ", ")+`, visitor_id FROM s)
		SELECT gid, day, v, vis FROM (
			SELECT GROUPING(`+strings.Join(gcols, ", ")+`) AS gid, day,
			       coalesce(`+strings.Join(gcols, ", ")+`) AS v, `+distinct+` AS vis
			FROM t GROUP BY GROUPING SETS (`+strings.Join(sets, ", ")+`)
		) WHERE v IS NOT NULL
		QUALIFY row_number() OVER (PARTITION BY gid, day ORDER BY vis DESC, v) <= ?`,
		append(append([]any{}, args...), limit)...)
	if err != nil {
		return nil, fmt.Errorf("daily breakdowns: %w", err)
	}
	byGID := gidFor(DailyDims)
	for rows.Next() {
		var gid int64
		var day string
		var r Row
		if err := rows.Scan(&gid, &day, &r.Value, &r.Visitors); err != nil {
			rows.Close()
			return nil, err
		}
		if d, ok := byGID[gid]; ok {
			x := get(day)
			x.Dims[d] = append(x.Dims[d], r)
		}
	}
	rows.Close()
	out := make([]Day, 0, len(byDate))
	for _, d := range byDate {
		for _, dim := range DailyDims {
			sortRows(d.Dims[dim])
		}
		out = append(out, *d)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date < out[j].Date })
	return out, nil
}

// Online counts distinct visitors with any event in the last 5 minutes.
func (q Q) Online(ctx context.Context, site string, now time.Time) (int64, error) {
	var n int64
	err := q.DB.QueryRowContext(ctx,
		`SELECT count(DISTINCT visitor_id) FROM events WHERE site_id = ? AND ts >= ?`,
		site, now.Add(-5*time.Minute).UTC()).Scan(&n)
	return n, err
}

// OnlineMinutes is how many minutes the Online now card draws.
const OnlineMinutes = 30

// onlineWindow is how far back a visitor still counts as online.
const onlineWindow = 5

// OnlineSeries is Online, once per minute for the last OnlineMinutes: slot i
// counts the visitors seen in the five minutes up to (now - (OnlineMinutes-1-i)
// minutes), so the last slot is Online itself. One grouped read of the
// visitors' minutes, counted in memory.
func (q Q) OnlineSeries(ctx context.Context, site string, now time.Time) ([]int64, error) {
	span := OnlineMinutes + onlineWindow - 1
	// An event aged a keeps its visitor online at the slots whose minute lies
	// between ceil(a)-5 and floor(a) minutes back: a bit range per event, one
	// mask per visitor, then visitors counted per distinct mask so few rows
	// come back however busy the site is.
	rows, err := q.DB.QueryContext(ctx, `
		SELECT mask, count(*) FROM (
			SELECT visitor_id, bit_or(((CAST(1 AS UBIGINT) << CAST(hi - lo + 1 AS INTEGER)) - 1) << CAST(lo AS INTEGER)) AS mask FROM (
				SELECT visitor_id, greatest(0, (age + 59999) // 60000 - ?) AS lo, least(?, age // 60000) AS hi FROM (
					SELECT visitor_id, greatest(0, ? - epoch_ms(ts)) AS age
					FROM events WHERE site_id = ? AND ts >= ?
				)
			) WHERE lo <= hi GROUP BY visitor_id
		) GROUP BY mask`,
		onlineWindow, OnlineMinutes-1, now.UnixMilli(), site, now.Add(-time.Duration(span)*time.Minute).UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	masks := map[uint64]int64{}
	for rows.Next() {
		var m uint64
		var n int64
		if err := rows.Scan(&m, &n); err != nil {
			return nil, err
		}
		masks[m] = n
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]int64, OnlineMinutes)
	for m, n := range masks {
		for j := 0; j < OnlineMinutes; j++ {
			if m&(1<<uint(j)) != 0 {
				out[OnlineMinutes-1-j] += n
			}
		}
	}
	return out, nil
}

const localLayout = "2006-01-02T15:04"

// fillSeries returns one point per bucket from p.From to p.To (local time),
// so charts and API clients never have to guess about missing buckets.
func fillSeries(got map[string]Point, p Params) []Point {
	loc, _ := time.LoadLocation(p.TZ)
	wall := func(t time.Time) time.Time { // local wall clock as a UTC value, like DuckDB returns
		t = t.In(loc)
		return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 0, 0, 0, time.UTC)
	}
	cur, end := wall(p.From), wall(p.To)
	switch p.Bucket {
	case "day":
		cur = cur.Truncate(24 * time.Hour)
	case "week": // Monday, like date_trunc('week'), or Sunday when the site says so
		back := (int(cur.Weekday()) + 6) % 7
		if p.SundayWeeks {
			back = int(cur.Weekday())
		}
		cur = cur.Truncate(24*time.Hour).AddDate(0, 0, -back)
	case "month":
		cur = time.Date(cur.Year(), cur.Month(), 1, 0, 0, 0, 0, time.UTC)
	}
	out := []Point{}
	for i := 0; cur.Before(end) && i < 5000; i++ {
		k := cur.Format(localLayout)
		pt, ok := got[k]
		if !ok {
			pt = Point{T: k}
		}
		out = append(out, pt)
		switch p.Bucket {
		case "hour":
			cur = cur.Add(time.Hour)
		case "day":
			cur = cur.AddDate(0, 0, 1)
		case "week":
			cur = cur.AddDate(0, 0, 7)
		default:
			cur = cur.AddDate(0, 1, 0)
		}
	}
	return out
}
