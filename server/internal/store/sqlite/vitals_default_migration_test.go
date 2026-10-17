package sqlite

import (
	"context"
	"testing"
)

// Migration 67 makes Core Web Vitals a default for new sites without touching
// a site that exists: one that never chose keeps it off, one that chose keeps
// its choice.
func TestVitalsDefaultKeepsExistingSites(t *testing.T) {
	ctx := context.Background()
	s := openT(t)
	site := func(domain string) string {
		id, err := s.CreateSite(ctx, DefaultAccount, domain, "")
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	plain, chose := site("plain.com"), site("chose.com")
	if _, err := s.DB.ExecContext(ctx, `DELETE FROM site_modules; PRAGMA user_version = 66`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO site_modules (site_id, module_id, enabled, updated_at) VALUES (?, 'vitals', 1, 1)`, chose); err != nil {
		t.Fatal(err)
	}
	if err := s.MigrateTo(ctx, 67); err != nil {
		t.Fatal(err)
	}
	on := func(site string) (enabled, found bool) {
		err := s.DB.QueryRowContext(ctx, `SELECT enabled FROM site_modules WHERE site_id = ? AND module_id = 'vitals'`, site).Scan(&enabled)
		return enabled, err == nil
	}
	if e, ok := on(plain); !ok || e {
		t.Errorf("a site that never chose: vitals enabled=%v found=%v, want an explicit off", e, ok)
	}
	if e, ok := on(chose); !ok || !e {
		t.Errorf("a site that chose on: enabled=%v found=%v, want it kept on", e, ok)
	}
}
