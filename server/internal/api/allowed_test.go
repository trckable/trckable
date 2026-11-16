package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func TestAllowedDomainsThroughTheAPI(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	viewer := viewerClient(t, g)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/allowed-domains"
	ctx := context.Background()
	day := g.now.UTC().Format(time.DateOnly)
	if err := g.ctl.AddRejectedHosts(ctx, []sqlite.RejectedHost{
		{Site: g.site, Day: day, Host: "staging.other.com", N: 30},
		{Site: g.site, Day: day, Host: "old.example", N: 5},
	}, g.now); err != nil {
		t.Fatal(err)
	}

	// A viewer reads and changes nothing.
	if code, out := do(t, viewer, "GET", base, ""); code != http.StatusOK || len(out["refused"].([]any)) != 2 {
		t.Fatalf("viewer reads: %d %v", code, out)
	}
	if code, _ := do(t, viewer, "PUT", base, `{"allowed":["a.example"]}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("viewer sets: %d", code)
	}

	// Bad names are refused whole; nothing is kept.
	for _, body := range []string{`{"allowed":["https://a.example/x"]}`, `{"allowed":["a b.example"]}`, `{"allowed":["localhost"]}`, `{"allowed":["a.example:8080"]}`, `{"allowed":["*"]}`} {
		if code, _ := do(t, owner, "PUT", base, body, csrf, "1"); code != http.StatusBadRequest {
			t.Errorf("%s: %d", body, code)
		}
	}
	var many []string
	for i := 0; i <= sqlite.MaxAllowedHosts; i++ {
		many = append(many, fmt.Sprintf(`"h%d.example"`, i))
	}
	if code, _ := do(t, owner, "PUT", base, `{"allowed":[`+strings.Join(many, ",")+`]}`, csrf, "1"); code != http.StatusBadRequest {
		t.Errorf("too many: %d", code)
	}
	if l, _ := g.ctl.AllowedOf(ctx, g.site); len(l) != 0 {
		t.Fatalf("a refused list was kept: %v", l)
	}

	// Cleaned, deduplicated, and used by ingest at once; a refused host that is now allowed stops being offered.
	code, out := do(t, owner, "PUT", base, `{"allowed":[" Staging.Other.com ","*.staging.other.com","www.new.example"]}`, csrf, "1")
	if code != http.StatusOK {
		t.Fatalf("owner sets: %d %v", code, out)
	}
	list := out["allowed"].([]any)
	if len(list) != 2 || list[0] != "staging.other.com" || list[1] != "new.example" {
		t.Fatalf("list: %v", list)
	}
	refused := out["refused"].([]any)
	if len(refused) != 1 || refused[0].(map[string]any)["host"] != "old.example" {
		t.Fatalf("still refused: %v", refused)
	}
	site, ok := g.ctl.Site(g.site)
	if !ok || len(site.Allowed) != 2 || site.Allowed[0] != "staging.other.com" || site.Allowed[1] != "new.example" {
		t.Fatalf("ingest site: %+v", site.Allowed)
	}
	// Its refusal notice is gone from the bell.
	g.api.bell = bellCache{}
	for _, r := range feedOf(t, g, owner) {
		if r["what"] == "host" {
			t.Fatalf("notice for an allowed host: %v", r)
		}
	}
	// Clearing the list empties it.
	if code, out := do(t, owner, "PUT", base, `{"allowed":[]}`, csrf, "1"); code != http.StatusOK || len(out["allowed"].([]any)) != 0 {
		t.Fatalf("clear: %d %v", code, out)
	}
}
