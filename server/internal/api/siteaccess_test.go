package api

import (
	"bufio"
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// A viewer limited to one site of their account tries every route there is
// on the account's other site, and must get "not found" from every read
// (and a refusal from every change): the routes are the ones Routes
// registered, so a route added later is tried too. The lists (sites, all
// sites, the switcher's layout) leave the other site out, and so does the
// live stream, which also ends once access is taken away.
func TestLimitedViewerSeesOnlyTheirSites(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	owner := client()
	g.setup(t, owner) // the account's first owner, with site.com: hidden from the viewer too
	// Two more sites, one the viewer may see.
	acc := sqlite.DefaultAccount
	shown, err := g.ctl.CreateSite(ctx, acc, "shown.com", "")
	if err != nil {
		t.Fatal(err)
	}
	hidden, err := g.ctl.CreateSite(ctx, acc, "hidden.com", "")
	if err != nil {
		t.Fatal(err)
	}
	// A group named after the hidden site: its name must not reach the viewer.
	if _, err := g.ctl.SetSiteLayout(ctx, acc, sqlite.SiteLayout{Order: []string{hidden, shown}, Pinned: []string{hidden},
		Groups: []sqlite.SiteGroup{{Name: "Secret client", Sites: []string{hidden}}}}); err != nil {
		t.Fatal(err)
	}
	v, err := g.ctl.AddUser(ctx, acc, "viewer@shop.com", "correct horse battery V", sqlite.RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	viewer := client()
	if code, out := do(t, viewer, "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@shop.com","password":"correct horse battery V"}`); code != http.StatusOK {
		t.Fatalf("viewer signs in: %d %v", code, out)
	}
	limit := func(body string) int {
		t.Helper()
		code, _ := do(t, owner, "PUT", g.srv.URL+"/api/v1/site-access/"+v.ID, body, csrf, "1")
		return code
	}
	if code := limit(`{"sites":["` + shown + `"]}`); code != http.StatusOK {
		t.Fatalf("limit: %d", code)
	}

	send := func(c *http.Client, method, path string) (int, string) {
		t.Helper()
		body := io.Reader(nil)
		if method != "GET" && method != "HEAD" {
			body = strings.NewReader(`{"role":"owner"}`)
		}
		req, _ := http.NewRequest(method, g.srv.URL+path, body)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set(csrf, "1")
		res, err := c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return res.StatusCode, string(raw)
	}

	fill := func(site string) *strings.Replacer {
		return strings.NewReplacer("{site}", site, "{id}", "x", "{module}", "goals", "{visitor}", "1")
	}
	tried := 0
	for _, pattern := range g.api.patterns {
		method, path, _ := strings.Cut(pattern, " ")
		if !strings.Contains(path, "{site}") {
			continue
		}
		tried++
		code, body := send(viewer, method, fill(hidden).Replace(path))
		switch {
		case method == "GET" && code != http.StatusNotFound:
			t.Errorf("%s %s on the hidden site: %d %s", method, path, code, body)
		case method != "GET" && code != http.StatusNotFound && code != http.StatusForbidden:
			t.Errorf("%s %s on the hidden site: %d %s", method, path, code, body)
		}
		if strings.Contains(body, "hidden.com") {
			t.Errorf("%s %s names the hidden site: %s", method, path, body)
		}
	}
	if tried < 40 {
		t.Fatalf("only %d site routes were tried", tried)
	}
	// Their own site still works.
	if code, body := send(viewer, "GET", "/api/v1/sites/"+shown+"/report?from=2026-09-01&to=2026-09-22"); code != http.StatusOK && code != http.StatusServiceUnavailable {
		t.Errorf("the allowed site's report: %d %s", code, body)
	}
	if code, _ := send(viewer, "GET", "/api/v1/sites/"+shown); code != http.StatusOK {
		t.Errorf("the allowed site: %d", code)
	}

	// The lists.
	for _, path := range []string{"/api/v1/sites", "/api/v1/overview?days=7", "/api/v1/site-layout"} {
		code, body := send(viewer, "GET", path)
		if code != http.StatusOK && (code != http.StatusServiceUnavailable || !strings.Contains(path, "overview")) {
			t.Errorf("GET %s: %d %s", path, code, body)
		}
		for _, leak := range []string{hidden, "hidden.com", "Secret client"} {
			if strings.Contains(body, leak) {
				t.Errorf("GET %s shows %q: %s", path, leak, body)
			}
		}
	}
	if _, body := send(viewer, "GET", "/api/v1/sites"); !strings.Contains(body, shown) {
		t.Errorf("the allowed site is missing from the list: %s", body)
	}
	// A viewer cannot make an API key (which would outlive the limit).
	if code, _ := send(viewer, "POST", "/api/v1/keys"); code != http.StatusForbidden {
		t.Errorf("a viewer makes an API key: %d", code)
	}

	// Live: the hidden site's stream never opens; the allowed one ends once
	// the viewer may no longer see it.
	if code, _ := send(viewer, "GET", "/api/v1/sites/"+hidden+"/live"); code != http.StatusNotFound {
		t.Errorf("hidden live: %d", code)
	}
	old := liveHeartbeat
	liveHeartbeat = 100 * time.Millisecond
	defer func() { liveHeartbeat = old }()
	viewer.Timeout = 0
	req, _ := http.NewRequest("GET", g.srv.URL+"/api/v1/sites/"+shown+"/live", nil)
	resp, err := viewer.Do(req) //nolint:bodyclose // closed below
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("allowed live: %d", resp.StatusCode)
	}
	ended := make(chan struct{})
	go func() {
		sc := bufio.NewScanner(resp.Body)
		for sc.Scan() {
		}
		close(ended)
	}()
	if code := limit(`{"sites":[]}`); code != http.StatusOK {
		t.Fatalf("limit to none: %d", code)
	}
	select {
	case <-ended:
	case <-time.After(3 * time.Second):
		t.Fatal("the live stream went on after access was taken away")
	}
	if code, _ := send(viewer, "GET", "/api/v1/sites/"+shown+"/report?from=2026-09-01&to=2026-09-22"); code != http.StatusNotFound {
		t.Errorf("no sites, yet the report: %d", code)
	}
	if _, body := send(viewer, "GET", "/api/v1/sites"); strings.Contains(body, shown) || strings.Contains(body, hidden) {
		t.Errorf("no sites, yet the list: %s", body)
	}

	// null gives every site back.
	if code := limit(`{"sites":null}`); code != http.StatusOK {
		t.Fatalf("unlimit: %d", code)
	}
	if code, _ := send(viewer, "GET", "/api/v1/sites/"+hidden); code != http.StatusOK {
		t.Errorf("unlimited, the other site: %d", code)
	}
}

// An owner sets site access for their own account in People: only an owner,
// only with the request header every change needs, and only for a viewer of
// that account (another account's viewer is not found from here).
func TestSiteAccessOwnerRoutes(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	g.setup(t, client())
	acc := sqlite.DefaultAccount
	one, err := g.ctl.CreateSite(ctx, acc, "one.com", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := g.ctl.CreateSite(ctx, acc, "two.com", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := g.ctl.AddUser(ctx, acc, "second@shop.com", "correct horse battery O", sqlite.RoleOwner); err != nil {
		t.Fatal(err)
	}
	v, err := g.ctl.AddUser(ctx, acc, "viewer@shop.com", "correct horse battery V", sqlite.RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	other, err := g.ctl.CreateAccount(ctx)
	if err != nil {
		t.Fatal(err)
	}
	stranger, err := g.ctl.AddUser(ctx, other, "viewer@other.com", "correct horse battery S", sqlite.RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	signIn := func(email, password string) *http.Client {
		c := client()
		if code, out := do(t, c, "POST", g.srv.URL+"/api/v1/login", `{"email":"`+email+`","password":"`+password+`"}`); code != http.StatusOK {
			t.Fatalf("%s signs in: %d %v", email, code, out)
		}
		return c
	}
	owner, viewer := signIn("second@shop.com", "correct horse battery O"), signIn("viewer@shop.com", "correct horse battery V")
	url := g.srv.URL + "/api/v1/site-access"
	body := `{"sites":["` + one + `"]}`
	if code, _ := do(t, viewer, "GET", url, ""); code != http.StatusForbidden {
		t.Errorf("a viewer reads the list: %d", code)
	}
	if code, _ := do(t, viewer, "PUT", url+"/"+v.ID, body, csrf, "1"); code != http.StatusForbidden {
		t.Errorf("a viewer lifts their own limit: %d", code)
	}
	if code, _ := do(t, owner, "PUT", url+"/"+v.ID, body); code == http.StatusOK {
		t.Errorf("a change without the request header went through")
	}
	if code, _ := do(t, owner, "PUT", url+"/"+stranger.ID, body, csrf, "1"); code != http.StatusNotFound {
		t.Errorf("another account's viewer: %d", code)
	}
	theirs, err := g.ctl.CreateSite(ctx, other, "theirs.com", "")
	if err != nil {
		t.Fatal(err)
	}
	if code, _ := do(t, owner, "PUT", url+"/"+v.ID, `{"sites":["`+theirs+`"]}`, csrf, "1"); code == http.StatusOK {
		t.Errorf("granted another account's site")
	}
	if code, _ := do(t, owner, "POST", url+"/"+v.ID, body, csrf, "1"); code == http.StatusOK {
		t.Errorf("POST went through as PUT")
	}
	if s, _ := g.ctl.ViewerSites(ctx, other, stranger.ID); s != nil {
		t.Errorf("another account's viewer got a limit: %v", s)
	}
	code, out := do(t, owner, "PUT", url+"/"+v.ID, body, csrf, "1")
	if code != http.StatusOK {
		t.Fatalf("limit: %d %v", code, out)
	}
	if s, _ := g.ctl.ViewerSites(ctx, acc, v.ID); len(s) != 1 || !s[one] {
		t.Errorf("limit stored: %v", s)
	}
	code, out = do(t, owner, "GET", url, "")
	sites, _ := out["sites"].([]any)
	viewers, _ := out["viewers"].([]any)
	if code != http.StatusOK || len(sites) != 3 || len(viewers) != 1 {
		t.Errorf("list: %d %v", code, out)
	}
	if code, _ := do(t, owner, "PUT", url+"/"+v.ID, `{"sites":null}`, csrf, "1"); code != http.StatusOK {
		t.Errorf("back to every site: %d", code)
	}
	if s, _ := g.ctl.ViewerSites(ctx, acc, v.ID); s != nil {
		t.Errorf("limit after every site: %v", s)
	}
}
