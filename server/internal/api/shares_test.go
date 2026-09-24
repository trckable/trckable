package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// A link shows one site's numbers to someone with no account — and only what
// the link says it may.
func TestShareLink(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, Visitor: 4, Path: "/", TS: g.now.Add(-time.Hour).UnixMilli(), Country: "DE"})
	g.waitApplied(t, 1)

	code, out := do(t, c, "POST", base+"/shares", `{"name":"For the investors","revenue":true}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("create: %d %v", code, out)
	}
	url, _ := out["url"].(string)
	token := url[len(url)-26:]
	if len(token) != 26 {
		t.Fatalf("token: %q from %q", token, url)
	}

	// Anyone with the link, and no account at all.
	anon := client()
	if code, _ := do(t, anon, "GET", g.srv.URL+"/api/v1/share/report?from=2026-09-22&to=2026-09-22", ""); code != http.StatusUnauthorized {
		t.Fatal("the report was readable without opening the link")
	}
	code, info := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`"}`)
	if code != 200 || info["domain"] != "site.com" {
		t.Fatalf("open: %d %v", code, info)
	}
	if info["revenue"] != true {
		t.Fatalf("this link allows revenue: %v", info)
	}
	code, rep := do(t, anon, "GET", g.srv.URL+"/api/v1/share/report?from=2026-09-22&to=2026-09-22", "")
	if code != 200 {
		t.Fatalf("share report: %d %v", code, rep)
	}
	if rep["current"].(map[string]any)["kpis"].(map[string]any)["visitors"] != 1.0 {
		t.Fatalf("numbers: %v", rep["current"])
	}
	// One site, and nothing else on the instance.
	for _, p := range []string{"/api/v1/sites", "/api/v1/people", "/api/v1/keys", "/api/v1/sites/" + g.site + "/report?from=2026-09-22&to=2026-09-22"} {
		if code, _ := do(t, anon, "GET", g.srv.URL+p, ""); code != http.StatusUnauthorized {
			t.Errorf("a shared link reached %s: %d", p, code)
		}
	}
	// And it cannot change anything.
	if code, _ := do(t, anon, "POST", g.srv.URL+"/api/v1/sites/"+g.site+"/annotations", `{"day":"2026-09-22","text":"x"}`, csrf, "1"); code != http.StatusUnauthorized {
		t.Error("a shared link wrote a note")
	}

	// Revoking it ends the session too, not just new openings.
	list := func() []any {
		_, out := do(t, c, "GET", base+"/shares", "")
		return out["shares"].([]any)
	}
	if len(list()) != 1 {
		t.Fatal("the link is missing from the list")
	}
	id := list()[0].(map[string]any)["id"].(string)
	if list()[0].(map[string]any)["views"] != 1.0 {
		t.Errorf("the opening was not recorded: %v", list()[0])
	}
	if code, _ := do(t, c, "DELETE", base+"/shares/"+id, "", csrf, "1"); code != http.StatusNoContent {
		t.Fatal("revoke failed")
	}
	if code, _ := do(t, anon, "GET", g.srv.URL+"/api/v1/share/report?from=2026-09-22&to=2026-09-22", ""); code != http.StatusUnauthorized {
		t.Error("a revoked link still worked for someone who had it open")
	}
}

// Hiding revenue means the number is never asked for, so it is not in the
// answer to be found in a network tab.
func TestShareCanHideRevenue(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, Visitor: 4, Path: "/", TS: g.now.Add(-time.Hour).UnixMilli()})
	g.waitApplied(t, 1)
	// Connecting a provider turns the revenue module on.
	if code, _ := do(t, c, "POST", base+"/payments", `{"provider":"custom"}`, csrf, "1"); code != http.StatusCreated {
		t.Fatal("connect")
	}

	shared := func(revenue bool) map[string]any {
		_, out := do(t, c, "POST", base+"/shares", `{"name":"x","revenue":`+map[bool]string{true: "true", false: "false"}[revenue]+`}`, csrf, "1")
		url := out["url"].(string)
		anon := client()
		do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`)
		_, rep := do(t, anon, "GET", g.srv.URL+"/api/v1/share/report?from=2026-09-22&to=2026-09-22", "")
		return rep["current"].(map[string]any)
	}
	if _, ok := shared(true)["money"]; !ok {
		t.Error("a link that allows revenue did not show it")
	}
	if _, ok := shared(false)["money"]; ok {
		t.Error("a link that hides revenue still carried the money block")
	}
}

// A password is asked for once, and a wrong one is told apart from a missing
// one — the link itself is the secret, not the fact that it has a password.
func TestSharePassword(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	_, out := do(t, c, "POST", g.srv.URL+"/api/v1/sites/"+g.site+"/shares", `{"name":"x","password":"open sesame please"}`, csrf, "1")
	url := out["url"].(string)
	token := url[len(url)-26:]

	anon := client()
	code, res := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`"}`)
	if code != http.StatusUnauthorized || res["needs_password"] != true {
		t.Fatalf("no password: %d %v", code, res)
	}
	if code, res := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`","password":"wrong"}`); code != http.StatusUnauthorized || res["needs_password"] != true {
		t.Fatalf("wrong password: %d %v", code, res)
	}
	if code, _ := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`","password":"open sesame please"}`); code != 200 {
		t.Fatal("the right password was refused")
	}
	// Once open, it stays open without asking again.
	if code, _ := do(t, anon, "GET", g.srv.URL+"/api/v1/share/me", ""); code != 200 {
		t.Error("the session did not stick")
	}
	// A token that never existed says so, without saying whether it might have.
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"aaaaaaaaaaaaaaaaaaaaaaaaaa"}`); code != http.StatusNotFound {
		t.Error("an invented token was not refused")
	}
}

func TestEmbeddableShareLinks(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/shares"

	if code, out := do(t, c, "POST", base, `{"name":"x","embed_origins":["https://example.com/some/page"]}`, csrf, "1"); code != 400 {
		t.Fatalf("an origin with a path: %d %v", code, out)
	}
	if code, _ := do(t, c, "POST", base, `{"name":"x","embed_origins":["http://example.com"]}`, csrf, "1"); code != 400 {
		t.Fatal("plain http was accepted for a public site")
	}
	code, out := do(t, c, "POST", base, `{"name":"Blog","embed_origins":["https://example.com/", "http://localhost:3000"]}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("create: %d %v", code, out)
	}
	token := out["url"].(string)[strings.LastIndex(out["url"].(string), "/s/")+3:]
	_, plain := do(t, c, "POST", base, `{"name":"Plain"}`, csrf, "1")
	plainToken := plain["url"].(string)[strings.LastIndex(plain["url"].(string), "/s/")+3:]

	a := &API{Ctl: g.ctl, Now: time.Now}
	frame := func(path string) string {
		r := httptest.NewRequest("GET", path, nil)
		return a.FrameAncestors(r)
	}
	if got := frame("/s/" + token); got != "https://example.com http://localhost:3000" {
		t.Fatalf("frame-ancestors for an embeddable link = %q", got)
	}
	if got := frame("/s/" + plainToken); got != "" {
		t.Fatalf("a plain link may be framed: %q", got)
	}
	if got := frame("/demo.example.com"); got != "" {
		t.Fatalf("the dashboard may be framed: %q", got)
	}

	// Inside an iframe the cookie never arrives, so the session comes back in
	// the answer and travels as a header.
	anon := &http.Client{Timeout: 5 * time.Second}
	code, opened := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`","embed":true}`)
	session, _ := opened["session"].(string)
	if code != 200 || session == "" {
		t.Fatalf("embed open: %d %v", code, opened)
	}
	if code, _ := do(t, anon, "GET", g.srv.URL+"/api/v1/share/me", ""); code != http.StatusUnauthorized {
		t.Fatal("no cookie and no header still opened the link")
	}
	if code, me := do(t, anon, "GET", g.srv.URL+"/api/v1/share/me", "", "X-Trckable-Share", session); code != 200 || me["domain"] != "site.com" {
		t.Fatalf("header session: %d %v", code, me)
	}
	// A plain link never hands its session to the page.
	if _, o := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+plainToken+`","embed":true}`); o["session"] != "" {
		t.Fatalf("a plain link returned its session: %v", o)
	}
}
