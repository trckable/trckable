package sqlite

import (
	"context"
	"fmt"
	"testing"

	"github.com/trckable/trckable/server/internal/modules"
)

// The connected-modules migration turns revenue and Search Console on for the sites that already
// connected them, whatever an old row said, so none is connected and refused.
// A site that disconnected, or never connected, is left as it was.
func TestConnectedSitesGetTheirModules(t *testing.T) {
	ctx := context.Background()
	step := migrationWith(t, "FROM search_console WHERE true")
	s := openT(t)
	site := func(domain string) string {
		id, err := s.CreateSite(ctx, DefaultAccount, domain, "")
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	paid, searched, gone, none := site("paid.com"), site("search.com"), site("gone.com"), site("none.com")
	exec := func(q string, a ...any) {
		t.Helper()
		if _, err := s.DB.ExecContext(ctx, q, a...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`DELETE FROM site_modules; PRAGMA user_version = ` + fmt.Sprint(step-1)) //nolint:gosec // a number of ours, in a test
	for _, id := range []string{paid, gone} {
		exec(`INSERT INTO site_modules (site_id, module_id, enabled, updated_at) VALUES (?, 'revenue', 0, 1)`, id)
	}
	exec(`INSERT INTO site_modules (site_id, module_id, enabled, updated_at) VALUES (?, 'search', 0, 1)`, searched)
	exec(`INSERT INTO pay_connections (id, site_id, provider, created_at) VALUES ('pc_1', ?, 'stripe', 1)`, paid)
	exec(`INSERT INTO pay_connections (id, site_id, provider, created_at, disabled_at) VALUES ('pc_2', ?, 'stripe', 1, 2)`, gone)
	exec(`INSERT INTO search_console (site_id, key_enc, client_email, created_at) VALUES (?, 'x', 'a@b.c', 1)`, searched)
	if err := s.MigrateTo(ctx, step); err != nil {
		t.Fatal(err)
	}
	has := func(site, id string) bool {
		set, err := modules.Store{DB: s.DB}.Of(ctx, site)
		if err != nil {
			t.Fatal(err)
		}
		return set.Has(id)
	}
	if !has(paid, "revenue") {
		t.Error("a connected provider with an old off row: revenue is off, its payments routes would answer 404")
	}
	if !has(searched, "search") {
		t.Error("a connected Search Console key with an old off row: search is off")
	}
	if has(gone, "revenue") || has(none, "revenue") || has(none, "search") {
		t.Error("a site that is not connected was switched on")
	}
}
