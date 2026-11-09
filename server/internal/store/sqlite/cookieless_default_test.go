package sqlite

import (
	"context"
	"testing"
)

// A new site starts cookieless and says so in its own row; a site from before
// that, with no row or a row with the mode off, keeps what it had. Opting in
// to cookies is one saved switch.
func TestNewSitesStartCookieless(t *testing.T) {
	s := openT(t)
	ctx := context.Background()

	id, err := s.CreateSite(ctx, DefaultAccount, "new.example", "")
	if err != nil {
		t.Fatal(err)
	}
	if c, _ := s.SiteConfig(ctx, id); !c.ConsentFree {
		t.Fatal("a new site is not cookieless")
	}
	if site, _ := s.Site(id); !site.ConsentFree {
		t.Fatal("ingest is not told the new site is cookieless")
	}

	// A site from before the change: no settings row at all.
	old, err := s.CreateSite(ctx, DefaultAccount, "old.example", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.ExecContext(ctx, `DELETE FROM site_settings WHERE site_id = ?`, old); err != nil {
		t.Fatal(err)
	}
	if err := s.reloadSites(ctx); err != nil {
		t.Fatal(err)
	}
	if c, _ := s.SiteConfig(ctx, old); c.ConsentFree {
		t.Fatal("a site without a row was flipped to cookieless in the dashboard")
	}
	if site, _ := s.Site(old); site.ConsentFree {
		t.Fatal("a site without a row was flipped to cookieless in ingest")
	}

	// A stored consent_free = 0 stays 0.
	kept, _ := s.CreateSite(ctx, DefaultAccount, "kept.example", "")
	if _, err := s.DB.ExecContext(ctx, `UPDATE site_settings SET consent_free = 0 WHERE site_id = ?`, kept); err != nil {
		t.Fatal(err)
	}
	if c, _ := s.SiteConfig(ctx, kept); c.ConsentFree {
		t.Fatal("a stored cookie-mode site was flipped")
	}

	// The opt-in.
	c, _ := s.SiteConfig(ctx, id)
	c.ConsentFree = false
	if err := s.SetSiteConfig(ctx, id, c); err != nil {
		t.Fatal(err)
	}
	if site, _ := s.Site(id); site.ConsentFree {
		t.Fatal("turning cookie mode on did not reach ingest")
	}
}
