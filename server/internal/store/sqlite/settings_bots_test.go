package sqlite

import (
	"context"
	"testing"
)

// A browser in a data centre is a script, so a new site filters those visits
// from its first event, and its owner can turn that off.
func TestDataCentreFilteringIsOnForNewSitesAndCanBeTurnedOff(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	id, err := s.CreateSite(ctx, DefaultAccount, "shop.example", "Shop")
	if err != nil {
		t.Fatal(err)
	}
	if c, _ := s.SiteConfig(ctx, id); !c.BotStrict {
		t.Fatal("the setting reads off for a new site")
	}
	if site, ok := s.Site(id); !ok || !site.BotStrict {
		t.Fatalf("ingest does not filter a new site: %+v", site)
	}

	c, _ := s.SiteConfig(ctx, id)
	c.BotStrict = false
	if err := s.SetSiteConfig(ctx, id, c); err != nil {
		t.Fatal(err)
	}
	if site, _ := s.Site(id); site.BotStrict {
		t.Fatal("turned off, ingest still filters")
	}
	if got, _ := s.SiteConfig(ctx, id); got.BotStrict {
		t.Fatal("the choice did not stay")
	}
}
