package query

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// Days brought in from Google Analytics (imported_daily) are counters, never
// events, so they join a report only as whole days, and only the days before
// the site's first event of its own: a day is either imported or recorded,
// never both, so nothing is counted twice. Days that rows from `trckabled
// import` already cover are left out for the same reason.
//
// A report with a filter, or by the hour, leaves them out: a daily total
// cannot say which of its visits a filter would keep.

// Imported says which part of a report came from the import.
type Imported struct {
	Days int    `json:"days"` // imported days in the period
	From string `json:"from"` // first and last of them, YYYY-MM-DD
	To   string `json:"to"`
}

// importedDims maps an imported dimension to the report's breakdown it feeds.
var importedDims = []string{"source", "medium", "page", "country", "device"}

// importedScope is the days of a report that may be imported ones: the
// condition and its arguments, after the connection's site.
func importedScope(p Params, first sql.NullTime) (string, []any, bool) {
	loc, err := time.LoadLocation(p.TZ)
	if err != nil || len(p.Filters) > 0 || p.Bucket == "hour" || !p.To.After(p.From) {
		return "", nil, false
	}
	from := p.From.In(loc).Format(time.DateOnly)
	last := p.To.Add(-time.Nanosecond).In(loc).Format(time.DateOnly)
	var firstDay any
	if first.Valid {
		firstDay = first.Time.In(loc).Format(time.DateOnly)
	}
	return `site_id = ? AND day >= CAST(? AS DATE) AND day <= CAST(? AS DATE)
		AND (CAST(? AS DATE) IS NULL OR day < CAST(? AS DATE))
		AND day NOT IN (SELECT DISTINCT CAST(ts AS DATE) FROM events WHERE site_id = ? AND imported)`,
		[]any{p.Site, from, last, firstDay, firstDay, p.Site}, true
}

// firstRecorded is when the site recorded its first event of its own.
func firstRecorded(ctx context.Context, conn *sql.Conn, site string) (sql.NullTime, error) {
	var first sql.NullTime
	err := conn.QueryRowContext(ctx, `SELECT min(ts) FROM events WHERE site_id = ? AND imported IS NOT TRUE`, site).Scan(&first)
	return first, err
}

// mergeImported adds the imported days to a finished report.
func mergeImported(ctx context.Context, conn *sql.Conn, p Params, res *Result) error {
	first, err := firstRecorded(ctx, conn, p.Site)
	if err != nil {
		return fmt.Errorf("imported days: %w", err)
	}
	scope, args, ok := importedScope(p, first)
	if !ok {
		return nil
	}
	//nolint:gosec // scope is the constant fragment of importedScope and the bucket a checked name; every value is bound
	rows, err := conn.QueryContext(ctx, `
		SELECT `+bucketOf(p, "CAST(day AS TIMESTAMP)")+` AS b, sum(sessions)::BIGINT, sum(users)::BIGINT, sum(views)::BIGINT,
		       count(*)::BIGINT, min(day), max(day)
		FROM imported_daily WHERE `+scope+` AND dim = 'total' GROUP BY b`, args...)
	if err != nil {
		return fmt.Errorf("imported days: %w", err)
	}
	at := map[string]int{}
	for i, pt := range res.Series {
		at[pt.T] = i
	}
	var info Imported
	for rows.Next() {
		var b time.Time
		var sessions, users, views, n int64
		var lo, hi time.Time
		if err := rows.Scan(&b, &sessions, &users, &views, &n, &lo, &hi); err != nil {
			rows.Close()
			return err
		}
		i, ok := at[b.Format(localLayout)]
		if !ok || (sessions == 0 && users == 0 && views == 0) {
			continue
		}
		pt := &res.Series[i]
		pt.Visitors += users
		pt.Pageviews += views
		pt.Imported = true
		res.KPIs.Visitors += users
		res.KPIs.Sessions += sessions
		res.KPIs.Pageviews += views
		info.Days += int(n)
		if f := lo.Format(time.DateOnly); info.From == "" || f < info.From {
			info.From = f
		}
		if l := hi.Format(time.DateOnly); l > info.To {
			info.To = l
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if info.Days == 0 {
		return nil
	}
	res.Imported = &info
	if res.KPIs.Sessions > 0 {
		res.KPIs.ViewsPerSess = float64(res.KPIs.Pageviews) / float64(res.KPIs.Sessions)
	}
	return mergeImportedDims(ctx, conn, p, scope, args, res)
}

func mergeImportedDims(ctx context.Context, conn *sql.Conn, p Params, scope string, args []any, res *Result) error {
	//nolint:gosec // scope is the constant fragment of importedScope; every value is bound
	rows, err := conn.QueryContext(ctx, `
		SELECT dim, value, users, sessions, views FROM (
			SELECT dim, value, sum(users)::BIGINT AS users, sum(sessions)::BIGINT AS sessions, sum(views)::BIGINT AS views
			FROM imported_daily WHERE `+scope+` AND dim != 'total' GROUP BY dim, value
		) QUALIFY row_number() OVER (PARTITION BY dim ORDER BY users DESC, value) <= ?`,
		append(append([]any{}, args...), p.Limit)...)
	if err != nil {
		return fmt.Errorf("imported breakdowns: %w", err)
	}
	defer rows.Close()
	add := map[string][]Row{}
	for rows.Next() {
		var dim string
		var r Row
		if err := rows.Scan(&dim, &r.Value, &r.Visitors, &r.Sessions, &r.Pageviews); err != nil {
			return err
		}
		add[dim] = append(add[dim], r)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, dim := range importedDims {
		have, shown := res.Dims[dim]
		if !shown || len(add[dim]) == 0 {
			continue
		}
		at := map[string]int{}
		merged := append([]Row{}, have...)
		for i, r := range merged {
			at[r.Value] = i
		}
		for _, r := range add[dim] {
			if i, ok := at[r.Value]; ok {
				merged[i].Visitors += r.Visitors
				merged[i].Sessions += r.Sessions
				merged[i].Pageviews += r.Pageviews
				continue
			}
			merged = append(merged, r)
		}
		sortRows(merged)
		if len(merged) > p.Limit {
			merged = merged[:p.Limit]
		}
		res.Dims[dim] = merged
	}
	return nil
}

// ImportedHave says whether every day from..to (YYYY-MM-DD, inclusive) of the
// site has an imported total, which is how an import that stopped halfway
// knows which ranges are done.
func (q Q) ImportedHave(ctx context.Context, site, from, to string) (bool, error) {
	a, err1 := time.Parse(time.DateOnly, from)
	b, err2 := time.Parse(time.DateOnly, to)
	if err1 != nil || err2 != nil || b.Before(a) {
		return false, fmt.Errorf("bad range %s..%s", from, to)
	}
	var n int64
	err := q.DB.QueryRowContext(ctx, `SELECT count(*) FROM imported_daily
		WHERE site_id = ? AND dim = 'total' AND day >= CAST(? AS DATE) AND day <= CAST(? AS DATE)`, site, from, to).Scan(&n)
	return n == int64(b.Sub(a).Hours()/24)+1, err
}

// FirstRecordedDay is the day (in the zone) of the site's first event of its
// own, or "" when there is none: an import that stops the day before it
// leaves nothing double.
func (q Q) FirstRecordedDay(ctx context.Context, site, tz string) (string, error) {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	var first sql.NullTime
	if err := q.DB.QueryRowContext(ctx, `SELECT min(ts) FROM events WHERE site_id = ? AND imported IS NOT TRUE`, site).Scan(&first); err != nil {
		return "", err
	}
	if !first.Valid {
		return "", nil
	}
	return first.Time.In(loc).Format(time.DateOnly), nil
}
