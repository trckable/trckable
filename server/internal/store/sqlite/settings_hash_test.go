package sqlite

import (
	"context"
	"testing"
)

// A hash-routed app (/#/pricing) is a setting of its site: off by default,
// and once on, the next event already keeps the part after # as its page.
func TestHashModeIsASiteSetting(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	id, err := s.CreateSite(ctx, DefaultAccount, "app.example", "App")
	if err != nil {
		t.Fatal(err)
	}
	c, _ := s.SiteConfig(ctx, id)
	if c.HashMode {
		t.Fatal("hash mode is off for a new site")
	}
	c.HashMode = true
	if err := s.SetSiteConfig(ctx, id, c); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.SiteConfig(ctx, id); !got.HashMode {
		t.Fatal("the setting did not stay")
	}
	if site, ok := s.Site(id); !ok || !site.HashMode {
		t.Fatalf("ingest does not follow it yet: %+v", site)
	}
	c.HashMode = false
	if err := s.SetSiteConfig(ctx, id, c); err != nil {
		t.Fatal(err)
	}
	if site, _ := s.Site(id); site.HashMode {
		t.Fatal("turned off, ingest still keeps the hash")
	}
}
