package query

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/trckable/trckable/server/internal/fx"
)

// What slow pages cost: the period's visits sorted by how long their slowest
// page took to paint, with what each group did. The comparison itself (what a
// slow visit would have earned if it had loaded like a fast one) is arithmetic
// on these counts and is left to the dashboard; this only reads them, the way
// the report reads them (its filters, its attribution, test payments when it
// asks for them).

// The bands are Google's: poor above 4 s, needs work above 2.5 s.
const (
	SlowLCP = 4000 // ms
	// BandPages is how many of a band's pages come with it, busiest first.
	BandPages = 10
)

// SlowBand is one speed band of the period.
type SlowBand struct {
	Band    string   `json:"band"` // slow | mid | fast
	Visits  int64    `json:"visits"`
	Goals   int64    `json:"goals"`           // visits that reached a goal
	Engaged int64    `json:"engaged"`         // visits that read more than a page or reached a goal
	Paid    int64    `json:"paid"`            // visits credited with a payment
	Revenue int64    `json:"revenue"`         // net of refunds, minor units
	Orders  int64    `json:"orders"`          // payments credited to these visits
	Pages   []string `json:"pages,omitempty"` // the band's own pages (their 75th percentile falls in it), busiest first
}

// SlowCost is the three bands, slowest first. Money is absent until a payment
// provider is connected (and the revenue module is on).
type SlowCost struct {
	Bands    []SlowBand `json:"bands"`
	Currency string     `json:"currency,omitempty"`
	Exponent int        `json:"exponent,omitempty"`
	Money    bool       `json:"money"`
	// Days is how many days of the period have a measured page view: the stretch
	// the counts cover, which the dashboard scales to a month.
	Days int `json:"days"`
}

// bandSQL names the band an LCP in ms falls in; its two placeholders take
// SlowLCP and GoodLCP, in that order.
const bandSQL = `CASE WHEN lcp > ? THEN 'slow' WHEN lcp > ? THEN 'mid' ELSE 'fast' END`

// SlowCostFor reads the bands. A visit's speed is the LCP of its first measured
// page view, the page it landed on; a visit with no measured page view is in no
// band.
func (q Q) SlowCostFor(ctx context.Context, p Params) (*SlowCost, error) {
	out, err := q.slowCost(ctx, p)
	if err != nil && isOutOfMemory(err) {
		out, err = q.slowCost(ctx, p)
	}
	return out, err
}

func (q Q) slowCost(ctx context.Context, p Params) (*SlowCost, error) {
	if p.TZ == "" {
		p.TZ = "UTC"
	}
	if err := acquireReport(ctx); err != nil {
		return nil, err
	}
	defer releaseReport()
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer func() {
		_, _ = conn.ExecContext(context.Background(), `DROP TABLE IF EXISTS sl_pv`)
		_, _ = conn.ExecContext(context.Background(), `DROP TABLE IF EXISTS sl_sess`)
		_, _ = conn.ExecContext(context.Background(), `DROP TABLE IF EXISTS sl_s`)
		_, _ = conn.ExecContext(context.Background(), `DROP TABLE IF EXISTS p_facts`)
		q.done(conn)
	}()

	cte, cargs, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	// The period's visits, filtered, read once; everything below reads this.
	if _, err := conn.ExecContext(ctx, `CREATE OR REPLACE TEMP TABLE sl_sess AS `+cte+`
		SELECT session_id, pvs, goals FROM s`, cargs...); err != nil {
		return nil, fmt.Errorf("slow cost visits: %w", err)
	}
	// One row per page view that reported a paint, with the visit it belongs
	// to and when. A browser reports again each time the page is hidden; the
	// largest report is the final one (as in VitalsFor). Reports arrive after
	// their page view, so a day's grace covers any real page.
	if _, err := conn.ExecContext(ctx, `CREATE OR REPLACE TEMP TABLE sl_pv AS
		SELECT any_value(e.session_id) AS sid, any_value(e.path) AS path, min(e.ts) AS ts, max(x.lcp_ms) AS lcp
		FROM events e JOIN events x
		  ON x.site_id = e.site_id AND x.pageview_id = e.pageview_id AND x.kind = 3 AND x.lcp_ms IS NOT NULL
		 AND x.ts >= ? AND x.ts < ? + INTERVAL 1 DAY
		WHERE e.site_id = ? AND e.ts >= ? AND e.ts < ? AND e.kind = 1 AND e.path IS NOT NULL
		  AND e.session_id IN (SELECT session_id FROM sl_sess)
		GROUP BY e.pageview_id`, p.From, p.To, p.Site, p.From, p.To); err != nil {
		return nil, fmt.Errorf("slow cost page views: %w", err)
	}
	if _, err := conn.ExecContext(ctx, `CREATE OR REPLACE TEMP TABLE sl_s AS
		SELECT t.session_id, t.pvs, t.goals, `+bandSQL+` AS band
		FROM sl_sess t JOIN (SELECT sid, arg_min(lcp, ts) AS lcp FROM sl_pv GROUP BY sid) m ON m.sid = t.session_id`, SlowLCP, GoodLCP); err != nil {
		return nil, fmt.Errorf("slow cost bands: %w", err)
	}

	by := map[string]*SlowBand{"slow": {Band: "slow"}, "mid": {Band: "mid"}, "fast": {Band: "fast"}}
	rows, err := conn.QueryContext(ctx, `SELECT band, count(*), count(*) FILTER (goals > 0), count(*) FILTER (NOT (pvs <= 1 AND goals = 0)) FROM sl_s GROUP BY band`)
	if err != nil {
		return nil, fmt.Errorf("slow cost bands: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var b string
		var v, g, e int64
		if err := rows.Scan(&b, &v, &g, &e); err != nil {
			return nil, err
		}
		by[b].Visits, by[b].Goals, by[b].Engaged = v, g, e
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// The pages of each band: a page belongs to the band its own 75th
	// percentile falls in, as the Speed table rates it, once it has views
	// enough to mean something.
	prows, err := conn.QueryContext(ctx, `SELECT path, `+bandSQL+` AS band FROM (
			SELECT path, quantile_cont(lcp, 0.75) AS lcp, count(*) AS n FROM sl_pv GROUP BY path HAVING count(*) >= 3
		) ORDER BY n DESC, path`, SlowLCP, GoodLCP)
	if err != nil {
		return nil, fmt.Errorf("slow cost pages: %w", err)
	}
	defer prows.Close()
	for prows.Next() {
		var path, b string
		if err := prows.Scan(&path, &b); err != nil {
			return nil, err
		}
		if len(by[b].Pages) < BandPages {
			by[b].Pages = append(by[b].Pages, path)
		}
	}
	if err := prows.Err(); err != nil {
		return nil, err
	}

	out := &SlowCost{}
	tz, err := safeTZ(p.TZ)
	if err != nil {
		return nil, err
	}
	if err := conn.QueryRowContext(ctx, `SELECT count(DISTINCT CAST((ts AT TIME ZONE 'UTC') AT TIME ZONE '`+tz+`' AS DATE)) FROM sl_pv`).Scan(&out.Days); err != nil {
		return nil, fmt.Errorf("slow cost days: %w", err)
	}
	if q.Payments != nil && p.Revenue {
		if err := q.slowMoney(ctx, conn, p, cte, cargs, by, out); err != nil {
			return nil, err
		}
	}
	for _, b := range []string{"slow", "mid", "fast"} {
		out.Bands = append(out.Bands, *by[b])
	}
	return out, nil
}

// slowMoney adds the payments each band's visits earned, credited the way the
// report credits them.
func (q Q) slowMoney(ctx context.Context, conn *sql.Conn, p Params, cte string, cargs []any, by map[string]*SlowBand, out *SlowCost) error {
	cur := p.Currency
	if cur == "" {
		cur = "USD"
	}
	facts, enabled, err := q.Payments(ctx, p.Site, cur, p.From, p.To, p.Test)
	if err != nil || !enabled {
		return err
	}
	out.Money, out.Currency, out.Exponent = true, cur, fx.Exponent(cur)
	if len(facts) == 0 {
		return nil
	}
	if err := loadFacts(ctx, conn, facts); err != nil {
		return err
	}
	sqlText, args, _, err := attributedSQL(p, facts, cte, cargs)
	if err != nil {
		return err
	}
	rows, err := conn.QueryContext(ctx, sqlText+`
		SELECT sl_s.band, count(DISTINCT ar.session_id), coalesce(sum(ar.amount - ar.refunded), 0), count(*)
		FROM ar JOIN sl_s ON sl_s.session_id = ar.session_id GROUP BY sl_s.band`, args...)
	if err != nil {
		return fmt.Errorf("slow cost money: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var b string
		var paid, rev, n int64
		if err := rows.Scan(&b, &paid, &rev, &n); err != nil {
			return err
		}
		by[b].Paid, by[b].Revenue, by[b].Orders = paid, rev, n
	}
	return rows.Err()
}
