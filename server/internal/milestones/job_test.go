package milestones

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Revenue milestones count what was kept: refunds and lost disputes come
// off the day's sales, and a payment refunded in full is not a sale.
func TestPaidByDayIsNetOfRefunds(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "m.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	day := func(d string) int64 {
		tm, _ := time.Parse("2006-01-02 15:04", d+" 12:00")
		return tm.UnixMilli()
	}
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := st.DB.ExecContext(ctx, q, args...); err != nil {
			t.Fatal(err)
		}
	}
	pay := `INSERT INTO pay_payments (site_id, provider, id, connection_id, paid_at, currency, gross, version) VALUES ('s1', 'stripe', ?, 'pc', ?, 'EUR', ?, 1)`
	refund := `INSERT INTO pay_refunds (site_id, provider, id, payment_id, amount, currency, status, at, version) VALUES ('s1', 'stripe', ?, ?, ?, 'EUR', 'succeeded', 1, 1)`
	exec(pay, "p1", day("2026-09-01"), 10000)
	exec(refund, "r1", "p1", 4000) // 100 paid, 40 back
	exec(pay, "p2", day("2026-09-02"), 5000)
	exec(refund, "r2", "p2", 5000) // all back
	exec(pay, "p3", day("2026-09-02"), 2500)

	got, err := paidByDay(ctx, st.DB, "s1", "UTC", "EUR", "2026-09-10")
	if err != nil {
		t.Fatal(err)
	}
	if got["2026-09-01"] != 60 || got["2026-09-02"] != 25 || len(got) != 2 {
		t.Errorf("paid by day: %v, want 60 on the 1st and 25 on the 2nd", got)
	}
	exec(refund, "r3", "p3", 2500)
	got, err = paidByDay(ctx, st.DB, "s1", "UTC", "EUR", "2026-09-10")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got["2026-09-02"]; ok {
		t.Errorf("a day whose sales were all refunded still has a sale: %v", got)
	}
}
