package modules

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func TestDefaultsAndToggles(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "m.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	site, _, _ := st.EnsureSite(ctx, sqlite.DefaultAccount, "example.com")
	store := Store{DB: st.DB}

	set, err := store.Of(ctx, site)
	if err != nil {
		t.Fatal(err)
	}
	// A new site: goals on, the reading modules on (they cost nothing), and
	// everything that records more or needs setup off.
	for id, want := range map[string]bool{"goals": true, "funnels": true, "rhythm": true, "journeys": true, "map": true,
		"outbound": false, "revenue": false, "ask": false} {
		if set.Has(id) != want {
			t.Errorf("new site: %s = %v, want %v", id, set.Has(id), want)
		}
	}
	if set.Has(Core) != true {
		t.Error("core must always be on")
	}
	if got := set.Tracker(); len(got) != 1 || got[0] != TrackGoals {
		t.Errorf("default browser features = %v, want just goals", got)
	}

	if err := store.Set(ctx, site, "revenue", true); err != nil {
		t.Fatal(err)
	}
	if err := store.Set(ctx, site, "goals", false); err != nil {
		t.Fatal(err)
	}
	set, _ = store.Of(ctx, site)
	if !set.Has("revenue") || set.Has("goals") {
		t.Fatalf("after toggling: %v", set)
	}
	if got := set.Tracker(); len(got) != 1 || got[0] != TrackCheckout {
		t.Errorf("browser features = %v, want just checkout", got)
	}
	if err := store.Set(ctx, site, "nope", true); err == nil {
		t.Error("unknown module accepted")
	}
	if !store.AnyHas(ctx, "revenue") {
		t.Error("AnyHas missed a site with revenue on")
	}
	if store.AnyHas(ctx, "ask") {
		t.Error("AnyHas reported a module nobody turned on")
	}
}
