package api

import (
	"context"
	"net/http"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func TestChangeDomainThroughTheAPI(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	viewer := viewerClient(t, g)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/domain"

	// A viewer reads the state and changes nothing.
	if code, out := do(t, viewer, "GET", base, ""); code != http.StatusOK || out["domain"] != "site.com" {
		t.Fatalf("viewer reads: %d %v", code, out)
	}
	if code, _ := do(t, viewer, "PUT", base, `{"domain":"new.com"}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("viewer changes: %d", code)
	}
	if code, _ := do(t, viewer, "DELETE", base+"/former/site.com", "", csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("viewer stops: %d", code)
	}

	// The same rules as adding a site.
	if _, err := g.ctl.CreateSite(context.Background(), sqlite.DefaultAccount, "taken.com", ""); err != nil {
		t.Fatal(err)
	}
	for body, want := range map[string]int{
		`{"domain":"taken.com"}`:   http.StatusConflict,
		`{"domain":"SITE.com"}`:    http.StatusBadRequest,
		`{"domain":"example.com"}`: http.StatusBadRequest,
		`{"domain":"a b.com"}`:     http.StatusBadRequest,
		`{"domain":""}`:            http.StatusBadRequest,
	} {
		if code, out := do(t, owner, "PUT", base, body, csrf, "1"); code != want {
			t.Errorf("%s: %d %v, want %d", body, code, out, want)
		}
	}

	// The confirm step says what would be kept, and the Search Console match.
	if err := g.ctl.SetSearchConsoleKey(context.Background(), g.site, "k", "a@b.c"); err != nil {
		t.Fatal(err)
	}
	if err := g.ctl.SetSearchConsoleProperty(context.Background(), g.site, "sc-domain:site.com"); err != nil {
		t.Fatal(err)
	}
	code, out := do(t, owner, "GET", base+"?to=https://www.New.com/", "")
	prev, _ := out["preview"].(map[string]any)
	if code != http.StatusOK || prev["domain"] != "new.com" {
		t.Fatalf("preview: %d %v", code, out)
	}
	if s, _ := prev["search"].(map[string]any); s["matches"] != false {
		t.Fatalf("a property of the old domain does not match the new: %v", prev)
	}

	code, out = do(t, owner, "PUT", base, `{"domain":"new.com"}`, csrf, "1")
	if code != http.StatusOK || out["domain"] != "new.com" {
		t.Fatalf("change: %d %v", code, out)
	}
	former, _ := out["former"].([]any)
	if len(former) != 1 || former[0].(map[string]any)["host"] != "site.com" {
		t.Fatalf("former: %v", out["former"])
	}
	if s, _ := out["search"].(map[string]any); s["matches"] != false {
		t.Fatalf("search: %v", out["search"])
	}
	if code, out := do(t, owner, "GET", g.srv.URL+"/api/v1/sites/"+g.site, ""); code != http.StatusOK || out["domain"] != "new.com" || out["name"] != "new.com" {
		t.Fatalf("site: %d %v", code, out)
	}

	// Stop now.
	code, out = do(t, owner, "DELETE", base+"/former/site.com", "", csrf, "1")
	if former, _ := out["former"].([]any); code != http.StatusOK || len(former) != 0 {
		t.Fatalf("stop now: %d %v", code, out)
	}
	if code, _ := do(t, owner, "DELETE", base+"/former/site.com", "", csrf, "1"); code != http.StatusNotFound {
		t.Fatalf("stop twice: %d", code)
	}
}

func TestPropertyCoversTheDomain(t *testing.T) {
	for _, c := range []struct {
		property, domain string
		want             bool
	}{
		{"sc-domain:new.com", "new.com", true},
		{"sc-domain:new.com", "app.new.com", true},
		{"https://new.com/", "new.com", true},
		{"https://www.new.com/", "new.com", true},
		{"https://new.com/", "app.new.com", false},
		{"sc-domain:old.com", "new.com", false},
		{"https://old.com/", "new.com", false},
	} {
		if got := propertyCovers(c.property, c.domain); got != c.want {
			t.Errorf("%s vs %s: %v", c.property, c.domain, got)
		}
	}
}
