package sqlite

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// A site created by another process (e.g. `trckabled site add` while the
// server runs) must be accepted without a restart.
func TestSiteCreatedByAnotherProcessIsFound(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "trckable.db")
	server, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	server.lastReload = time.Time{} // allow an immediate reload

	cli, err := Open(ctx, path) // a second handle = another process
	if err != nil {
		t.Fatal(err)
	}
	id, err := cli.CreateSite(ctx, DefaultAccount, "https://www.Example.com/", "")
	cli.Close()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(id, "tkb_") || len(id) != 16 {
		t.Fatalf("site id %q does not follow tkb_ + 12 chars", id)
	}
	site, ok := server.Site(id)
	if !ok || site.Domain != "example.com" {
		t.Fatalf("server did not see the new site: ok=%v %+v", ok, site)
	}
}

func TestUnknownIDsDoNotHammerTheDatabase(t *testing.T) {
	ctx := context.Background()
	s, err := Open(ctx, filepath.Join(t.TempDir(), "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	s.lastReload = time.Now()
	for i := 0; i < 1000; i++ {
		if _, ok := s.Site("tkb_doesnotexist"); ok {
			t.Fatal("found a site that does not exist")
		}
	}
	if time.Since(s.lastReload) < 0 {
		t.Fatal("unexpected")
	}
}

func TestDuplicateDomainRejectedAndDowngradeGuard(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "trckable.db")
	s, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateSite(ctx, DefaultAccount, "a.com", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateSite(ctx, DefaultAccount, "a.com", ""); err != ErrExists {
		t.Fatalf("duplicate domain: %v", err)
	}
	s.DB.Exec(`PRAGMA user_version = 999`)
	s.Close()
	if _, err := Open(ctx, path); err == nil || !strings.Contains(err.Error(), "downgrade guard") {
		t.Fatalf("expected downgrade guard, got %v", err)
	}
}

func TestEnsureSiteIsIdempotent(t *testing.T) {
	ctx := context.Background()
	s, err := Open(ctx, filepath.Join(t.TempDir(), "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	a, created, err := s.EnsureSite(ctx, DefaultAccount, "https://www.shop.example.com/")
	if err != nil || !created {
		t.Fatalf("first ensure: %v %v", created, err)
	}
	b, created, err := s.EnsureSite(ctx, DefaultAccount, "shop.example.com")
	if err != nil || created || a != b {
		t.Fatalf("second ensure: id %s vs %s, created=%v err=%v", a, b, created, err)
	}
}
