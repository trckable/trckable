package sqlite

import (
	"context"
	"testing"
)

// Migration 51 gives the surge alert to the sites that have alerts on, to where
// their newest enabled alert goes, and only to them: a site with everything off,
// with no alerts, or that already chose about the surge alert keeps what it has.
func TestSurgeAlertBackfill(t *testing.T) {
	ctx := context.Background()
	s := openT(t)
	site := func(domain string) string {
		id, err := s.CreateSite(ctx, DefaultAccount, domain, "")
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	on, off, none, chose, hook := site("on.com"), site("off.com"), site("none.com"), site("chose.com"), site("hook.com")
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
	add(off, "stopped", "mailto:a@example.com", false, 2)
	add(chose, "weekly", "mailto:b@example.com", true, 1)
	add(chose, "surge", "mailto:b@example.com", false, 2) // switched off by its unsubscribe link
	add(hook, "customer", "https://hooks.example.com/x", true, 1)
	// The schema as it was before the migration.
	if _, err := s.DB.ExecContext(ctx, `DELETE FROM alerts WHERE kind = 'surge' AND site_id != ?; PRAGMA user_version = 50`, chose); err != nil {
		t.Fatal(err)
	}
	if err := s.MigrateTo(ctx, len(migrations)); err != nil {
		t.Fatal(err)
	}
	surge := func(site string) *Alert {
		list, _ := s.Alerts(ctx, site)
		for _, a := range list {
			if a.Kind == "surge" {
				return &a
			}
		}
		return nil
	}
	if a := surge(on); a == nil || !a.Enabled || a.Target != "mailto:new@example.com" {
		t.Fatalf("on: %+v", a)
	}
	if a := surge(hook); a == nil || a.Target != "https://hooks.example.com/x" {
		t.Fatalf("a webhook goes where the site's alerts go: %+v", a)
	}
	if surge(off) != nil || surge(none) != nil {
		t.Fatal("alerts off, or none: no surge alert")
	}
	if a := surge(chose); a == nil || a.Enabled {
		t.Fatalf("a choice made is kept: %+v", a)
	}
	// Again changes nothing.
	if _, err := s.DB.ExecContext(ctx, `PRAGMA user_version = 50`); err != nil {
		t.Fatal(err)
	}
	if err := s.MigrateTo(ctx, len(migrations)); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.Alerts(ctx, on); len(list) != 3 {
		t.Fatalf("a second run adds again: %d", len(list))
	}
}
