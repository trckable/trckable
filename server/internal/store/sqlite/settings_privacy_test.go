package sqlite

import (
	"context"
	"testing"
)

// "Region and city" and "Honour Do Not Track": what the dashboard saves is
// what the ingest handler is given, and cookieless mode decides both whatever
// the two switches say.
func TestRegionDntAndPathsReachIngest(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	id, err := s.CreateSite(ctx, DefaultAccount, "shop.example", "Shop")
	if err != nil {
		t.Fatal(err)
	}
	site, _ := s.Site(id)
	if site.NoCity || site.HonorDNT || len(site.ExcludePaths) != 0 {
		t.Fatalf("a new site starts recording the city, ignoring DNT, leaving nothing out: %+v", site)
	}

	c, _ := s.SiteConfig(ctx, id)
	c.RecordCity, c.HonorDNT, c.ExcludePaths = false, true, []string{"/admin/*", "/preview"}
	if err := s.SetSiteConfig(ctx, id, c); err != nil {
		t.Fatal(err)
	}
	site, _ = s.Site(id)
	if !site.NoCity || !site.HonorDNT || len(site.ExcludePaths) != 2 {
		t.Fatalf("saved, ingest is not told: %+v", site)
	}
	if !site.Skip("/admin/users") || !site.Skip("/preview") || site.Skip("/previews") || site.Skip("/admin") {
		t.Fatal("the path rules do not match what the hint says: /admin/* skips everything under it, a plain path matches itself only")
	}

	// Back on: the city is kept and DNT is ignored again.
	c.RecordCity, c.HonorDNT, c.ExcludePaths = true, false, nil
	if err := s.SetSiteConfig(ctx, id, c); err != nil {
		t.Fatal(err)
	}
	if site, _ = s.Site(id); site.NoCity || site.HonorDNT || len(site.ExcludePaths) != 0 {
		t.Fatalf("switched back, ingest still filters: %+v", site)
	}

	// Cookieless mode keeps the country only and honours DNT, even with both switches the other way.
	c.ConsentFree = true
	if err := s.SetSiteConfig(ctx, id, c); err != nil {
		t.Fatal(err)
	}
	if site, _ = s.Site(id); !site.NoCity || !site.HonorDNT || !site.ConsentFree {
		t.Fatalf("cookieless mode is not enforced: %+v", site)
	}
}
