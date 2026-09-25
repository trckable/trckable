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

	"github.com/trckable/trckable/server/internal/fx"
	"github.com/trckable/trckable/server/internal/ledger"
)

// Payments returns a site's ledger facts for [from, to) in the site
// currency; enabled is false when no provider was ever connected.
type Payments func(ctx context.Context, site, currency string, from, to time.Time, test bool) (facts []ledger.Fact, enabled bool, err error)

// The two attribution models. Both look inside AttributionWindow and both
// prefer a visit that came from somewhere over a Direct one; they differ only
// in which end of that window they take.
const (
	LastTouch  = "last"  // the visit just before the sale: what closed it
	FirstTouch = "first" // the visit that started it: what found them
)

// AttributionWindow is how far back a payment looks for the visit that
// earned it.
const AttributionWindow = 90 * 24 * time.Hour

// Money is a report's revenue, in minor units of Currency.
type Money struct {
	Currency       string  `json:"currency"`
	Exponent       int     `json:"exponent"` // minor-unit digits (2 for USD, 0 for JPY)
	Revenue        int64   `json:"revenue"`  // paid, minus tax, minus refunds and lost disputes
	Refunds        int64   `json:"refunds"`
	Payments       int64   `json:"payments"`
	Customers      int64   `json:"customers"`
	PayingVisitors int64   `json:"paying_visitors"` // visitors in this period who paid (attributed)
	Conversion     float64 `json:"conversion"`      // paying visitors / visitors
	PerVisitor     float64 `json:"revenue_per_visitor"`
	NewRevenue     int64   `json:"new_revenue"`     // one-time + first subscription payments
	RenewalRevenue int64   `json:"renewal_revenue"` // later subscription payments
	Unattributed   int64   `json:"unattributed"`    // revenue with no known visit (no metadata, no link)
	Unconverted    int64   `json:"unconverted"`     // payments waiting for an FX rate (not in the sums yet)
	Test           bool    `json:"test,omitempty"`
}

// DayMoney is one day's revenue for the scrubber and the chart's tooltip.
// New and renewal are split the same way the period total is, so a day that looks
// flat can still show that all of it was renewals.
type DayMoney struct {
	Revenue  int64 `json:"revenue"`
	Payments int64 `json:"payments"`
	New      int64 `json:"new"`     // one-time and first subscription payments
	Renewal  int64 `json:"renewal"` // later subscription payments
}

// Attribution model: each payment belongs to its visitor's last non-direct
// session in the 90 days before it was paid (Direct only when that is all
// there is); a renewal belongs to the visit that started its subscription. Filters apply to that session, so "channel = AI" shows revenue
// earned by AI-assistant visits, even when the purchase came later.
func (q Q) revenue(ctx context.Context, conn *sql.Conn, p Params, cte string, cteArgs []any, res *Result) error {
	cur := p.Currency
	if cur == "" {
		cur = "USD"
	}
	facts, enabled, err := q.Payments(ctx, p.Site, cur, p.From, p.To, p.Test)
	if err != nil || !enabled {
		return err
	}
	m := &Money{Currency: cur, Exponent: fx.Exponent(cur), Test: p.Test}
	res.Money = m
	if err := loadFacts(ctx, conn, facts); err != nil {
		return err
	}
	defer conn.ExecContext(context.Background(), `DROP TABLE IF EXISTS p_facts`)
	for _, f := range facts {
		if !f.Converted {
			m.Unconverted++
		}
	}
	if len(facts) == 0 {
		for i := range res.Series {
			res.Series[i].Revenue = 0
		}
		return nil
	}

	tz, err := safeTZ(p.TZ)
	if err != nil {
		return err
	}
	evFrom := p.From.Add(-AttributionWindow)
	for _, f := range facts {
		if t := f.TouchAt.Add(-AttributionWindow); !f.TouchAt.IsZero() && t.Before(evFrom) {
			evFrom = t
		}
	}
	fwhere, fargs, err := filterWhere(p, evFrom, p.To)
	if err != nil {
		return err
	}
	scope := " WHERE converted"
	if fwhere != "" {
		scope = fwhere + " AND converted AND attributed"
	}
	winFrom := p.From.Add(-AttributionWindow)
	for _, f := range facts { // renewals look back from their subscription's start
		if t := f.TouchAt.Add(-AttributionWindow); !f.TouchAt.IsZero() && t.Before(winFrom) {
			winFrom = t
		}
	}
	// Both models weight a visit the same way — anything but Direct wins — and
	// then take the latest or the earliest. The bonus is larger than any
	// timestamp, so the preference always decides first.
	when := "epoch_ms(c.start)"
	if p.Attribution == FirstTouch {
		when = "-epoch_ms(c.start)"
	}
	sqlText := cte + `,
		f AS (SELECT * FROM p_facts),
		cand AS (
			SELECT * FROM sessions WHERE site_id = ? AND start >= ? AND start < ? AND visitor_id IN (SELECT visitor_id FROM f WHERE visitor_id <> 0)
			UNION ALL
			SELECT * FROM s_open WHERE site_id = ? AND start >= ? AND start < ? AND visitor_id IN (SELECT visitor_id FROM f WHERE visitor_id <> 0)
		),
		touch AS (
			SELECT f.payment_id,
			       max_by(c.session_id, (CASE WHEN coalesce(c.channel, 'Direct') <> 'Direct' THEN 4398046511104 ELSE 0 END) + ` + when + `) AS sid
			FROM f JOIN cand c ON c.visitor_id = f.visitor_id AND c.start <= f.touch_at + INTERVAL 1 MINUTE AND c.start >= f.touch_at - INTERVAL 90 DAY
			GROUP BY f.payment_id
		),
		a AS (
			SELECT f.payment_id, f.visitor_id, f.paid_at, f.amount, f.refunded, f.customer, f.kind, f.converted,
			       t.sid IS NOT NULL AS attributed,
			       ((f.paid_at AT TIME ZONE 'UTC') AT TIME ZONE '` + tz + `') AS lpaid,
			       c.* EXCLUDE (site_id, visitor_id)
			FROM f LEFT JOIN touch t USING (payment_id) LEFT JOIN cand c ON c.session_id = t.sid AND c.visitor_id = f.visitor_id
		),
		ar AS (SELECT * FROM a` + scope + `)`
	args := append(append([]any{}, cteArgs...), p.Site, winFrom, p.To, p.Site, winFrom, p.To)
	args = append(args, fargs...)

	// Headline money.
	if err := conn.QueryRowContext(ctx, sqlText+`
		SELECT coalesce(sum(amount - refunded), 0), coalesce(sum(refunded), 0), count(*), count(DISTINCT customer),
		       coalesce(sum(amount - refunded) FILTER (kind <> 'renewal'), 0),
		       coalesce(sum(amount - refunded) FILTER (kind = 'renewal'), 0),
		       coalesce(sum(amount - refunded) FILTER (NOT attributed), 0),
		       count(DISTINCT visitor_id) FILTER (visitor_id <> 0 AND visitor_id IN (SELECT visitor_id FROM s))
		FROM ar`, args...).Scan(&m.Revenue, &m.Refunds, &m.Payments, &m.Customers, &m.NewRevenue, &m.RenewalRevenue, &m.Unattributed, &m.PayingVisitors); err != nil {
		return fmt.Errorf("money: %w", err)
	}
	if v := res.KPIs.Visitors; v > 0 {
		m.Conversion = float64(m.PayingVisitors) / float64(v)
		m.PerVisitor = float64(m.Revenue) / float64(v)
	}

	// Revenue over time (by payment date).
	rows, err := conn.QueryContext(ctx, sqlText+`
		SELECT strftime(`+bucketOf(p, "lpaid")+`, '%Y-%m-%dT%H:%M'), sum(amount - refunded) FROM ar GROUP BY 1`, args...)
	if err != nil {
		return fmt.Errorf("revenue series: %w", err)
	}
	byT := map[string]int64{}
	for rows.Next() {
		var t string
		var v int64
		if err := rows.Scan(&t, &v); err != nil {
			rows.Close()
			return err
		}
		byT[t] = v
	}
	rows.Close()
	for i := range res.Series {
		res.Series[i].Revenue = byT[res.Series[i].T]
	}

	// Revenue by every breakdown dimension, from the attributed session.
	cols := make([]string, len(DefaultDims))
	sets := make([]string, len(DefaultDims))
	gcols := make([]string, len(DefaultDims))
	for i, d := range DefaultDims {
		g := fmt.Sprintf("d%d", i)
		cols[i] = sessionDims[d] + " AS " + g
		sets[i] = "(" + g + ")"
		gcols[i] = g
	}
	limit := p.Limit
	if limit <= 0 {
		limit = 10
	}
	rows, err = conn.QueryContext(ctx, sqlText+`, t AS (SELECT `+strings.Join(cols, ", ")+`, amount - refunded AS net, customer FROM ar WHERE attributed)
		SELECT gid, v, rev, payers FROM (
			SELECT GROUPING(`+strings.Join(gcols, ", ")+`) AS gid, coalesce(`+strings.Join(gcols, ", ")+`) AS v,
			       sum(net) AS rev, count(DISTINCT customer) AS payers
			FROM t GROUP BY GROUPING SETS (`+strings.Join(sets, ", ")+`)
		) WHERE v IS NOT NULL`, args...)
	if err != nil {
		return fmt.Errorf("revenue breakdowns: %w", err)
	}
	type rv struct{ rev, payers int64 }
	byDim := map[string]map[string]rv{}
	gid := gidFor(DefaultDims)
	for rows.Next() {
		var g, rev, payers int64
		var v string
		if err := rows.Scan(&g, &v, &rev, &payers); err != nil {
			rows.Close()
			return err
		}
		if d, ok := gid[g]; ok {
			if byDim[d] == nil {
				byDim[d] = map[string]rv{}
			}
			byDim[d][v] = rv{rev, payers}
		}
	}
	rows.Close()
	res.RevenueDims = map[string][]Row{}
	for _, d := range DefaultDims {
		zero := int64(0)
		for i := range res.Dims[d] {
			r := &res.Dims[d][i]
			if x, ok := byDim[d][r.Value]; ok {
				rev := x.rev
				r.Revenue, r.Payers = &rev, x.payers
			} else {
				r.Revenue = &zero
			}
		}
		var top []Row
		for v, x := range byDim[d] {
			rev := x.rev
			top = append(top, Row{Value: v, Revenue: &rev, Payers: x.payers})
		}
		sortByRevenue(top)
		if len(top) > limit {
			top = top[:limit]
		}
		if len(top) > 0 {
			res.RevenueDims[d] = top
		}
	}

	// Per day, for the scrubber.
	if p.Daily {
		rows, err := conn.QueryContext(ctx, sqlText+`
			SELECT strftime(lpaid, '%Y-%m-%d'), sum(amount - refunded), count(*),
			       coalesce(sum(amount - refunded) FILTER (kind <> 'renewal'), 0),
			       coalesce(sum(amount - refunded) FILTER (kind = 'renewal'), 0)
			FROM ar GROUP BY 1`, args...)
		if err != nil {
			return fmt.Errorf("daily revenue: %w", err)
		}
		money := map[string]*DayMoney{}
		for rows.Next() {
			var d string
			var dm DayMoney
			if err := rows.Scan(&d, &dm.Revenue, &dm.Payments, &dm.New, &dm.Renewal); err != nil {
				rows.Close()
				return err
			}
			money[d] = &dm
		}
		rows.Close()
		for i := range res.Days {
			if dm, ok := money[res.Days[i].Date]; ok {
				res.Days[i].Money = dm
				delete(money, res.Days[i].Date)
			} else {
				res.Days[i].Money = &DayMoney{}
			}
		}
		for d, dm := range money { // a sale on a day without visits
			res.Days = append(res.Days, Day{Date: d, Dims: map[string][]Row{}, Money: dm})
		}
		sortDays(res.Days)
	}
	return nil
}

func loadFacts(ctx context.Context, conn *sql.Conn, facts []ledger.Fact) error {
	if _, err := conn.ExecContext(ctx, `CREATE OR REPLACE TEMP TABLE p_facts (
		payment_id VARCHAR, visitor_id UBIGINT, paid_at TIMESTAMP, touch_at TIMESTAMP, amount BIGINT, refunded BIGINT,
		customer VARCHAR, kind VARCHAR, converted BOOLEAN)`); err != nil {
		return err
	}
	if len(facts) == 0 {
		return nil
	}
	return conn.Raw(func(dc any) error {
		app, err := duckdb.NewAppender(dc.(driver.Conn), "temp", "main", "p_facts")
		if err != nil {
			return err
		}
		for _, f := range facts {
			amount, refunded := f.Amount, f.Refunded
			if !f.Converted {
				amount, refunded = 0, 0
			}
			touch := f.TouchAt
			if touch.IsZero() {
				touch = f.PaidAt
			}
			if err := app.AppendRow(f.Provider+":"+f.ID, f.Visitor, f.PaidAt.UTC(), touch.UTC(), amount, refunded, f.Customer, f.Kind, f.Converted); err != nil {
				app.Close()
				return err
			}
		}
		return app.Close()
	})
}

func sortByRevenue(rs []Row) {
	sort.SliceStable(rs, func(i, j int) bool {
		if *rs[i].Revenue != *rs[j].Revenue {
			return *rs[i].Revenue > *rs[j].Revenue
		}
		return rs[i].Value < rs[j].Value
	})
}

func sortDays(ds []Day) { sort.Slice(ds, func(i, j int) bool { return ds[i].Date < ds[j].Date }) }
