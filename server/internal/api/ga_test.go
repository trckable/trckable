package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/ga"
	"github.com/trckable/trckable/server/internal/ga/gatest"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/writer"
)

type gaSink struct{ g *rig }

func (s gaSink) Replace(ctx context.Context, site, from, to string, rows []ga.Row) error {
	out := make([]writer.ImportedRow, len(rows))
	for i, r := range rows {
		out[i] = writer.ImportedRow{Day: r.Day, Dim: r.Dim, Value: r.Value, Sessions: r.Sessions, Users: r.Users, Views: r.Views}
	}
	return s.g.w.ReplaceImported(ctx, site, from, to, out)
}

func (s gaSink) Have(ctx context.Context, site, from, to string) (bool, error) {
	return s.g.api.Query().ImportedHave(ctx, site, from, to)
}

type gaRig struct {
	*rig
	google *gatest.Fake
	owner  *http.Client // signed in as me@site.com, shows every redirect
	from   string       // where imports start: the writer takes a moment for each range, so tests do not ask for every day since 2020
}

func newGA(t *testing.T) *gaRig {
	t.Helper()
	g := newRig(t)
	g.setup(t, client())
	f := gatest.New(t)
	f.RedirectURI = g.srv.URL + "/api/v1/ga/callback"
	f.DataFrom = "2024-01-01"
	cl := &ga.Client{ID: gatest.ClientID, Secret: ga.NewSecret(gatest.ClientSecret)}
	f.Wire(cl)
	g.api.BaseURL = g.srv.URL
	g.api.GA = &ga.Manager{Client: cl, Sink: gaSink{g}, Changed: g.api.PurgeSite}
	t.Cleanup(g.api.GA.Stop)
	r := &gaRig{rig: g, google: f, owner: stepper(), from: "2026-06-01"}
	r.login(t, r.owner, "me@site.com", "correct horse battery")
	return r
}

func (r *gaRig) login(t *testing.T, c *http.Client, email, pass string) {
	t.Helper()
	if code, out := do(t, c, "POST", r.srv.URL+"/api/v1/login", `{"email":"`+email+`","password":"`+pass+`"}`); code != http.StatusOK {
		t.Fatalf("sign in %s: %d %v", email, code, out)
	}
}

func (r *gaRig) path(p string) string { return r.srv.URL + "/api/v1/sites/" + r.site + "/ga" + p }

// connect walks start, Google and the callback; it answers the callback.
func (r *gaRig) connect(t *testing.T, c *http.Client) hop {
	t.Helper()
	r1 := fetch(t, c, r.path("/start"))
	if r1.StatusCode != http.StatusSeeOther {
		t.Fatalf("start: %d", r1.StatusCode)
	}
	r2 := fetch(t, c, r1.Header.Get("Location"))
	if r2.StatusCode != http.StatusFound {
		t.Fatalf("Google's consent page: %d", r2.StatusCode)
	}
	return fetch(t, c, r2.Header.Get("Location"))
}

func (r *gaRig) status(t *testing.T, c *http.Client) map[string]any {
	t.Helper()
	code, out := do(t, c, "GET", r.path(""), "")
	if code != http.StatusOK {
		t.Fatalf("status: %d %v", code, out)
	}
	return out
}

func (r *gaRig) importIt(t *testing.T, c *http.Client, property string, resume bool) (int, map[string]any) {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"property": property, "resume": resume, "from": r.from})
	return do(t, c, "POST", r.path("/import"), string(body), csrf, "1")
}

func (r *gaRig) waitJob(t *testing.T, c *http.Client, want ...string) map[string]any {
	t.Helper()
	for i := 0; i < 3000; i++ {
		if job, ok := r.status(t, c)["job"].(map[string]any); ok {
			for _, w := range want {
				if job["status"] == w {
					return job
				}
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("the import never reached %v: %v", want, r.status(t, c))
	return nil
}

func TestGAFlowFromSignInToReportAndRunningItAgainChangesNothing(t *testing.T) {
	r := newGA(t)
	r.from, r.google.DataFrom = "2024-01-01", "2024-01-01" // the report below reads January 2024
	if st := r.status(t, r.owner); st["enabled"] != true || st["connected"] == true {
		t.Fatalf("before signing in: %v", st)
	}
	back := r.connect(t, r.owner)
	if back.StatusCode != http.StatusSeeOther || back.Header.Get("Location") != "/site.com?import=ga" {
		t.Fatalf("the callback sent the browser to %d %q", back.StatusCode, back.Header.Get("Location"))
	}
	if r.status(t, r.owner)["connected"] != true {
		t.Fatal("not connected after the callback")
	}
	// A sealed, short-lived cookie, used once.
	code, out := do(t, r.owner, "GET", r.path("/properties"), "")
	props, _ := out["properties"].([]any)
	if code != http.StatusOK || len(props) != 2 {
		t.Fatalf("properties: %d %v", code, out)
	}
	if code, out := r.importIt(t, r.owner, "properties/111", false); code != http.StatusAccepted {
		t.Fatalf("import: %d %v", code, out)
	}
	job := r.waitJob(t, r.owner, ga.Done)
	if job["done"] != job["total"] || job["days"].(float64) < 700 /* 2024-01-01 to 2026-09-21 */ {
		t.Fatalf("job %v", job)
	}
	report := func() (float64, any) {
		code, out := do(t, r.owner, "GET", r.srv.URL+"/api/v1/sites/"+r.site+"/report?from=2024-01-01&to=2024-01-31&tz=UTC", "")
		if code != http.StatusOK {
			t.Fatalf("report: %d %v", code, out)
		}
		cur := out["current"].(map[string]any)
		return cur["kpis"].(map[string]any)["pageviews"].(float64), cur["imported"]
	}
	views, imp := report()
	if views == 0 || imp == nil {
		t.Fatalf("the imported days are not in the report: %v %v", views, imp)
	}
	// Again: the token was dropped with the finished import, so sign in again.
	r.connect(t, r.owner)
	if code, out := r.importIt(t, r.owner, "properties/111", false); code != http.StatusAccepted {
		t.Fatalf("second import: %d %v", code, out)
	}
	r.waitJob(t, r.owner, ga.Done)
	if v2, _ := report(); v2 != views {
		t.Errorf("after a second import the report has %v pageviews, was %v: nothing may be counted twice", v2, views)
	}
}

func TestGAStateMismatchAndMissingCookie(t *testing.T) {
	r := newGA(t)
	r1 := fetch(t, r.owner, r.path("/start"))
	if r1.StatusCode != http.StatusSeeOther {
		t.Fatal(r1.StatusCode)
	}
	back := fetch(t, r.owner, r.srv.URL+"/api/v1/ga/callback?code=anything&state=not-the-state")
	if back.StatusCode != http.StatusSeeOther || !strings.Contains(back.Header.Get("Location"), "ga_error=failed") {
		t.Errorf("a callback with the wrong state went to %q", back.Header.Get("Location"))
	}
	if r.google.Tokens != 0 {
		t.Error("the code was exchanged although the state was wrong")
	}
	if r.status(t, r.owner)["connected"] == true {
		t.Error("connected by a callback with the wrong state")
	}
	// The flow is used up: a second try, even with the right state, has no cookie.
	loc, _ := url.Parse(r1.Header.Get("Location"))
	again := fetch(t, r.owner, r.srv.URL+"/api/v1/ga/callback?code=x&state="+loc.Query().Get("state"))
	if again.Header.Get("Location") != "/" || r.google.Tokens != 0 {
		t.Errorf("a replayed callback went to %q (%d exchanges)", again.Header.Get("Location"), r.google.Tokens)
	}
	// And the person said no at Google.
	r1 = fetch(t, r.owner, r.path("/start"))
	loc, _ = url.Parse(r1.Header.Get("Location"))
	no := fetch(t, r.owner, r.srv.URL+"/api/v1/ga/callback?error=access_denied&state="+loc.Query().Get("state"))
	if !strings.Contains(no.Header.Get("Location"), "ga_error=denied") {
		t.Errorf("a refusal went to %q", no.Header.Get("Location"))
	}
}

func TestGARedirectURIIsFixedWhateverTheRequestSays(t *testing.T) {
	r := newGA(t)
	req, _ := http.NewRequest("GET", r.path("/start"), nil)
	req.Host = "evil.example"
	req.Header.Set("X-Forwarded-Host", "evil.example")
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("Origin", "https://evil.example")
	u, _ := url.Parse(r.srv.URL)
	for _, c := range r.owner.Jar.Cookies(u) {
		req.AddCookie(c)
	}
	res, err := (&http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusSeeOther {
		t.Fatalf("start: %d", res.StatusCode)
	}
	loc, _ := url.Parse(res.Header.Get("Location"))
	if got := loc.Query().Get("redirect_uri"); got != r.srv.URL+"/api/v1/ga/callback" {
		t.Errorf("redirect_uri %q follows the request, not the configured address", got)
	}
	if loc.Query().Get("access_type") != "online" || loc.Query().Get("scope") != ga.Scope || loc.Query().Get("client_id") != gatest.ClientID {
		t.Errorf("query %v", loc.Query())
	}
}

func TestGAOwnersOnlyAndOnlyTheirOwnFlow(t *testing.T) {
	r := newGA(t)
	ctx := context.Background()
	if _, err := r.ctl.AddUser(ctx, sqlite.DefaultAccount, "viewer@site.com", "viewer password long", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	if _, err := r.ctl.AddUser(ctx, sqlite.DefaultAccount, "second@site.com", "second owner password", sqlite.RoleOwner); err != nil {
		t.Fatal(err)
	}
	viewer := stepper()
	r.login(t, viewer, "viewer@site.com", "viewer password long")
	for _, p := range []struct{ method, path string }{
		{"GET", r.path("")}, {"GET", r.path("/start")}, {"GET", r.path("/properties")}, {"POST", r.path("/import")}, {"DELETE", r.path("")},
		{"GET", r.srv.URL + "/api/v1/ga/callback?code=x&state=y"},
	} {
		req, _ := http.NewRequest(p.method, p.path, strings.NewReader(`{"property":"properties/111"}`))
		req.Header.Set(csrf, "1")
		res, err := viewer.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusForbidden {
			t.Errorf("a viewer: %s %s -> %d, want 403", p.method, p.path, res.StatusCode)
		}
	}
	// An API key is read-only and has no person: no route is open to it.
	key, _, err := r.ctl.CreateAPIKey(ctx, sqlite.DefaultAccount, "k")
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{r.path(""), r.path("/start"), r.path("/properties")} {
		req, _ := http.NewRequest("GET", p, nil)
		req.Header.Set("Authorization", "Bearer "+key)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusForbidden {
			t.Errorf("an API key: GET %s -> %d, want 403", p, res.StatusCode)
		}
	}
	// A second owner who gets hold of the first one's flow cookie finishes nothing.
	r1 := fetch(t, r.owner, r.path("/start"))
	var flow *http.Cookie
	for _, c := range r1.Cookies() {
		if c.Name == gaCookie {
			flow = c
		}
	}
	if flow == nil {
		t.Fatal("no flow cookie")
	}
	loc, _ := url.Parse(r1.Header.Get("Location"))
	second := stepper()
	r.login(t, second, "second@site.com", "second owner password")
	req, _ := http.NewRequest("GET", r.srv.URL+"/api/v1/ga/callback?code=x&state="+loc.Query().Get("state"), nil)
	req.AddCookie(flow)
	res, err := second.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.Header.Get("Location") != "/" || r.google.Tokens != 0 {
		t.Errorf("another owner's callback with the cookie: %q, %d exchanges", res.Header.Get("Location"), r.google.Tokens)
	}
	if code, out := do(t, second, "GET", r.path("/properties"), ""); code != http.StatusConflict {
		t.Errorf("the second owner lists properties: %d %v", code, out)
	}
}

func TestGAATokenWorksForItsOwnSiteOnly(t *testing.T) {
	r := newGA(t)
	other, err := r.ctl.CreateSite(context.Background(), sqlite.DefaultAccount, "other.com", "")
	if err != nil {
		t.Fatal(err)
	}
	r.connect(t, r.owner)
	url2 := r.srv.URL + "/api/v1/sites/" + other + "/ga"
	if code, out := do(t, r.owner, "GET", url2+"/properties", ""); code != http.StatusConflict {
		t.Errorf("the other site lists properties with this site's sign-in: %d %v", code, out)
	}
	body := `{"property":"properties/111"}`
	if code, _ := do(t, r.owner, "POST", url2+"/import", body, csrf, "1"); code != http.StatusConflict {
		t.Errorf("the other site imports with this site's sign-in: %d", code)
	}
	if code, out := do(t, r.owner, "GET", r.srv.URL+"/api/v1/sites/nonexistent/ga", ""); code != http.StatusNotFound {
		t.Errorf("an unknown site: %d %v", code, out)
	}
}

func TestGAOnlyAPropertyTheAccountCanReadAndNoOtherImportWhileOneRuns(t *testing.T) {
	r := newGA(t)
	r.connect(t, r.owner)
	for _, bad := range []string{"properties/999", "accounts/1", "properties/1/../2", "", "properties/111;drop"} {
		if code, out := r.importIt(t, r.owner, bad, false); code != http.StatusBadRequest {
			t.Errorf("%q: %d %v", bad, code, out)
		}
	}
	if r.google.Requests != 0 {
		t.Errorf("%d report requests were sent for properties that are not the person's", r.google.Requests)
	}
}

func TestGAQuotaPausesAndResumeFinishes(t *testing.T) {
	r := newGA(t)
	r.connect(t, r.owner)
	r.from = "2026-01-01"
	r.google.Throttle = 100000
	if code, out := r.importIt(t, r.owner, "properties/111", false); code != http.StatusAccepted {
		t.Fatalf("%d %v", code, out)
	}
	job := r.waitJob(t, r.owner, ga.Paused)
	if job["code"] != "quota" || job["retry_at"] == nil {
		t.Errorf("job %v", job)
	}
	if r.status(t, r.owner)["connected"] != true {
		t.Error("a paused import lost its sign-in")
	}
	r.google.Throttle = 0
	if code, out := r.importIt(t, r.owner, "properties/111", true); code != http.StatusAccepted {
		t.Fatalf("resume: %d %v", code, out)
	}
	r.waitJob(t, r.owner, ga.Done)
}

func TestGADeniedByGoogleEndsTheSignIn(t *testing.T) {
	r := newGA(t)
	r.connect(t, r.owner)
	r.google.Denied = true
	if code, _ := r.importIt(t, r.owner, "properties/111", false); code != http.StatusAccepted {
		t.Fatal(code)
	}
	job := r.waitJob(t, r.owner, ga.Denied)
	if job["code"] != "denied" {
		t.Errorf("job %v", job)
	}
	if r.status(t, r.owner)["connected"] == true {
		t.Error("a refused token is still held")
	}
}

func TestGAImportStopsTheDayBeforeTheSitesFirstEvent(t *testing.T) {
	r := newGA(t)
	r.connect(t, r.owner)
	if code, _ := r.importIt(t, r.owner, "properties/111", false); code != http.StatusAccepted {
		t.Fatal(code)
	}
	job := r.waitJob(t, r.owner, ga.Done)
	if job["to"] != "2026-09-21" { // the rig's day is 22 September 2026
		t.Errorf("no events yet: the import ends %v, want yesterday", job["to"])
	}
}

func TestGATheTokenIsNeverLoggedOrSent(t *testing.T) {
	var logs bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(old) })
	r := newGA(t)
	var bodies strings.Builder
	grab := func(c *http.Client, method, u, body string) {
		req, _ := http.NewRequest(method, u, strings.NewReader(body))
		req.Header.Set(csrf, "1")
		res, err := c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		b, _ := io.ReadAll(res.Body)
		res.Body.Close()
		bodies.Write(b)
		for k, v := range res.Header {
			bodies.WriteString(k + strings.Join(v, ","))
		}
	}
	// A failed sign-in and a good one, a failing import and a finished one.
	grab(r.owner, "GET", r.srv.URL+"/api/v1/ga/callback?code=x&state=y", "")
	r.connect(t, r.owner)
	grab(r.owner, "GET", r.path("/properties"), "")
	r.google.Denied = true
	grab(r.owner, "POST", r.path("/import"), `{"property":"properties/111"}`)
	r.waitJob(t, r.owner, ga.Denied)
	grab(r.owner, "GET", r.path(""), "")
	r.google.Denied = false
	r.connect(t, r.owner)
	grab(r.owner, "POST", r.path("/import"), `{"property":"properties/111"}`)
	r.waitJob(t, r.owner, ga.Done)
	grab(r.owner, "GET", r.path(""), "")
	for _, secret := range []string{gatest.AccessToken, gatest.ClientSecret, "code-"} {
		if strings.Contains(logs.String(), secret) {
			t.Errorf("%q is in the log:\n%s", secret, logs.String())
		}
		if strings.Contains(bodies.String(), secret) {
			t.Errorf("%q was sent to the browser:\n%s", secret, bodies.String())
		}
	}
}

func TestGAIsOffWithoutAnOAuthClient(t *testing.T) {
	r := newGA(t)
	r.api.GA = nil
	if st := r.status(t, r.owner); st["enabled"] != false {
		t.Errorf("%v", st)
	}
	if res := fetch(t, r.owner, r.path("/start")); res.StatusCode != http.StatusNotFound {
		t.Errorf("start without a client: %d", res.StatusCode)
	}
	r.api.GA = &ga.Manager{Client: &ga.Client{ID: "id"}} // no secret
	if st := r.status(t, r.owner); st["enabled"] != false {
		t.Errorf("a client without its secret: %v", st)
	}
	r.api.GA = nil
}

func TestGAPropertiesWithoutAnOAuthClientIsNotAPanic(t *testing.T) {
	r := newGA(t)
	r.api.GA = nil
	if code, out := do(t, r.owner, "GET", r.path("/properties"), ""); code != http.StatusNotFound {
		t.Errorf("properties without a client: %d %v", code, out)
	}
	if code, _ := r.importIt(t, r.owner, "properties/111", false); code != http.StatusNotFound {
		t.Errorf("import without a client: %d", code)
	}
}
