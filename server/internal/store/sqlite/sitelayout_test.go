package sqlite

import (
	"reflect"
	"testing"
)

// A limited viewer gets the layout without the sites they cannot see, and a
// group left with none of theirs goes too, its name with it.
func TestLayoutOnlyDropsWhatTheViewerCannotSee(t *testing.T) {
	l := SiteLayout{
		Order:  []string{"a", "b", "c", "d"},
		Pinned: []string{"b", "c"},
		Groups: []SiteGroup{
			{Name: "Clients", Sites: []string{"a", "b"}},
			{Name: "Secret client", Sites: []string{"c", "d"}},
			{Name: "Empty", Sites: nil},
		},
	}
	got := l.Only(map[string]bool{"a": true, "b": true})
	want := SiteLayout{
		Order:  []string{"a", "b"},
		Pinned: []string{"b"},
		Groups: []SiteGroup{{Name: "Clients", Sites: []string{"a", "b"}}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Only: %+v, want %+v", got, want)
	}
	if none := l.Only(map[string]bool{}); len(none.Order) != 0 || len(none.Pinned) != 0 || len(none.Groups) != 0 {
		t.Fatalf("a viewer with no sites sees a layout: %+v", none)
	}
}

// A layout is tidied on the way in: names trimmed, a site once, and a site
// that is not the account's refused whatever list it is in.
func TestCleanLayoutTidiesAndRefuses(t *testing.T) {
	sites := []SiteRow{{ID: "a"}, {ID: "b"}}
	got, err := cleanLayout(SiteLayout{
		Order:  []string{"b", "a", "b"},
		Pinned: []string{"a", "a"},
		Groups: []SiteGroup{{Name: "  Clients ", Sites: []string{"a", "a"}}},
	}, sites)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Order, []string{"b", "a"}) || !reflect.DeepEqual(got.Pinned, []string{"a"}) || got.Groups[0].Name != "Clients" || len(got.Groups[0].Sites) != 1 {
		t.Fatalf("tidied: %+v", got)
	}
	for name, in := range map[string]SiteLayout{
		"order":    {Order: []string{"x"}},
		"pinned":   {Pinned: []string{"x"}},
		"group":    {Groups: []SiteGroup{{Name: "G", Sites: []string{"x"}}}},
		"twice":    {Groups: []SiteGroup{{Name: "G", Sites: []string{"a"}}, {Name: "H", Sites: []string{"a"}}}},
		"nameless": {Groups: []SiteGroup{{Name: " "}}},
	} {
		if _, err := cleanLayout(in, sites); err == nil {
			t.Errorf("%s: a broken layout was accepted", name)
		}
	}
}
