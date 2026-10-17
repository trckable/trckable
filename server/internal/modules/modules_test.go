package modules

import (
	"context"
	"path/filepath"
	"slices"
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
	for id, want := range map[string]bool{"goals": true, "funnels": true, "notes": true, "rhythm": true, "journeys": true, "map": true,
		"retention": true, "crawlers": true, "vitals": true, "outbound": false, "forms": false, "revenue": false, "search": false, "heatmaps": false} {
		if set.Has(id) != want {
			t.Errorf("new site: %s = %v, want %v", id, set.Has(id), want)
		}
	}
	if set.Has(Core) != true {
		t.Error("core must always be on")
	}
	if got := set.Tracker(); len(got) != 2 || got[0] != TrackGoals || got[1] != TrackVitals {
		t.Errorf("default browser features = %v, want goals and vitals", got)
	}
	// No switch: asking one off changes nothing.
	for _, id := range []string{"funnels", "notes", "rhythm", "journeys", "map", "retention", "crawlers"} {
		if err := store.Set(ctx, site, id, false); err != nil {
			t.Fatal(err)
		}
	}
	if set, _ = store.Of(ctx, site); !set.Has("funnels") || !set.Has("crawlers") || !set.Has("notes") {
		t.Errorf("a module without a switch went off: %v", set)
	}

	if err := store.Set(ctx, site, "revenue", true); err != nil {
		t.Fatal(err)
	}
	if err := store.Set(ctx, site, "goals", false); err != nil {
		t.Fatal(err)
	}
	if err := store.Set(ctx, site, "vitals", false); err != nil {
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
}

// Outbound links and forms are goals: with Goals off they leave the script
// and read as off, and come back as chosen when Goals does.
func TestOutboundAndFormsFollowGoals(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "m.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	site, _, _ := st.EnsureSite(ctx, sqlite.DefaultAccount, "example.com")
	store := Store{DB: st.DB}
	for _, id := range []string{"outbound", "forms"} {
		if err := store.Set(ctx, site, id, true); err != nil {
			t.Fatal(err)
		}
	}
	set, _ := store.Of(ctx, site)
	if got := set.Tracker(); !slices.Contains(got, TrackOutbound) || !slices.Contains(got, TrackForms) {
		t.Fatalf("goals on: %v", got)
	}
	if err := store.Set(ctx, site, "goals", false); err != nil {
		t.Fatal(err)
	}
	set, _ = store.Of(ctx, site)
	if set.Has("outbound") || set.Has("forms") {
		t.Errorf("with goals off they read as on: %v", set)
	}
	for _, f := range set.Tracker() {
		if f == TrackGoals || f == TrackOutbound || f == TrackForms {
			t.Errorf("goals off, yet the script carries %s", f)
		}
	}
	_ = store.Set(ctx, site, "goals", true)
	if set, _ = store.Of(ctx, site); !set.Has("outbound") || !set.Has("forms") {
		t.Error("their own choice did not come back with goals")
	}
}
