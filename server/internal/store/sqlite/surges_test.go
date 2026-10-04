package sqlite

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/trckable/trckable/server/internal/surge"
)

func TestSurgesAreKeptAndTheBusiestFound(t *testing.T) {
	ctx := context.Background()
	st, err := Open(ctx, filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	site, _ := st.CreateSite(ctx, DefaultAccount, "a.com", "")
	if got, err := st.LatestSurge(ctx, site); err != nil || got != nil {
		t.Fatalf("none yet: %v %v", got, err)
	}
	first := surge.Surge{ID: "s1", Site: site, Started: 1000, Online: 30, Usual: 10, Why: surge.Why{Source: "Reddit", SourceN: 20}}
	second := surge.Surge{ID: "s2", Site: site, Started: 5000, Online: 53, Usual: 20, Why: surge.Why{Source: "Facebook", SourceN: 34, SourceUsual: 2}}
	for _, s := range []surge.Surge{first, second} {
		if err := st.SaveSurge(ctx, s); err != nil {
			t.Fatal(err)
		}
	}
	second.Online, second.Ended = 61, 5600
	if err := st.SaveSurge(ctx, second); err != nil {
		t.Fatal(err)
	}
	latest, _ := st.LatestSurge(ctx, site)
	if latest.ID != "s2" || latest.Online != 61 || latest.Ended != 5600 || latest.Why.Source != "Facebook" || latest.Why.SourceUsual != 2 {
		t.Fatalf("latest %+v", latest)
	}
	if list, _ := st.SurgesBetween(ctx, site, 0, 2000); len(list) != 1 || list[0].ID != "s1" {
		t.Fatalf("between %+v", list)
	}
	if best, _ := st.BusiestSurge(ctx, site, 0, 9000); best == nil || best.ID != "s2" {
		t.Fatalf("busiest %+v", best)
	}
	if best, _ := st.BusiestSurge(ctx, site, 0, 2000); best == nil || best.ID != "s1" {
		t.Fatalf("busiest of the first week %+v", best)
	}
	// Another site's id cannot overwrite it.
	other, _ := st.CreateSite(ctx, DefaultAccount, "b.com", "")
	steal := second
	steal.Site, steal.Online = other, 1
	_ = st.SaveSurge(ctx, steal)
	if got, _ := st.LatestSurge(ctx, site); got.Online != 61 {
		t.Fatalf("overwritten: %+v", got)
	}
}
