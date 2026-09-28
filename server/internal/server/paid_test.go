package server

import (
	"context"
	"testing"
	"time"
)

// The "you got paid" alert reads paid_at as what it is,
// unix milliseconds, and the alert's amount is in the site's currency and
// ISO minor units: Stripe's ISK is scaled, yen is never added to dollars.
func TestPaidSinceReadsMilliseconds(t *testing.T) {
	ctx := context.Background()
	ctl := openCtl(t, t.TempDir())
	defer ctl.Close()
	now := time.Date(2026, 9, 26, 12, 0, 0, 0, time.UTC)
	ins := func(id, cur string, gross, tax int64, at time.Time, test int) {
		if _, err := ctl.DB.Exec(`INSERT INTO pay_payments (site_id, provider, id, connection_id, test, paid_at, currency, gross, tax, kind, version)
			VALUES ('s1', 'stripe', ?, 'pc_1', ?, ?, ?, ?, ?, 'one_time', 1)`, id, test, at.UnixMilli(), cur, gross, tax); err != nil {
			t.Fatal(err)
		}
	}
	ins("old", "ISK", 1000000, 0, now.Add(-40*24*time.Hour), 0) // before both windows
	ins("isk", "ISK", 1250000, 250000, now.Add(-time.Hour), 0)  // 10,000 kr net
	ins("jpy", "JPY", 5000, 0, now.Add(-time.Hour), 0)          // counted, not added
	ins("test", "ISK", 999900, 0, now.Add(-time.Hour), 1)       // test money
	n, amount := paidSince(ctx, ctl.DB, "s1", "ISK", now.Add(-2*time.Hour).Unix())
	if n != 2 || amount != 10000 {
		t.Fatalf("paid since two hours ago: %d payments, %d kr; want 2, 10000", n, amount)
	}
	if n, _ := paidSince(ctx, ctl.DB, "s1", "ISK", now.Unix()); n != 0 {
		t.Fatalf("payments before `since` counted: %d", n)
	}
}
