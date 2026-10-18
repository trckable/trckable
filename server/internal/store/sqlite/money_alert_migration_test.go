package sqlite

import (
	"context"
	"testing"
)

// Migration 64 gives the money alert to the sites that have alerts on, to where
// their newest enabled alert goes, and only to them: a site with everything
// off, with no alerts, or that already chose about the money alert keeps what
// it has.
func TestMoneyAlertBackfill(t *testing.T) {
	ctx := context.Background()
	s := openT(t)
	site := func(domain string) string {
		id, err := s.CreateSite(ctx, DefaultAccount, domain, "")
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	on, off, none, chose := site("on.com"), site("off.com"), site("none.com"), site("chose.com")
	_ = none
	add := func(site, kind, target string, enabled bool, at int64) {
		t.Helper()
		if _, err := s.DB.ExecContext(ctx, `INSERT INTO alerts (id, site_id, kind, enabled, target, threshold, last_fired, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
			"alert_"+site+kind, site, kind, boolInt(enabled), target, at); err != nil {
			t.Fatal(err)
		}
	}
	add(on, "weekly", "mailto:old@example.com", true, 1)
	add(on, "stopped", "mailto:new@example.com", true, 2)
	add(off, "weekly", "mailto:a@example.com", false, 1)
	add(chose, "weekly", "mailto:b@example.com", true, 1)
	add(chose, "customer", "mailto:b@example.com", false, 2) // switched off by its unsubscribe link
	// A payment already refunded in two parts, and one in a running total.
	for _, q := range []string{
		`INSERT INTO pay_payments (site_id, provider, id, connection_id, test, paid_at, currency, gross, kind, version) VALUES ('` + on + `', 'stripe', 'pi_1', 'c', 0, 1, 'USD', 5000, 'one_time', 1)`,
		`INSERT INTO pay_refunds (site_id, provider, id, payment_id, amount, currency, status, cumulative, at, version) VALUES ('` + on + `', 'stripe', 're_1', 'pi_1', 1200, 'USD', 'succeeded', 0, 1, 1)`,
		`INSERT INTO pay_refunds (site_id, provider, id, payment_id, amount, currency, status, cumulative, at, version) VALUES ('` + on + `', 'stripe', 're_2', 'pi_1', 800, 'USD', 'succeeded', 0, 1, 1)`,
		`INSERT INTO pay_refunds (site_id, provider, id, payment_id, amount, currency, status, cumulative, at, version) VALUES ('` + on + `', 'stripe', 'cum:ch_1', 'pi_1', 2000, 'USD', 'succeeded', 1, 1, 1)`,
	} {
		if _, err := s.DB.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	// The schema as it was before the migration.
	if _, err := s.DB.ExecContext(ctx, `DROP TABLE pay_notices; DROP TABLE bell_read; ALTER TABLE pay_hints DROP COLUMN from_plan; ALTER TABLE pay_hints DROP COLUMN to_plan; ALTER TABLE pay_hints DROP COLUMN country; ALTER TABLE pay_payments DROP COLUMN country; ALTER TABLE mentions DROP COLUMN state; ALTER TABLE mentions DROP COLUMN via; ALTER TABLE mentions DROP COLUMN link; PRAGMA user_version = 63`); err != nil {
		t.Fatal(err)
	}
	if err := s.MigrateTo(ctx, 64); err != nil {
		t.Fatal(err)
	}
	var told int64
	if err := s.DB.QueryRowContext(ctx, `SELECT amount FROM pay_notices WHERE id = 'refund:pi_1'`).Scan(&told); err != nil || told != 2000 {
		t.Errorf("refunds already made are told as such: %d, %v; want 2000, so the next one announces only itself", told, err)
	}
	money := func(site string) *Alert {
		list, _ := s.Alerts(ctx, site)
		for _, a := range list {
			if a.Kind == "customer" {
				return &a
			}
		}
		return nil
	}
	if a := money(on); a == nil || !a.Enabled || a.Target != "mailto:new@example.com" {
		t.Errorf("a site with alerts on: %+v, want money on to its newest destination", a)
	}
	if a := money(off); a != nil {
		t.Errorf("a site with everything off was given %+v", a)
	}
	if a := money(none); a != nil {
		t.Errorf("a site with no alerts was given %+v", a)
	}
	if a := money(chose); a == nil || a.Enabled {
		t.Errorf("a site that switched it off: %+v, want it left off", a)
	}
}
