package sqlite

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

// The vitals migration makes Core Web Vitals a default for new sites without touching
// a site that exists: one that never chose keeps it off, one that chose keeps
// its choice.
// migrationWith is the 1-based position of the one migration whose SQL holds
// marker: a test finds its step by what it does, so a migration appended later
// cannot move it.
func migrationWith(t *testing.T, marker string) int {
	t.Helper()
	found := 0
	for i, m := range migrations {
		if strings.Contains(m, marker) {
			if found != 0 {
				t.Fatalf("%q is in migrations %d and %d, want one", marker, found, i+1)
			}
			found = i + 1
		}
	}
	if found == 0 {
		t.Fatalf("no migration holds %q", marker)
	}
	return found
}

func TestVitalsDefaultKeepsExistingSites(t *testing.T) {
	ctx := context.Background()
	step := migrationWith(t, "SELECT id, 'vitals', 0,")
	s := openT(t)
	site := func(domain string) string {
		id, err := s.CreateSite(ctx, DefaultAccount, domain, "")
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	plain, chose := site("plain.com"), site("chose.com")
	if _, err := s.DB.ExecContext(ctx, `DELETE FROM site_modules; PRAGMA user_version = `+fmt.Sprint(step-1)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO site_modules (site_id, module_id, enabled, updated_at) VALUES (?, 'vitals', 1, 1)`, chose); err != nil {
		t.Fatal(err)
	}
	if err := s.MigrateTo(ctx, step); err != nil {
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
