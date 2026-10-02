package query

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// MaxUsualWeeks is how many past weeks "usual" looks back over.
const MaxUsualWeeks = 4

// Usual sets one stretch of a day against the same stretch of the same
// weekday in the weeks before it: what a Friday morning normally brings.
type Usual struct {
	Visitors int64     `json:"visitors"` // in the stretch asked about
	Average  float64   `json:"average"`  // the mean of the weeks that had begun, 0 when none had
	Weeks    []UsualWk `json:"weeks"`    // newest first; only weeks the site existed for
}

// UsualWk is one of those weeks: the date of the day, in the report's zone,
// and its visitors over the same stretch.
type UsualWk struct {
	Day      string `json:"day"`
	Visitors int64  `json:"visitors"`
}

// Usual reads Params' range (From and To, UTC) and the same range moved back
// whole weeks on the wall clock, so a daylight-saving change does not shift
// the hours. A week from before the site's first visit is left out: it would
// pull the average down for nothing. Filters apply as in the report.
func (q Q) Usual(ctx context.Context, p Params, weeks int) (*Usual, error) {
	if weeks < 1 || weeks > MaxUsualWeeks {
		return nil, fmt.Errorf("look back 1 to %d weeks", MaxUsualWeeks)
	}
	tz, err := safeTZ(p.TZ)
	if err != nil {
		return nil, err
	}
	loc, _ := time.LoadLocation(tz)
	conn, err := q.DB.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	if err := q.loadOpen(ctx, conn, p.Site); err != nil {
		return nil, err
	}
	defer func() { _, _ = conn.ExecContext(context.Background(), `DROP TABLE IF EXISTS s_open`) }()

	visitors := func(from, to time.Time) (n int64, err error) {
		pw := p
		pw.From, pw.To = from.UTC(), to.UTC()
		cte, args, err := sessionsCTE(pw)
		if err != nil {
			return 0, err
		}
		err = conn.QueryRowContext(ctx, cte+` SELECT count(DISTINCT visitor_id) FROM s`, args...).Scan(&n)
		return n, err
	}
	out := &Usual{}
	if out.Visitors, err = visitors(p.From, p.To); err != nil {
		return nil, fmt.Errorf("usual: %w", err)
	}
	var first sql.NullTime
	if err := conn.QueryRowContext(ctx, `SELECT min(start) FROM sessions WHERE site_id = ?`, p.Site).Scan(&first); err != nil {
		return nil, fmt.Errorf("usual: %w", err)
	}
	var sum int64
	for w := 1; w <= weeks; w++ {
		from, to := p.From.In(loc).AddDate(0, 0, -7*w), p.To.In(loc).AddDate(0, 0, -7*w)
		// A week begun before the site's first visit counts for nothing.
		if !first.Valid || to.Before(first.Time) {
			continue
		}
		n, err := visitors(from, to)
		if err != nil {
			return nil, fmt.Errorf("usual: %w", err)
		}
		out.Weeks = append(out.Weeks, UsualWk{Day: from.Format("2006-01-02"), Visitors: n})
		sum += n
	}
	if len(out.Weeks) > 0 {
		out.Average = float64(sum) / float64(len(out.Weeks))
	}
	return out, nil
}
