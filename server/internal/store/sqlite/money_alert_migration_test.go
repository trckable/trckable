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
	// The schema as it was before the migration.
	if _, err := s.DB.ExecContext(ctx, `DROP TABLE pay_notices; ALTER TABLE pay_hints DROP COLUMN from_plan; ALTER TABLE pay_hints DROP COLUMN to_plan; PRAGMA user_version = 63`); err != nil {
		t.Fatal(err)
	}
	if err := s.MigrateTo(ctx, 64); err != nil {
		t.Fatal(err)
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
