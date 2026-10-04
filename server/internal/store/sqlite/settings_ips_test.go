package sqlite

import (
	"context"
	"fmt"
	"reflect"
	"testing"

	"github.com/trckable/trckable/server/internal/ipfilter"
)

// The owner's list is stored in the site's config, reaches ingest at once,
// and nothing else about the people on it is kept anywhere.
func TestExcludedAddressesAreSiteConfig(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	id, err := s.CreateSite(ctx, DefaultAccount, "shop.example", "Shop")
	if err != nil {
		t.Fatal(err)
	}
	if c, _ := s.SiteConfig(ctx, id); len(c.ExcludeIPs) != 0 {
		t.Fatalf("a new site excludes %v", c.ExcludeIPs)
	}

	c, _ := s.SiteConfig(ctx, id)
	c.ExcludeIPs = []string{" 203.0.113.7 ", "203.0.113.99/24", "2001:DB8::/32", "203.0.113.7"}
	if err := s.SetSiteConfig(ctx, id, c); err != nil {
		t.Fatal(err)
	}
	want := []string{"203.0.113.7", "203.0.113.0/24", "2001:db8::/32"}
	got, _ := s.SiteConfig(ctx, id)
	if !reflect.DeepEqual(got.ExcludeIPs, want) {
		t.Fatalf("read back %v, want %v", got.ExcludeIPs, want)
	}
	site, _ := s.Site(id)
	if !site.SkipIP("203.0.113.200") || !site.SkipIP("2001:db8:1::1") || site.SkipIP("203.0.114.1") {
		t.Fatalf("ingest has not got the list: %+v", site.ExcludeIPs)
	}

	// Saving something else keeps the list; clearing it empties it.
	got.WeekStart = 0
	if err := s.SetSiteConfig(ctx, id, got); err != nil {
		t.Fatal(err)
	}
	if again, _ := s.SiteConfig(ctx, id); !reflect.DeepEqual(again.ExcludeIPs, want) {
		t.Fatalf("an unrelated save changed the list: %v", again.ExcludeIPs)
	}
	got.ExcludeIPs = nil
	if err := s.SetSiteConfig(ctx, id, got); err != nil {
		t.Fatal(err)
	}
	if site, _ := s.Site(id); site.SkipIP("203.0.113.7") || len(site.ExcludeIPs) != 0 {
		t.Fatal("a cleared list still excludes")
	}
}

func TestExcludedAddressesRefuseWhatIsWrong(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	id, _ := s.CreateSite(ctx, DefaultAccount, "shop.example", "Shop")
	c, _ := s.SiteConfig(ctx, id)

	c.ExcludeIPs = []string{"203.0.113.7", "nope"}
	if err := s.SetSiteConfig(ctx, id, c); err == nil {
		t.Fatal("a bad line was stored")
	}
	c.ExcludeIPs = nil
	for i := 0; i < ipfilter.Max+1; i++ {
		c.ExcludeIPs = append(c.ExcludeIPs, fmt.Sprintf("10.0.%d.1", i))
	}
	if err := s.SetSiteConfig(ctx, id, c); err == nil {
		t.Fatal("a fifty-first address was stored")
	}
	if got, _ := s.SiteConfig(ctx, id); len(got.ExcludeIPs) != 0 {
		t.Fatalf("a refused save changed the list: %v", got.ExcludeIPs)
	}
}

// The one new column holds the addresses the owner typed, and lives in the
// site's own settings: nowhere else gained a place for an address.
func TestOnlyTheOwnersListIsStored(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	id, _ := s.CreateSite(ctx, DefaultAccount, "shop.example", "Shop")
	c, _ := s.SiteConfig(ctx, id)
	c.ExcludeIPs = []string{"203.0.113.7"}
	if err := s.SetSiteConfig(ctx, id, c); err != nil {
		t.Fatal(err)
	}
	rows, err := s.DB.Query(`SELECT m.name, p.name FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type = 'table'`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	found := false
	for rows.Next() {
		var table, col string
		if err := rows.Scan(&table, &col); err != nil {
			t.Fatal(err)
		}
		if col == "exclude_ips" {
			found = true
			if table != "site_settings" {
				t.Errorf("the list is also kept in %s", table)
			}
		}
	}
	if !found {
		t.Fatal("the list has no column")
	}
	var n int
	if err := s.DB.QueryRow(`SELECT count(*) FROM site_settings WHERE site_id = ? AND exclude_ips = '203.0.113.7'`, id).Scan(&n); err != nil || n != 1 {
		t.Fatalf("the list is not in the site's settings: %d %v", n, err)
	}
}
