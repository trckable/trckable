package milestones

import (
	"context"
	"database/sql"
	"math"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/fx"
	"github.com/trckable/trckable/server/internal/ledger"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Due says which finished day a site's check would cover (yesterday, in its
// own time) and whether that day has not been checked yet.
func Due(site sqlite.MilestoneSite, now time.Time) (today, yesterday string, due bool) {
	loc, err := time.LoadLocation(site.Timezone)
	if err != nil {
		loc = time.UTC
	}
	t := now.In(loc)
	today = t.Format("2006-01-02")
	yesterday = t.AddDate(0, 0, -1).Format("2006-01-02")
	return today, yesterday, site.Day != yesterday
}

// History is a site's finished days: the session rollups from the analytics
// store and the real payments from the ledger, merged by day.
func History(ctx context.Context, q query.Q, ctl *sql.DB, site, tz, currency, before string) ([]Day, error) {
	rows, err := q.MilestoneDays(ctx, site, tz, before)
	if err != nil {
		return nil, err
	}
	byDay := map[string]*Day{}
	days := make([]Day, 0, len(rows))
	for _, r := range rows {
		days = append(days, Day{Day: r.Day, Visitors: float64(r.Visitors), Pageviews: float64(r.Pageviews), Countries: float64(r.Countries), Goal: r.Goals})
	}
	sales, err := paidByDay(ctx, ctl, site, tz, currency, before)
	if err != nil {
		return nil, err
	}
	for i := range days {
		byDay[days[i].Day] = &days[i]
	}
	// A day with a sale and no visit is still a day.
	for day, s := range sales {
		if d, ok := byDay[day]; ok {
			d.Revenue, d.Sale = s, true
			continue
		}
		days = append(days, Day{Day: day, Revenue: s, Sale: true})
	}
	sortDays(days)
	return days, nil
}

// paidByDay sums a site's real payments per day, net of tax and of what
// was refunded or lost to a dispute, in major units of the site's own
// currency. Payments in another currency count as a sale but add nothing:
// adding yen to dollars would be a wrong number. A payment refunded in full
// is not a sale.
func paidByDay(ctx context.Context, db *sql.DB, site, tz, currency, before string) (map[string]float64, error) {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	// The rates are only read from the store; a payment in another currency
	// adds nothing anyway.
	facts, err := ledger.Facts(ctx, db, &fx.Rates{DB: db}, site, currency, time.Unix(0, 0), time.Now().AddDate(1, 0, 0), false)
	if err != nil {
		return nil, err
	}
	out := map[string]float64{}
	unit := math.Pow10(fx.Exponent(currency))
	for _, f := range facts {
		day := f.PaidAt.In(loc).Format("2006-01-02")
		if day >= before {
			continue
		}
		if !strings.EqualFold(f.Currency, currency) {
			out[day] += 0
			continue
		}
		net := f.Amount - f.Refunded
		if net <= 0 {
			continue
		}
		out[day] += float64(net) / unit
	}
	return out, nil
}

// Check runs one site's check if its last finished day has not been
// checked, and returns the milestones it added that are new (not quiet).
// Running it again for the same day does nothing.
func Check(ctx context.Context, q query.Q, ctl *sqlite.Store, site sqlite.MilestoneSite, now time.Time) ([]sqlite.Milestone, error) {
	today, yesterday, due := Due(site, now)
	if !due {
		return nil, nil
	}
	days, err := History(ctx, q, ctl.DB, site.ID, site.Timezone, site.Currency, today)
	if err != nil {
		return nil, err
	}
	added, err := ctl.AddMilestones(ctx, site.ID, Plan(Reached(days, site.Currency), site.Day))
	if err != nil {
		return nil, err
	}
	if err := ctl.SetMilestonesDay(ctx, site.ID, yesterday); err != nil {
		return nil, err
	}
	var fresh []sqlite.Milestone
	for _, m := range added {
		if !m.Quiet && site.Day != "" {
			fresh = append(fresh, m)
		}
	}
	return fresh, nil
}
