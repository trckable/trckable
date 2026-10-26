package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func itemOf(t *testing.T, o setupOut, id string) setupItem {
	t.Helper()
	for _, it := range o.Items {
		if it.ID == id {
			return it
		}
	}
	t.Fatalf("no item %s in %+v", id, o.Items)
	return setupItem{}
}

func baseIn() setupIn {
	return setupIn{Now: time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC), Timezone: "UTC", Currency: "USD", Known: true, Stored: sqlite.SiteSetup{Skips: map[string]string{}}}
}

// The rules, without a server: what is done, what counts, and the defaults.
func TestSetupRules(t *testing.T) {
	t.Run("a new site counts eight and has none done", func(t *testing.T) {
		o := buildSetup(baseIn())
		if o.Counted != 8 || o.Done != 0 || o.AllSet {
			t.Fatalf("counted %d done %d", o.Counted, o.Done)
		}
		if g := itemOf(t, o, "verified").Group; g != setupCore {
			t.Fatalf("group %s", g)
		}
	})
	t.Run("the script is installed from the first visit", func(t *testing.T) {
		in := baseIn()
		in.Paths = 0
		if itemOf(t, buildSetup(in), "verified").Done {
			t.Fatal("no visit is not installed")
		}
		in.Paths = 1
		if it := itemOf(t, buildSetup(in), "verified"); !it.Done || it.Detail["pages"] != int64(1) {
			t.Fatalf("one visit installs it: %+v", it)
		}
		in.Paths = 2
		it := itemOf(t, buildSetup(in), "verified")
		if !it.Done || it.Detail["pages"] != int64(2) {
			t.Fatalf("%+v", it)
		}
	})
	t.Run("time zone and currency", func(t *testing.T) {
		in := baseIn()
		if itemOf(t, buildSetup(in), "locale").Done {
			t.Fatal("UTC/USD is a default, not an answer")
		}
		in.Timezone = "Europe/Berlin"
		if !itemOf(t, buildSetup(in), "locale").Done {
			t.Fatal("a changed zone is an answer")
		}
		in = baseIn()
		in.Stored.LocaleConfirmedAt = 5
		if !itemOf(t, buildSetup(in), "locale").Done {
			t.Fatal("a confirmed UTC/USD is an answer")
		}
	})
	t.Run("the proxy counts for seven days", func(t *testing.T) {
		in := baseIn()
		in.Stored.ProxySeenAt = in.Now.Add(-6 * 24 * time.Hour).Unix()
		if !itemOf(t, buildSetup(in), "proxy").Done {
			t.Fatal("six days ago is recent")
		}
		in.Stored.ProxySeenAt = in.Now.Add(-8 * 24 * time.Hour).Unix()
		if itemOf(t, buildSetup(in), "proxy").Done {
			t.Fatal("eight days ago is not")
		}
	})
	t.Run("a skip moves the row to More and out of the count", func(t *testing.T) {
		in := baseIn()
		in.Stored.Skips["payments"] = sqlite.SkipSkipped
		o := buildSetup(in)
		it := itemOf(t, o, "payments")
		if !it.Skipped || it.Counted || it.Group != setupMore || o.Counted != 7 {
			t.Fatalf("%+v counted %d", it, o.Counted)
		}
	})
	t.Run("a done step is never skipped", func(t *testing.T) {
		in := baseIn()
		in.Stored.Skips["payments"] = sqlite.SkipSkipped
		in.Payments = &payState{Provider: "stripe", Sales: 1}
		it := itemOf(t, buildSetup(in), "payments")
		if it.Skipped || !it.Counted || !it.Done {
			t.Fatalf("%+v", it)
		}
	})
	t.Run("all done reads all set, with the skipped ones out", func(t *testing.T) {
		in := baseIn()
		in.Paths, in.OwnIPs, in.Goals, in.Timezone = 3, 1, true, "Europe/Berlin"
		in.Payments, in.Search, in.Crawlers = &payState{Sales: 2}, true, true
		in.Stored.FunnelBuiltAt = 1
		in.Stored.Skips["proxy"] = sqlite.SkipSkipped
		o := buildSetup(in)
		if !o.AllSet || o.Done != 7 || o.Counted != 7 {
			t.Fatalf("done %d of %d", o.Done, o.Counted)
		}
	})
	t.Run("your own visits are an extra: they never count", func(t *testing.T) {
		it := itemOf(t, buildSetup(baseIn()), "own_visits")
		if it.Group != setupMore || it.Counted {
			t.Fatalf("%+v", it)
		}
	})
	t.Run("the first open step is the most valuable for the kind", func(t *testing.T) {
		first := func(kind string) []string {
			in := baseIn()
			in.Stored.Kind = kind
			var ids []string
			for _, it := range buildSetup(in).Items {
				if it.Counted {
					ids = append(ids, it.ID)
				}
			}
			return ids
		}
		if got := first(sqlite.KindShop); got[1] != "goal" || got[2] != "payments" || got[3] != "search" {
			t.Fatalf("shop: %v", got)
		}
		if got := first(sqlite.KindContent); got[1] != "search" {
			t.Fatalf("blog: %v", got)
		}
		if got := first(sqlite.KindSaaS); got[1] != "goal" || got[2] != "funnel" {
			t.Fatalf("saas: %v", got)
		}
	})
	t.Run("the extras never count", func(t *testing.T) {
		in := baseIn()
		in.Vitals, in.Heatmaps, in.Team, in.Phone, in.Keywords = true, true, true, true, true
		if o := buildSetup(in); o.Counted != 8 || o.Done != 0 {
			t.Fatalf("done %d of %d", o.Done, o.Counted)
		}
	})
}

// The smart defaults, from the kind and from the site's own history.
func TestSetupDefaults(t *testing.T) {
	t.Run("a site with sales counts payments as done", func(t *testing.T) {
		in := baseIn()
		in.Payments = &payState{Provider: "stripe", Sales: 12}
		it := itemOf(t, buildSetup(in), "payments")
		if !it.Done || !it.Counted || it.Detail["provider"] != "stripe" {
			t.Fatalf("%+v", it)
		}
	})
	t.Run("a connection without a sale is not done yet, and still names the provider", func(t *testing.T) {
		in := baseIn()
		in.Payments = &payState{Provider: "stripe"}
		it := itemOf(t, buildSetup(in), "payments")
		if it.Done || !it.Counted || it.Detail["provider"] != "stripe" || it.Detail["connected"] != true {
			t.Fatalf("%+v", it)
		}
	})
	t.Run("a saas site never starts with the funnel skipped", func(t *testing.T) {
		in := baseIn()
		in.Paths, in.Stored.Kind = 1, sqlite.KindSaaS
		if it := itemOf(t, buildSetup(in), "funnel"); it.Skipped || !it.Counted {
			t.Fatalf("%+v", it)
		}
	})
	t.Run("a site with one path starts with the funnel as not for me", func(t *testing.T) {
		in := baseIn()
		in.Paths = 1
		it := itemOf(t, buildSetup(in), "funnel")
		if !it.Skipped || it.Counted {
			t.Fatalf("%+v", it)
		}
		in.Stored.Skips["funnel"] = sqlite.SkipKept // the owner brought it back
		it = itemOf(t, buildSetup(in), "funnel")
		if it.Skipped || !it.Counted {
			t.Fatalf("brought back: %+v", it)
		}
	})
	t.Run("a site with no history, or two paths, keeps the funnel", func(t *testing.T) {
		for _, paths := range []int64{0, 2} {
			in := baseIn()
			in.Paths = paths
			if it := itemOf(t, buildSetup(in), "funnel"); it.Skipped {
				t.Fatalf("%d paths: %+v", paths, it)
			}
		}
		in := baseIn() // the analytics store could not answer: nothing is assumed
		in.Known, in.Paths = false, 0
		if itemOf(t, buildSetup(in), "funnel").Skipped {
			t.Fatal("unknown history skipped the funnel")
		}
	})
	for _, tc := range []struct {
		kind, goal      string
		paymentsSkipped bool
	}{
		{sqlite.KindShop, "Purchase", false},
		{sqlite.KindSaaS, "Sign-up", false},
		{sqlite.KindContent, "Newsletter sign-up", true},
		{sqlite.KindOther, "", false},
		{"", "", false},
	} {
		t.Run("kind "+tc.kind, func(t *testing.T) {
			in := baseIn()
			in.Stored.Kind = tc.kind
			o := buildSetup(in)
			if o.GoalSuggestion != tc.goal || itemOf(t, o, "payments").Skipped != tc.paymentsSkipped {
				t.Fatalf("goal %q payments skipped %v", o.GoalSuggestion, itemOf(t, o, "payments").Skipped)
			}
			if tc.paymentsSkipped {
				in.Stored.Skips["payments"] = sqlite.SkipKept
				if itemOf(t, buildSetup(in), "payments").Skipped {
					t.Fatal("brought back, it is skipped again by the default")
				}
			}
		})
	}
	t.Run("a provider on the page names the payments step", func(t *testing.T) {
		in := baseIn()
		in.Stored.Provider = "stripe"
		d := itemOf(t, buildSetup(in), "payments").Detail
		if d["provider"] != "stripe" {
			t.Fatalf("provider %v", d["provider"])
		}
		if _, ok := d["connected"]; ok {
			t.Fatalf("a provider only seen on the page is not a connection: %v", d)
		}
	})
}

func setupURL(g *rig, tail string) string {
	return g.srv.URL + "/api/v1/sites/" + g.site + "/setup" + tail
}

func getSetup(t *testing.T, g *rig, c *http.Client) map[string]any {
	t.Helper()
	code, out := do(t, c, "GET", setupURL(g, ""), "")
	if code != http.StatusOK {
		t.Fatalf("GET setup: %d %v", code, out)
	}
	return out
}

func apiItem(t *testing.T, out map[string]any, id string) map[string]any {
	t.Helper()
	for _, it := range out["items"].([]any) {
		if m := it.(map[string]any); m["id"] == id {
			return m
		}
	}
	t.Fatalf("no item %s", id)
	return nil
}

func viewerClient(t *testing.T, g *rig) *http.Client {
	t.Helper()
	if _, err := g.ctl.AddUser(context.Background(), sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	v := client()
	if code, out := do(t, v, "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@site.com","password":"correct horse battery V"}`); code != http.StatusOK {
		t.Fatalf("viewer signs in: %d %v", code, out)
	}
	return v
}

// Every item, not done and then done, read from real data.
func TestSetupEndpointEachItem(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	c := client()
	g.setup(t, c)

	out := getSetup(t, g, c)
	for _, id := range []string{"verified", "own_visits", "locale", "goal", "payments", "funnel", "search", "crawlers", "proxy", "heatmaps", "ga", "team", "phone", "mentions"} {
		if apiItem(t, out, id)["done"] == true {
			t.Errorf("%s is done on a new site", id)
		}
	}
	// Core Web Vitals are on for a new site, so that item is already done.
	if apiItem(t, out, "vitals")["done"] != true {
		t.Errorf("vitals is not done on a new site, where they are on by default")
	}
	if out["counted"] != 8.0 || out["done"] != 0.0 {
		t.Fatalf("new site: %v", out)
	}

	// Pageviews on two paths; the first one verifies the install, the second is seen as a second page.
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, Visitor: 1, Path: "/", TS: g.now.Add(-time.Hour).UnixMilli()})
	g.waitApplied(t, 1)
	g.advance(2 * time.Minute) // the page count is reused for a minute
	out = getSetup(t, g, c)
	if apiItem(t, out, "verified")["done"] != true || apiItem(t, out, "funnel")["skipped"] != true {
		t.Fatalf("one path: verified %v funnel %v", apiItem(t, out, "verified"), apiItem(t, out, "funnel"))
	}
	g.advance(2 * time.Minute) // the page count is reused for a minute
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 2, Visitor: 1, Path: "/pricing", TS: g.now.Add(-time.Hour).UnixMilli()})
	g.waitApplied(t, 2)
	out = getSetup(t, g, c)
	v := apiItem(t, out, "verified")
	if v["done"] != true || v["detail"].(map[string]any)["pages"] != 2.0 || apiItem(t, out, "funnel")["skipped"] == true {
		t.Fatalf("two paths: %v", v)
	}

	// Own visits left out.
	if code, o := do(t, c, "PUT", g.srv.URL+"/api/v1/sites/"+g.site+"/config", `{"exclude_ips":["203.0.113.5"]}`, csrf, "1"); code != 200 {
		t.Fatalf("config: %d %v", code, o)
	}
	if apiItem(t, getSetup(t, g, c), "own_visits")["done"] != true {
		t.Fatal("own visits")
	}

	// Time zone and currency: the owner's word.
	loc := apiItem(t, getSetup(t, g, c), "locale")
	if loc["done"] == true || loc["detail"].(map[string]any)["currency"] != "USD" {
		t.Fatalf("locale before: %v", loc)
	}
	if code, o := do(t, c, "PUT", setupURL(g, "/locale"), "", csrf, "1"); code != 200 || apiItem(t, o, "locale")["done"] != true {
		t.Fatalf("That's right: %d %v", code, o)
	}

	// A goal: a page goal, or goals already seen.
	g.ctl.NoteGoalLabel(ctx, g.site, "signup", "Signup")
	if apiItem(t, getSetup(t, g, c), "goal")["done"] != true {
		t.Fatal("goal")
	}

	// Payments: a real connection; the typed-in "custom" one is not.
	if _, err := g.ctl.DB.Exec(`INSERT INTO pay_connections (id, site_id, provider, created_at) VALUES ('c1', ?, 'custom', 1)`, g.site); err != nil {
		t.Fatal(err)
	}
	if apiItem(t, getSetup(t, g, c), "payments")["done"] == true {
		t.Fatal("a typed-in connection is not payments")
	}
	if _, err := g.ctl.DB.Exec(`INSERT INTO pay_connections (id, site_id, provider, created_at) VALUES ('c2', ?, 'stripe', 1)`, g.site); err != nil {
		t.Fatal(err)
	}
	if apiItem(t, getSetup(t, g, c), "payments")["done"] == true {
		t.Fatal("a connection without a sale is not done")
	}
	if _, err := g.ctl.DB.Exec(`INSERT INTO pay_payments (site_id, provider, id, connection_id, paid_at, currency, gross, version) VALUES (?, 'stripe', 'p1', 'c2', 1, 'USD', 500, 1)`, g.site); err != nil {
		t.Fatal(err)
	}
	pay := apiItem(t, getSetup(t, g, c), "payments")
	if pay["done"] != true || pay["detail"].(map[string]any)["provider"] != "stripe" || pay["detail"].(map[string]any)["sales"] != 1.0 {
		t.Fatalf("payments: %v", pay)
	}

	// A funnel the owner built.
	if code, o := do(t, c, "POST", setupURL(g, "/funnel"), "", csrf, "1"); code != 200 || apiItem(t, o, "funnel")["done"] != true {
		t.Fatalf("funnel: %d %v", code, o)
	}

	// Search Console, with a property chosen.
	if err := g.ctl.SetSearchConsoleKey(ctx, g.site, "sealed", "bot@x.iam"); err != nil {
		t.Fatal(err)
	}
	if apiItem(t, getSetup(t, g, c), "search")["done"] == true {
		t.Fatal("a key without a property is not connected")
	}
	if err := g.ctl.SetSearchConsoleProperty(ctx, g.site, "sc-domain:site.com"); err != nil {
		t.Fatal(err)
	}
	if apiItem(t, getSetup(t, g, c), "search")["done"] != true {
		t.Fatal("search")
	}

	// AI crawlers: a hit recorded for the site.
	if _, err := g.api.Query().DB.Exec(`INSERT INTO crawler_hits (site_id, day, name, kind, path, hits, errors) VALUES (?, DATE '2026-09-20', 'GPTBot', 'train', '/', 3, 0)`, g.site); err != nil {
		t.Fatal(err)
	}
	g.advance(2 * time.Minute)
	if apiItem(t, getSetup(t, g, c), "crawlers")["done"] != true {
		t.Fatal("crawlers")
	}

	// The proxy: the last proxied event, within seven days of the server's clock.
	g.ctl.SeenProxied(ctx, g.site, g.now.Add(-2*24*time.Hour).Unix())
	if apiItem(t, getSetup(t, g, c), "proxy")["done"] != true {
		t.Fatal("proxy")
	}
	g.ctl.SeenProxied(ctx, g.site, g.now.Add(-2*24*time.Hour).Unix()-1) // an older one never moves it back
	g.advance(9 * 24 * time.Hour)
	if apiItem(t, getSetup(t, g, c), "proxy")["done"] == true {
		t.Fatal("proxy after nine days")
	}

	// The extras.
	if code, _ := do(t, c, "PUT", g.srv.URL+"/api/v1/sites/"+g.site+"/mentions/keywords", `{"keywords":["acme tools"]}`, csrf, "1"); code != 200 {
		t.Fatal("keywords")
	}
	if _, err := g.ctl.AddUser(ctx, sqlite.DefaultAccount, "mate@site.com", "correct horse battery M", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	out = getSetup(t, g, c)
	if apiItem(t, out, "mentions")["done"] != true || apiItem(t, out, "team")["done"] != true {
		t.Fatalf("extras: %v", out["items"])
	}
	if out["counted"] != 8.0 {
		t.Fatalf("extras counted: %v", out["counted"])
	}
}

// Skip and unskip: owners write, a viewer only reads, the skip is stored per
// site, and a default skip stays off once the owner brought it back.
func TestSetupSkipAndUnskip(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	viewer := viewerClient(t, g)

	code, out := do(t, c, "PUT", setupURL(g, "/skip/payments"), "", csrf, "1")
	p := apiItem(t, out, "payments")
	if code != 200 || p["skipped"] != true || p["counted"] == true || p["group"] != "more" || out["counted"] != 7.0 {
		t.Fatalf("skip: %d %v", code, out)
	}
	if apiItem(t, getSetup(t, g, viewer), "payments")["skipped"] != true {
		t.Fatal("a viewer sees the owner's skip")
	}
	code, out = do(t, c, "DELETE", setupURL(g, "/skip/payments"), "", csrf, "1")
	if code != 200 || apiItem(t, out, "payments")["skipped"] == true || out["counted"] != 8.0 {
		t.Fatalf("unskip: %d %v", code, out)
	}
	if code, _ := do(t, c, "PUT", setupURL(g, "/skip/locale"), "", csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("a step that always counts cannot be skipped: %d", code)
	}

	// A viewer reads, and is refused every write; nothing changes.
	for _, w := range [][2]string{{"PUT", "/skip/funnel"}, {"DELETE", "/skip/payments"}, {"PUT", "/locale"}, {"PUT", "/kind"}, {"POST", "/funnel"}} {
		if code, _ := do(t, viewer, w[0], setupURL(g, w[1]), `{"kind":"shop"}`, csrf, "1"); code != http.StatusForbidden {
			t.Errorf("viewer %s %s: %d, want 403", w[0], w[1], code)
		}
	}
	out = getSetup(t, g, c)
	if apiItem(t, out, "funnel")["skipped"] == true || apiItem(t, out, "locale")["done"] == true || out["kind"].(map[string]any)["value"] != "" {
		t.Fatalf("a refused viewer changed something: %v", out)
	}

}

// The default skip (a blog's payments), brought back, stays back.
func TestSetupDefaultSkipStaysBackOnceBroughtBack(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	if err := g.ctl.GuessKind(context.Background(), g.site, "content", ""); err != nil {
		t.Fatal(err)
	}
	if apiItem(t, getSetup(t, g, c), "payments")["skipped"] != true {
		t.Fatal("a content site starts with payments as not for me")
	}
	do(t, c, "DELETE", setupURL(g, "/skip/payments"), "", csrf, "1")
	if apiItem(t, getSetup(t, g, c), "payments")["skipped"] == true {
		t.Fatal("brought back")
	}
}

// A share link or embed is not a signed-in person: the checklist is refused.
func TestSetupIsHiddenOnShareLinks(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	code, out := do(t, c, "POST", g.srv.URL+"/api/v1/sites/"+g.site+"/shares", `{"name":"x"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("create: %d %v", code, out)
	}
	link, _ := out["url"].(string)
	anon := client()
	if code, _ := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+link[len(link)-26:]+`"}`); code != 200 {
		t.Fatalf("open: %d", code)
	}
	for _, m := range [][2]string{{"GET", ""}, {"PUT", "/skip/payments"}, {"PUT", "/locale"}} {
		if code, _ := do(t, anon, m[0], setupURL(g, m[1]), "", csrf, "1"); code != http.StatusUnauthorized {
			t.Errorf("share link %s %s: %d, want 401", m[0], m[1], code)
		}
	}
}

// The install check guesses the kind from the homepage; the owner's own
// choice is never overwritten by a later guess.
func TestSetupKindIsGuessedAndChosenKindSticks(t *testing.T) {
	g := newRig(t)
	page := `<html><a href="/cart">Cart</a><script src="https://js.stripe.com/v3/"></script><script data-site="` + g.site + `"></script></html>`
	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, page) }))
	defer site.Close()
	was := checkClient
	defer func() { checkClient = was }()
	checkClient = func() *http.Client {
		return &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
			u, _ := url.Parse(site.URL)
			r2 := r.Clone(r.Context())
			r2.URL.Scheme, r2.URL.Host = u.Scheme, u.Host
			res, err := http.DefaultTransport.RoundTrip(r2)
			if res != nil {
				res.Request = r
			}
			return res, err
		})}
	}
	c := client()
	g.setup(t, c)
	if code, out := do(t, c, "POST", setupURL(g, "")[:len(setupURL(g, ""))-len("/setup")]+"/install/check", "", csrf, "1"); code != 200 || out["kind"] != "shop" || out["provider"] != "stripe" {
		t.Fatalf("check: %d %v", code, out)
	}
	out := getSetup(t, g, c)
	k := out["kind"].(map[string]any)
	if k["value"] != "shop" || k["chosen"] == true || k["provider"] != "stripe" || out["goal_suggestion"] != "Purchase" {
		t.Fatalf("guess: %v", out)
	}
	if apiItem(t, out, "payments")["detail"].(map[string]any)["provider"] != "stripe" {
		t.Fatalf("payments names the provider: %v", apiItem(t, out, "payments"))
	}

	if code, _ := do(t, c, "PUT", setupURL(g, "/kind"), `{"kind":"nonsense"}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("a kind that is not one: %d", code)
	}
	if code, o := do(t, c, "PUT", setupURL(g, "/kind"), `{"kind":"content"}`, csrf, "1"); code != 200 || o["kind"].(map[string]any)["chosen"] != true {
		t.Fatalf("choose: %d %v", code, o)
	}
	g.advance(11 * time.Minute) // the check is limited
	page = `<html><a href="/pricing">Pricing</a><script data-site="` + g.site + `"></script></html>`
	if code, out := do(t, c, "POST", setupURL(g, "")[:len(setupURL(g, ""))-len("/setup")]+"/install/check", "", csrf, "1"); code != 200 || out["kind"] != "saas" {
		t.Fatalf("second check: %d %v", code, out)
	}
	k = getSetup(t, g, c)["kind"].(map[string]any)
	if k["value"] != "content" || k["chosen"] != true || k["provider"] != nil {
		t.Fatalf("a later guess overwrote the owner's choice: %v", k)
	}
}

// A guess is kept only from a page that carries this site's script at the
// site's own address.
func TestKindIsKeptOnlyFromTheSitesOwnPage(t *testing.T) {
	if !sameSite("www.Site.com", "site.com") || !sameSite("site.com", "site.com") || sameSite("other.com", "site.com") {
		t.Fatal("sameSite")
	}
	g := newRig(t)
	page := `<html><a href="/cart">Cart</a></html>` // a shop page without the script
	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, page) }))
	defer site.Close()
	was := checkClient
	defer func() { checkClient = was }()
	checkClient = func() *http.Client {
		return &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
			u, _ := url.Parse(site.URL)
			r2 := r.Clone(r.Context())
			r2.URL.Scheme, r2.URL.Host = u.Scheme, u.Host
			return http.DefaultTransport.RoundTrip(r2)
		})}
	}
	c := client()
	g.setup(t, c)
	check := g.srv.URL + "/api/v1/sites/" + g.site + "/install/check"
	if code, _ := do(t, c, "POST", check, "", csrf, "1"); code != 200 {
		t.Fatal("check")
	}
	if k := getSetup(t, g, c)["kind"].(map[string]any); k["value"] != "" {
		t.Fatalf("a page without the script set the kind: %v", k)
	}
	// A page that redirects to another host: the response's URL is not the site's.
	redirected := installCheck{URL: "https://elsewhere.com/", Found: "site", Kind: "shop"}
	g.api.remember(context.Background(), g.site, "site.com", redirected)
	if k := getSetup(t, g, c)["kind"].(map[string]any); k["value"] != "" {
		t.Fatalf("a redirect elsewhere set the kind: %v", k)
	}
}

// The first visit shows in the checklist at once: an empty page count read just before it is not reused for a minute.
func TestSetupVerifiedAtTheFirstVisit(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	if apiItem(t, getSetup(t, g, c), "verified")["done"] == true {
		t.Fatal("verified before any visit")
	}
	g.ctl.SeenSite(context.Background(), g.site, g.now.Unix())
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, Visitor: 1, Path: "/", TS: g.now.UnixMilli()})
	g.waitApplied(t, 1)
	if apiItem(t, getSetup(t, g, c), "verified")["done"] != true {
		t.Fatal("the first visit has landed and the install still waits")
	}
}
