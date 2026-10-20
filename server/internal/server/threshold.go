package server

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/fx"
	"github.com/trckable/trckable/server/internal/ledger"
	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// checkThreshold looks at one threshold alert ("10 sales today") and sends it
// when the count has reached the number and it has not already spoken for this
// day, week or month. The outbox keeps the delivery, and its key names the
// alert and the period, so a check that finds the mark was not saved queues the
// same message again, which the outbox ignores: once for each period, whatever
// goes wrong in between.
func (s *Server) checkThreshold(ctx context.Context, a sqlite.Alert, now time.Time) {
	info, err := s.ctl.SiteInfo(ctx, a.SiteID)
	if err != nil {
		return
	}
	loc, err := time.LoadLocation(info.Timezone)
	if err != nil {
		loc = time.UTC
	}
	weekStart := 1
	if c, err := s.ctl.SiteConfig(ctx, a.SiteID); err == nil {
		weekStart = c.WeekStart
	}
	key, from := alerts.Window(a.Period, now.In(loc), weekStart)
	if key == a.FiredPeriod {
		return
	}
	count := s.thresholdCount
	if count == nil {
		count = s.countFor
	}
	value, err := count(ctx, a, info, from, now)
	if err != nil {
		slog.Warn("alert check failed", "kind", a.Kind, "site", a.SiteID, "err", err)
		return
	}
	if !alerts.ThresholdDue(value, a.Threshold, a.FiredPeriod, key) {
		return
	}
	account, err := s.ctl.SiteAccount(ctx, a.SiteID)
	if err != nil {
		slog.Warn("alert not kept", "kind", a.Kind, "site", a.SiteID)
		return
	}
	ev := thresholdEvent(a, info, value, now)
	ev.Unsubscribe = s.stopLink(a.ID)
	ev.Settings = s.settingsLink(a.SiteID)
	if err := s.notices.Alert(ctx, account, "alert:"+a.ID+":"+key, a.Kind, a.Target, ev); err != nil {
		slog.Warn("alert not kept", "kind", a.Kind, "site", a.SiteID)
		return
	}
	if err := s.ctl.MarkThresholdFired(ctx, a.ID, key, now.Unix()); err != nil {
		slog.Warn("alert kept but not marked", "kind", a.Kind, "site", a.SiteID)
	}
}

// countFor is what a threshold counts, from the start of its period until now.
func (s *Server) countFor(ctx context.Context, a sqlite.Alert, info sqlite.SiteInfo, from, now time.Time) (float64, error) {
	if a.Metric == alerts.MetricVisitors {
		st := s.duck.Load()
		if st == nil {
			return 0, fmt.Errorf("the analytics store is not open")
		}
		var n int64
		q, args := `SELECT count(DISTINCT visitor_id) FROM events WHERE site_id = ? AND kind = 1`, []any{a.SiteID}
		if !from.IsZero() {
			q, args = q+` AND ts >= ?`, append(args, from.UTC())
		}
		err := st.DB.QueryRowContext(ctx, q, args...).Scan(&n)
		return float64(n), err
	}
	// Payments in another currency add nothing to revenue, as in the milestones:
	// adding yen to dollars would be a wrong number. They are still sales.
	sales, revenueMinor, err := paidSince(ctx, s.ctl, info, from, now)
	if a.Metric == alerts.MetricSales {
		return float64(sales), err
	}
	return float64(revenueMinor) / math.Pow10(fx.Exponent(info.Currency)), err
}

// paidSince counts a site's real payments paid from `from` until now, and
// their net revenue in minor units of the site's currency. A payment refunded
// in full is not a sale.
func paidSince(ctx context.Context, ctl *sqlite.Store, info sqlite.SiteInfo, from, now time.Time) (sales int, minor int64, err error) {
	if from.IsZero() {
		from = time.Unix(0, 0)
	}
	facts, err := ledger.Facts(ctx, ctl.DB, &fx.Rates{DB: ctl.DB}, info.ID, info.Currency, from, now.Add(time.Hour), false)
	if err != nil {
		return 0, 0, err
	}
	for _, f := range facts {
		net := f.Amount - f.Refunded
		if f.Converted && net <= 0 {
			continue
		}
		sales++
		if f.Converted {
			minor += net
		}
	}
	return sales, minor, nil
}

// The words of a threshold alert: "10 sales today", "$5,000 in revenue this week".
var (
	metricWords = map[string]string{alerts.MetricSales: "sales", alerts.MetricRevenue: "in revenue", alerts.MetricVisitors: "visitors"}
	periodWords = map[string]string{alerts.PeriodDay: "today", alerts.PeriodWeek: "this week", alerts.PeriodMonth: "this month", alerts.PeriodAll: "so far"}
)

// thresholdEvent words the alert: the number reached, in the site's own
// currency for revenue, then the stretch it was reached in.
func thresholdEvent(a sqlite.Alert, info sqlite.SiteInfo, value float64, now time.Time) alerts.Event {
	num := thousands(int64(math.Floor(a.Threshold)))
	if a.Metric == alerts.MetricRevenue {
		num = revenue.Money(int64(math.Round(a.Threshold*math.Pow10(fx.Exponent(info.Currency)))), info.Currency, fx.Exponent(info.Currency))
	}
	words := strings.TrimSpace(num + " " + metricWords[a.Metric] + " " + periodWords[a.Period])
	if a.Metric == alerts.MetricSales && a.Threshold == 1 {
		words = "1 sale " + periodWords[a.Period]
	}
	return alerts.Event{
		Kind: a.Kind, Site: a.SiteID, Domain: info.Domain, At: now,
		Title: words, Message: info.Domain + " reached " + words + ".", Subject: words + " · " + info.Domain,
		Data: map[string]any{"metric": a.Metric, "period": a.Period, "threshold": a.Threshold, "value": value, "amount": num},
	}
}

// thousands writes a whole number with commas: 1,250.
func thousands(n int64) string {
	s := strconv.FormatInt(n, 10)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}
