package api

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The switcher's order, pins and groups are saved for the account: checked
// against its own sites, the same for everyone in it, read-only for viewers,
// and invisible to another account.
func TestSiteLayout(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	c := client()
	g.setup(t, c)
	second, err := g.ctl.CreateSite(ctx, sqlite.DefaultAccount, "shop.com", "Shop")
	if err != nil {
		t.Fatal(err)
	}
	third, err := g.ctl.CreateSite(ctx, sqlite.DefaultAccount, "blog.com", "Blog")
	if err != nil {
		t.Fatal(err)
	}
	url := g.srv.URL + "/api/v1/site-layout"

	// Nothing arranged yet: an empty layout, never a 404.
	code, out := do(t, c, "GET", url, "")
	if code != 200 || len(out["order"].([]any)) != 0 || len(out["groups"].([]any)) != 0 {
		t.Fatalf("empty layout: %d %v", code, out)
	}

	good := fmt.Sprintf(`{"order":[%q,%q,%q,%q],"pinned":[%q],"groups":[{"name":"  Clients ","sites":[%q,%q]}]}`,
		third, g.site, second, third, second, g.site, g.site)
	code, out = do(t, c, "PUT", url, good, csrf, "1")
	if code != 200 {
		t.Fatalf("save: %d %v", code, out)
	}
	order := out["order"].([]any)
	if len(order) != 3 || order[0] != third || order[1] != g.site {
		t.Fatalf("the order, once each: %v", order)
	}
	group := out["groups"].([]any)[0].(map[string]any)
	if group["name"] != "Clients" || len(group["sites"].([]any)) != 1 {
		t.Fatalf("the group, tidied: %v", group)
	}

	// Another account's owner: its own (empty) layout, and none of our ids.
	accB, err := g.ctl.CreateAccount(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := g.ctl.AddUser(ctx, accB, "owner@other.com", "correct horse battery B", sqlite.RoleOwner); err != nil {
		t.Fatal(err)
	}
	other := client()
	if code, _ := do(t, other, "POST", g.srv.URL+"/api/v1/login", `{"email":"owner@other.com","password":"correct horse battery B"}`); code != 200 {
		t.Fatal("B signs in")
	}
	if _, out := do(t, other, "GET", url, ""); len(out["order"].([]any)) != 0 {
		t.Fatalf("another account read our layout: %v", out)
	}
	// Naming our sites is refused the same way as naming none that exist.
	for _, id := range []string{g.site, "tkb_doesnotexist"} {
		code, out := do(t, other, "PUT", url, fmt.Sprintf(`{"order":[%q]}`, id), csrf, "1")
		if code != http.StatusBadRequest || out["error"] != "order names a site this account does not have" {
			t.Errorf("B arranges %s: %d %v", id, code, out)
		}
	}

	// A viewer sees the team's layout and cannot change it.
	if _, err := g.ctl.AddUser(ctx, sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	v := client()
	if code, _ := do(t, v, "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@site.com","password":"correct horse battery V"}`); code != 200 {
		t.Fatal("viewer signs in")
	}
	if _, out := do(t, v, "GET", url, ""); len(out["order"].([]any)) != 3 {
		t.Fatalf("the viewer sees another layout: %v", out)
	}
	if code, _ := do(t, v, "PUT", url, `{"order":[]}`, csrf, "1"); code != http.StatusForbidden {
		t.Errorf("viewer saved a layout: %d", code)
	}

	// Broken layouts are refused and change nothing.
	bad := []string{
		fmt.Sprintf(`{"groups":[{"name":"A","sites":[%q]},{"name":"a","sites":[]}]}`, g.site),
		fmt.Sprintf(`{"groups":[{"name":"A","sites":[%q]},{"name":"B","sites":[%q]}]}`, g.site, g.site),
		`{"groups":[{"name":"   ","sites":[]}]}`,
		`{"groups":[{"name":"a very long group name that goes on and on","sites":[]}]}`,
		`not json`,
	}
	for _, b := range bad {
		if code, _ := do(t, c, "PUT", url, b, csrf, "1"); code != http.StatusBadRequest {
			t.Errorf("PUT %s: %d, want 400", b, code)
		}
	}
	many := `{"groups":[`
	for i := range sqlite.MaxSiteGroups + 1 {
		if i > 0 {
			many += ","
		}
		many += fmt.Sprintf(`{"name":"g%d","sites":[]}`, i)
	}
	if code, _ := do(t, c, "PUT", url, many+`]}`, csrf, "1"); code != http.StatusBadRequest {
		t.Errorf("%d groups: %d, want 400", sqlite.MaxSiteGroups+1, code)
	}
	if _, out := do(t, c, "GET", url, ""); len(out["order"].([]any)) != 3 {
		t.Fatalf("a refused save changed the layout: %v", out)
	}

	// A deleted site drops out of the layout it was in.
	if _, err := g.ctl.DeleteSite(ctx, second); err != nil {
		t.Fatal(err)
	}
	_, out = do(t, c, "GET", url, "")
	if len(out["order"].([]any)) != 2 || len(out["pinned"].([]any)) != 0 {
		t.Fatalf("a deleted site stayed in the layout: %v", out)
	}
}
