package server

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/notice"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// A threshold is told once for each period it is reached in: not below the
// number, not again while the period lasts however high the count goes, and
// again in the next day.
func TestThresholdFiresOncePerPeriod(t *testing.T) {
	ctx := context.Background()
	s, ctl := moneyServer(t)
	s.notices = &notice.Hub{Store: ctl}
	box := fakeMailServer(t)
	site, err := ctl.CreateSite(ctx, sqlite.DefaultAccount, "goal.example", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ctl.SaveAlert(ctx, sqlite.Alert{SiteID: site, Kind: "threshold", Enabled: true, Target: "mailto:owner@example.com", Metric: "sales", Period: "day", Threshold: 10}); err != nil {
		t.Fatal(err)
	}
	count := 9.0
	s.thresholdCount = func(context.Context, sqlite.Alert, sqlite.SiteInfo, time.Time, time.Time) (float64, error) {
		return count, nil
	}
	check := func(at time.Time) {
		t.Helper()
		list, err := ctl.LiveAlerts(ctx)
		if err != nil || len(list) != 1 {
			t.Fatalf("%v %v", list, err)
		}
		s.checkThreshold(ctx, list[0], at)
		s.notices.Wait()
	}
	day1 := time.Date(2026, 10, 21, 9, 0, 0, 0, time.UTC)

	check(day1)
	if n := len(box.all()); n != 0 {
		t.Fatalf("told below the number: %d", n)
	}
	count = 10
	check(day1.Add(time.Hour))
	got := box.all()
	if len(got) != 1 {
		t.Fatalf("messages at the number: %d, want 1", len(got))
	}
	if _, subject := subjectOf(t, got[0]); subject != "10 sales today · goal.example" {
		t.Fatalf("subject %q", subject)
	}
	count = 40
	check(day1.Add(2 * time.Hour))
	check(day1.Add(10 * time.Hour))
	if n := len(box.all()); n != 1 {
		t.Fatalf("told again in the same day: %d", n)
	}
	// The next day it counts afresh and speaks again.
	count = 12
	check(day1.Add(24 * time.Hour))
	if n := len(box.all()); n != 2 {
		t.Fatalf("messages the next day: %d, want 2", n)
	}
	// Even if the mark were lost, the outbox knows the period was already told.
	if err := ctl.MarkThresholdFired(ctx, mustThreshold(t, ctl, site).ID, "", 0); err != nil {
		t.Fatal(err)
	}
	check(day1.Add(25 * time.Hour))
	if n := len(box.all()); n != 2 {
		t.Fatalf("a lost mark told the period twice: %d", n)
	}
}

func mustThreshold(t *testing.T, ctl *sqlite.Store, site string) sqlite.Alert {
	t.Helper()
	list, err := ctl.Alerts(context.Background(), site)
	if err != nil || len(list) != 1 {
		t.Fatalf("%v %v", list, err)
	}
	return list[0]
}

// The words say the number and the stretch; revenue is in the site's currency.
func TestThresholdWords(t *testing.T) {
	info := sqlite.SiteInfo{Domain: "goal.example", Currency: "USD"}
	for _, c := range []struct {
		metric, period string
		n              float64
		want           string
	}{
		{alerts.MetricSales, alerts.PeriodDay, 10, "10 sales today"},
		{alerts.MetricSales, alerts.PeriodDay, 1, "1 sale today"},
		{alerts.MetricVisitors, alerts.PeriodMonth, 1250, "1,250 visitors this month"},
		{alerts.MetricRevenue, alerts.PeriodWeek, 5000, "$5,000 in revenue this week"},
		{alerts.MetricVisitors, alerts.PeriodAll, 100000, "100,000 visitors so far"},
	} {
		ev := thresholdEvent(sqlite.Alert{Kind: "threshold", Metric: c.metric, Period: c.period, Threshold: c.n}, info, c.n, time.Now())
		if ev.Title != c.want || !strings.Contains(ev.Message, "goal.example reached "+c.want) {
			t.Errorf("%s/%s/%v: %q / %q", c.metric, c.period, c.n, ev.Title, ev.Message)
		}
	}
}

// Sales and revenue come from the ledger: a payment refunded in full is not a
// sale, a part refund takes only that part off the revenue, and an older
// payment is outside a period that began later.
func TestPaidSinceCountsRealSales(t *testing.T) {
	ctx := context.Background()
	_, ctl := moneyServer(t)
	site, err := ctl.CreateSite(ctx, sqlite.DefaultAccount, "paid.example", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ctl.DB.ExecContext(ctx, `UPDATE sites SET currency = 'USD' WHERE id = ?`, site); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := ctl.DB.ExecContext(ctx, q, args...); err != nil {
			t.Fatal(err)
		}
	}
	pay := `INSERT INTO pay_payments (site_id, provider, id, connection_id, paid_at, currency, gross, version) VALUES (?, 'stripe', ?, 'pc', ?, 'USD', ?, 1)`
	refund := `INSERT INTO pay_refunds (site_id, provider, id, payment_id, amount, currency, status, at, version) VALUES (?, 'stripe', ?, ?, ?, 'USD', 'succeeded', 1, 1)`
	exec(pay, site, "old", now.Add(-72*time.Hour).UnixMilli(), 9900)
	exec(pay, site, "a", now.Add(-3*time.Hour).UnixMilli(), 10000)
	exec(refund, site, "ra", "a", 4000) // 100 paid, 40 back
	exec(pay, site, "b", now.Add(-2*time.Hour).UnixMilli(), 5000)
	exec(refund, site, "rb", "b", 5000) // all back
	exec(pay, site, "c", now.Add(-time.Hour).UnixMilli(), 2500)
	info, err := ctl.SiteInfo(ctx, site)
	if err != nil {
		t.Fatal(err)
	}
	sales, minor, err := paidSince(ctx, ctl, info, now.Add(-24*time.Hour), now)
	if err != nil {
		t.Fatal(err)
	}
	if sales != 2 || minor != 8500 {
		t.Fatalf("today: %d sales, %d minor units; want 2 sales and 8500 (60 + 25)", sales, minor)
	}
	sales, minor, err = paidSince(ctx, ctl, info, time.Time{}, now)
	if err != nil || sales != 3 || minor != 18400 {
		t.Fatalf("all time: %d sales, %d minor units, %v; want 3 and 18400", sales, minor, err)
	}
}
