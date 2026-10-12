package query

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"time"
)

// The bounce guide: whether visitors leave after one page more (or less) than
// usual, and which pages, sources and slow loads explain it. "Usual" is the
// same site over the four weeks before the period. Aggregates only.

const (
	// BounceWeeks is how far back "usual" looks.
	BounceWeeks = 4
	// bounceMinSessions is how many visits a period needs before it is judged.
	bounceMinSessions = 100
	// bounceNormal is the gap (as a share) under which the rate is just usual.
	bounceNormal = 0.10
	// bounceCauseGap is how far above the site's usual a row must sit to be a cause.
	bounceCauseGap = 0.15
	// bounceCauseSessions and bounceCauseShare are the least a row must carry.
	bounceCauseSessions = 30
	bounceCauseShare    = 0.05
	// BounceMaxCauses is the most causes the guide names.
	BounceMaxCauses = 3
)

// BounceCause is one row that explains the gap.
type BounceCause struct {
	Kind   string   `json:"kind"`  // page | source_device | speed
	Label  string   `json:"label"` // the page path, or "Search · Mobile"
	Source string   `json:"source,omitempty"`
	Device string   `json:"device,omitempty"`
	Rate   float64  `json:"rate"`
	Share  float64  `json:"share_of_visits"`
	Was    *float64 `json:"was"`              // its own rate over the usual weeks, null when it had too few visits
	LCP    int64    `json:"lcp_ms,omitempty"` // speed: the page's 75th percentile LCP
}

// BounceDay is one day's rate and how many visits it rests on.
type BounceDay struct {
	Day      string  `json:"day"`
	Rate     float64 `json:"rate"`
	Sessions int64   `json:"sessions"`
}

// BounceGuide is the answer.
type BounceGuide struct {
	Direction string        `json:"direction"` // high | low | normal
	Rate      float64       `json:"rate"`
	Usual     float64       `json:"usual"`
	Sessions  int64         `json:"sessions"`
	Since     string        `json:"since,omitempty"` // first day (site zone) the daily rate left the usual
	Days      []BounceDay   `json:"days"`            // the daily rate over the usual weeks and the period, oldest first; empty when nothing is judged
	Causes    []BounceCause `json:"causes"`
}

type bounceGroup struct {
	n    int64
	rate float64
}

// BounceGuide reads Params' range and the four weeks before it. Filters apply
// to both. Speed causes need vitals, so pass vitals=false when that module is off.
func (q Q) BounceGuide(ctx context.Context, p Params, vitals bool) (*BounceGuide, error) {
	tz, err := safeTZ(p.TZ)
	if err != nil {
		return nil, err
	}
	loc, _ := time.LoadLocation(tz)
	p.TZ = tz
	out := &BounceGuide{Direction: "normal", Causes: []BounceCause{}, Days: []BounceDay{}}
	prior := p
	prior.From, prior.To = p.From.In(loc).AddDate(0, 0, -7*BounceWeeks).UTC(), p.From

	var cur, usual map[string]bounceGroup
	var curPages, curSD, usualPages, usualSD map[[2]string]bounceGroup
	var days []BounceDay
	err = func() error {
		conn, err := q.DB.Conn(ctx)
		if err != nil {
			return err
		}
		defer conn.Close()
		if err := q.loadOpen(ctx, conn, p.Site); err != nil {
			return err
		}
		defer func() { _, _ = conn.ExecContext(context.Background(), `DROP TABLE IF EXISTS s_open`) }()
		if cur, err = bounceTotal(ctx, conn, p); err != nil {
			return err
		}
		if usual, err = bounceTotal(ctx, conn, prior); err != nil {
			return err
		}
		out.Sessions = cur["all"].n
		out.Rate, out.Usual = cur["all"].rate, usual["all"].rate
		gap := out.Rate - out.Usual
		if out.Sessions < bounceMinSessions || usual["all"].n < bounceMinSessions || abs(gap) < bounceNormal {
			return nil
		}
		out.Direction = "high"
		if gap < 0 {
			out.Direction = "low"
		}
		both := p
		both.From = prior.From
		if days, err = bounceDays(ctx, conn, both); err != nil {
			return err
		}
		if out.Direction == "low" {
			return nil
		}
		pageE, sdE1, sdE2 := sessionDims["entry_page"], sessionDims["channel"], sessionDims["device"]
		if curPages, err = bounceGroups(ctx, conn, p, pageE, `''`); err != nil {
			return err
		}
		if curSD, err = bounceGroups(ctx, conn, p, sdE1, sdE2); err != nil {
			return err
		}
		if usualPages, err = bounceGroups(ctx, conn, prior, pageE, `''`); err != nil {
			return err
		}
		usualSD, err = bounceGroups(ctx, conn, prior, sdE1, sdE2)
		return err
	}()
	if err != nil {
		return nil, fmt.Errorf("bounce guide: %w", err)
	}
	if out.Direction == "normal" {
		return out, nil
	}
	out.Days = days
	out.Since = bounceSince(days, p.From.In(loc).Format("2006-01-02"), out.Usual, out.Direction)
	if out.Direction == "low" {
		return out, nil
	}

	type cand struct {
		c      BounceCause
		impact float64
	}
	var cands []cand
	total := float64(out.Sessions)
	explains := func(g bounceGroup) bool {
		return g.n >= bounceCauseSessions && float64(g.n)/total >= bounceCauseShare && g.rate >= out.Usual+bounceCauseGap
	}
	was := func(g bounceGroup, ok bool) *float64 {
		if !ok || g.n < 10 {
			return nil
		}
		r := g.rate
		return &r
	}
	for k, g := range curPages {
		if !explains(g) {
			continue
		}
		u, ok := usualPages[k]
		cands = append(cands, cand{BounceCause{Kind: "page", Label: k[0], Rate: g.rate, Share: float64(g.n) / total, Was: was(u, ok)}, (g.rate - out.Usual) * float64(g.n)})
	}
	for k, g := range curSD {
		if !explains(g) {
			continue
		}
		u, ok := usualSD[k]
		cands = append(cands, cand{BounceCause{Kind: "source_device", Label: k[0] + " · " + k[1], Source: k[0], Device: k[1], Rate: g.rate, Share: float64(g.n) / total, Was: was(u, ok)}, (g.rate - out.Usual) * float64(g.n)})
	}
	if vitals {
		slow, err := q.slowPages(ctx, p)
		if err != nil {
			return nil, err
		}
		for _, c := range append([]cand(nil), cands...) {
			if lcp, ok := slow[c.c.Label]; ok && c.c.Kind == "page" {
				s := c.c
				s.Kind, s.LCP = "speed", lcp
				cands = append(cands, cand{s, c.impact * 0.999})
			}
		}
	}
	sort.SliceStable(cands, func(i, j int) bool {
		if cands[i].impact != cands[j].impact {
			return cands[i].impact > cands[j].impact
		}
		return cands[i].c.Label < cands[j].c.Label
	})
	for _, c := range cands {
		if len(out.Causes) == BounceMaxCauses {
			break
		}
		out.Causes = append(out.Causes, c.c)
	}
	return out, nil
}

func abs(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}

// slowPages are the pages whose 75th percentile LCP is over Google's "good".
func (q Q) slowPages(ctx context.Context, p Params) (map[string]int64, error) {
	p.Limit = 100
	v, err := q.VitalsFor(ctx, p)
	if err != nil {
		return nil, err
	}
	out := map[string]int64{}
	for _, r := range v.Rows {
		if r.Visitors > GoodLCP {
			out[r.Value] = r.Visitors
		}
	}
	return out, nil
}

func bounceTotal(ctx context.Context, conn *sql.Conn, p Params) (map[string]bounceGroup, error) {
	cte, args, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	var g bounceGroup
	if err := conn.QueryRowContext(ctx, cte+` SELECT count(*), coalesce(avg(`+bounce+`), 0) FROM s`, args...).Scan(&g.n, &g.rate); err != nil {
		return nil, err
	}
	return map[string]bounceGroup{"all": g}, nil
}

// bounceGroups groups the sessions by two expressions from sessionDims (or a
// constant), the busiest few hundred groups.
func bounceGroups(ctx context.Context, conn *sql.Conn, p Params, e1, e2 string) (map[[2]string]bounceGroup, error) {
	cte, args, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	//nolint:gosec // e1 and e2 come from the fixed sessionDims map or a constant
	rows, err := conn.QueryContext(ctx, cte+`, t AS (SELECT `+e1+` AS k1, `+e2+` AS k2, pvs, goals FROM s)
		SELECT k1, k2, count(*), avg(`+bounce+`) FROM t WHERE k1 IS NOT NULL AND k2 IS NOT NULL
		GROUP BY 1, 2 ORDER BY 3 DESC, 1, 2 LIMIT 500`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[[2]string]bounceGroup{}
	for rows.Next() {
		var k [2]string
		var g bounceGroup
		if err := rows.Scan(&k[0], &k[1], &g.n, &g.rate); err != nil {
			return nil, err
		}
		out[k] = g
	}
	return out, rows.Err()
}

func bounceDays(ctx context.Context, conn *sql.Conn, p Params) ([]BounceDay, error) {
	cte, args, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	rows, err := conn.QueryContext(ctx, cte+` SELECT CAST(lstart AS DATE), count(*), avg(`+bounce+`) FROM s GROUP BY 1 ORDER BY 1`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []BounceDay
	for rows.Next() {
		var d time.Time
		var r BounceDay
		if err := rows.Scan(&d, &r.Sessions, &r.Rate); err != nil {
			return nil, err
		}
		r.Day = d.Format("2006-01-02")
		out = append(out, r)
	}
	return out, rows.Err()
}

// bounceSince is the first day of the period (from, as YYYY-MM-DD) with enough
// visits whose rate was clearly past the usual, in the direction the period
// went. Empty when no single day was.
func bounceSince(days []BounceDay, from string, usual float64, dir string) string {
	for _, d := range days {
		if d.Day < from || d.Sessions < 10 {
			continue
		}
		if dir == "high" && d.Rate >= usual+bounceNormal || dir == "low" && d.Rate <= usual-bounceNormal {
			return d.Day
		}
	}
	return ""
}
