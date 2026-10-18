package permissions

import (
	"encoding/json"
	"os"
	"sort"
	"testing"
)

type permissionFixture struct {
	Actions map[string]struct {
		Roles  []string `json:"roles"`
		Server string   `json:"server"`
	} `json:"actions"`
	ServerOnly map[string][]string `json:"serverOnly"`
}

func listed(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// The dashboard keeps the same role table (dashboard/src/lib/permissions.ts)
// and its test reads the same file: a role given one more thing on one side
// and not the other fails here or there.
func TestTheRoleTableAgreesWithTheDashboards(t *testing.T) {
	raw, err := os.ReadFile("../../../dashboard/src/lib/permissions.json")
	if err != nil {
		t.Fatal(err)
	}
	var f permissionFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	roles := []string{"owner", "viewer"}
	seen := map[Action]bool{}
	for name, a := range f.Actions {
		seen[Action(a.Server)] = true
		for _, r := range roles {
			if got, want := Can(r, Action(a.Server)), listed(a.Roles, r); got != want {
				t.Errorf("%s (server action %s) for %s: server %v, dashboard %v", name, a.Server, r, got, want)
			}
		}
	}
	for name, rs := range f.ServerOnly {
		seen[Action(name)] = true
		for _, r := range roles {
			if got, want := Can(r, Action(name)), listed(rs, r); got != want {
				t.Errorf("%s for %s: server %v, fixture %v", name, r, got, want)
			}
		}
	}
	// Every action the server knows is in the fixture, so none goes unchecked.
	var missing []string
	for _, a := range ownerActions {
		if !seen[a] {
			missing = append(missing, string(a))
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Errorf("actions missing from permissions.json: %v", missing)
	}
}

func TestAnUnknownRoleMayDoNothing(t *testing.T) {
	for _, a := range ownerActions {
		if Can("", a) || Can("admin", a) {
			t.Errorf("a role with no row may %s", a)
		}
	}
}
