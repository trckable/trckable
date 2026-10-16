package api

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

var vNow = time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)

func ago(d time.Duration) int64 { return vNow.Add(-d).Unix() }
func ptr(v int64) *int64        { return &v }

// The trckable snippet on the site vouches for nothing: no check, no visit, no
// listing. Only independent third parties are sources.
func TestTheSnippetIsNeverASource(t *testing.T) {
	if got := verifiedSources(verifiedIn{Now: vNow}); len(got) != 0 {
		t.Fatalf("nothing connected, nothing listed: %v", got)
	}
}

func TestSearchConsoleCountsOnlyWhileItWorks(t *testing.T) {
	sc := func(prop string, lastOK int64, err string) *sqlite.SearchConsole {
		return &sqlite.SearchConsole{Property: prop, Created: ago(30 * 24 * time.Hour), LastOK: lastOK, LastError: err}
	}
	cases := []struct {
		name   string
		sc     *sqlite.SearchConsole
		listed bool
		ok     bool
	}{
		{"synced yesterday", sc("sc-domain:a.com", ago(24*time.Hour), ""), true, true},
		{"synced four days ago", sc("sc-domain:a.com", ago(4*24*time.Hour), ""), true, false},
		{"never synced", sc("sc-domain:a.com", 0, ""), true, false},
		{"Google refused since", sc("sc-domain:a.com", ago(time.Hour), "403"), true, false},
		{"key pasted, no property chosen", sc("", ago(time.Hour), ""), false, false},
		{"not connected", nil, false, false},
	}
	for _, c := range cases {
		got := verifiedSources(verifiedIn{Now: vNow, Search: c.sc})
		if (len(got) == 1) != c.listed {
			t.Fatalf("%s: listed %v", c.name, got)
		}
		if c.listed && (got[0].Kind != "gsc" || got[0].OK != c.ok) {
			t.Fatalf("%s: %+v, want ok %v", c.name, got[0], c.ok)
		}
	}
}

func TestPaymentsAreOneSourceWhoeverDelivers(t *testing.T) {
	conn := func(provider, mode string, event, sync *int64, errText string) revenue.Connection {
		return revenue.Connection{Provider: provider, Mode: mode, CreatedAt: ago(60 * 24 * time.Hour), LastEvent: event, LastSync: sync, LastError: errText}
	}
	one := func(c ...revenue.Connection) (verifiedSource, int) {
		got := verifiedSources(verifiedIn{Now: vNow, Pay: c})
		if len(got) == 0 {
			return verifiedSource{}, 0
		}
		return got[0], len(got)
	}
	// Several providers, one entry, ok while any delivers, named for the one that did last.
	s, n := one(conn("stripe", "live", ptr(ago(time.Hour)), nil, ""), conn("paddle", "live", nil, ptr(ago(10*24*time.Hour)), ""), conn("paypal", "live", ptr(ago(31*24*time.Hour)), nil, ""))
	if n != 1 || s.Kind != "payments" || !s.OK || s.Provider != "stripe" {
		t.Fatalf("one Payments source: %d %+v", n, s)
	}
	// A provider that delivered within thirty days counts; older, or a sync that failed, does not.
	if s, _ := one(conn("paddle", "live", nil, ptr(ago(10*24*time.Hour)), "")); !s.OK {
		t.Fatalf("a sync ten days ago counts: %+v", s)
	}
	if s, _ := one(conn("paypal", "live", ptr(ago(31*24*time.Hour)), nil, "")); s.OK {
		t.Fatalf("31 days ago does not: %+v", s)
	}
	if s, _ := one(conn("lemonsqueezy", "live", nil, ptr(ago(time.Hour)), "401: bad key")); s.OK {
		t.Fatalf("a failing sync does not: %+v", s)
	}
	// Typed in by hand and test connections are not listed at all.
	if _, n := one(conn("polar", "test", ptr(ago(time.Hour)), nil, ""), conn("custom", "live", ptr(ago(time.Hour)), nil, "")); n != 0 {
		t.Fatalf("manual, custom and test connections are not listed: %d", n)
	}
}

// Every screen reads the same truth: the list, the one-site read, a shared
// link (money only when the link shows money) and the badge.
func TestVerifiedAcrossTheAPI(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	ctx := context.Background()
	site := g.api.Now() // the rig's clock
	c, err := g.rev.Connect(ctx, revenue.ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := g.ctl.DB.ExecContext(ctx, `UPDATE pay_connections SET last_event_at = ? WHERE id = ?`, site.Add(-2*time.Hour).Unix(), c.ID); err != nil {
		t.Fatal(err)
	}
	base := g.srv.URL + "/api/v1/sites/" + g.site

	count := func(v any) (ok int, kinds string) {
		m, _ := v.(map[string]any)
		list, _ := m["sources"].([]any)
		for _, s := range list {
			m := s.(map[string]any)
			if m["ok"] == true {
				ok++
			}
			kinds += m["kind"].(string) + ","
		}
		return
	}
	code, one := do(t, owner, "GET", base+"/verified", "")
	if code != http.StatusOK {
		t.Fatalf("verified: %d", code)
	}
	if n, kinds := count(one); n != 1 || kinds != "payments," {
		t.Fatalf("Stripe is the one source, the snippet is none: %d %s", n, kinds)
	}
	_, list := do(t, owner, "GET", g.srv.URL+"/api/v1/sites", "")
	row := list["sites"].([]any)[0].(map[string]any)
	if n, _ := count(row["verified"]); n != 1 {
		t.Fatalf("the sites list carries the same: %v", row["verified"])
	}

	// A link without money says nothing about money.
	_, made := do(t, owner, "POST", base+"/shares", `{"name":"x"}`, csrf, "1")
	url := made["url"].(string)
	anon := client()
	_, info := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`)
	if n, kinds := count(info["verified"]); n != 0 || kinds != "" {
		t.Fatalf("a link that hides money hides the provider: %d %s", n, kinds)
	}
	_, made = do(t, owner, "POST", base+"/shares", `{"name":"y","revenue":true}`, csrf, "1")
	url = made["url"].(string)
	_, info = do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`)
	if n, _ := count(info["verified"]); n != 1 {
		t.Fatalf("a link that shows money shows the provider: %v", info["verified"])
	}

	// The badge links to the open link, never the one with money.
	_, w := do(t, owner, "POST", base+"/widgets", `{"kind":"verified"}`, csrf, "1")
	res, err := http.Get(g.srv.URL + "/w/" + w["id"].(string))
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(res.Body)
	res.Body.Close()
	page := string(b)
	if res.StatusCode != http.StatusOK || !strings.Contains(page, "Verified by trckable") || !strings.Contains(page, `href="https://trckable.com/?ref=verified`) || strings.Contains(page, "Stripe") {
		t.Fatalf("badge: %d %s", res.StatusCode, page)
	}

	// The check goes stale: the source stops counting and the badge goes quiet.
	g.clock.Store(site.Add(10 * 24 * time.Hour).UnixMilli())
	_, one = do(t, owner, "GET", base+"/verified", "")
	if n, _ := count(one); n != 1 {
		t.Fatalf("after ten days only the provider (whose last event is older than a day but within 30) counts: %v", one)
	}
	g.clock.Store(site.Add(40 * 24 * time.Hour).UnixMilli())
	_, one = do(t, owner, "GET", base+"/verified", "")
	if n, _ := count(one); n != 0 {
		t.Fatalf("after forty days nothing counts: %v", one)
	}
	res, _ = http.Get(g.srv.URL + "/w/" + w["id"].(string))
	b, _ = io.ReadAll(res.Body)
	res.Body.Close()
	if strings.Contains(string(b), "Verified by trckable") {
		t.Fatalf("a badge with nothing verified shows nothing: %s", b)
	}
}

// The badge leads to trckable.com unless the owner chose an open link, and
// falls back the moment that link stops being open.
func TestBadgeLinkFallsBack(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	ctx := context.Background()
	now := g.api.Now()
	c, err := g.rev.Connect(ctx, revenue.ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	_, _ = g.ctl.DB.ExecContext(ctx, `UPDATE pay_connections SET last_event_at = ? WHERE id = ?`, now.Add(-time.Hour).Unix(), c.ID)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	const home = `href="https://trckable.com/?ref=verified`

	mk := func(body string) (id, url string) {
		_, out := do(t, owner, "POST", base+"/shares", body, csrf, "1")
		return out["share"].(map[string]any)["id"].(string), out["url"].(string)
	}
	openID, openURL := mk(`{"name":"open"}`)
	passID, _ := mk(`{"name":"pw","password":"open sesame please"}`)
	expID, _ := mk(`{"name":"exp","days":1}`)
	revID, _ := mk(`{"name":"rev","revenue":true}`)
	goneID, _ := mk(`{"name":"gone"}`)
	_, _ = g.ctl.DB.ExecContext(ctx, `UPDATE site_shares SET expires_at = ? WHERE id = ?`, now.Add(-time.Hour).Unix(), expID)

	badge := func(link string) string {
		shows := "[]"
		if link != "" {
			shows = `["link:` + link + `"]`
		}
		code, w := do(t, owner, "POST", base+"/widgets", `{"kind":"verified","on":true,"shows":`+shows+`}`, csrf, "1")
		if code != http.StatusCreated {
			t.Fatalf("create with %q: %d %v", link, code, w)
		}
		do(t, owner, "PUT", base+"/widgets/"+w["id"].(string), `{"kind":"verified","on":true,"shows":`+shows+`}`, csrf, "1")
		res, err := http.Get(g.srv.URL + "/w/" + w["id"].(string))
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		do(t, owner, "DELETE", base+"/widgets/"+w["id"].(string), "", csrf, "1")
		return string(b)
	}
	if p := badge(""); !strings.Contains(p, home) {
		t.Fatalf("no choice: trckable.com: %s", p)
	}
	if p := badge(openID); !strings.Contains(p, `href="`+openURL+`"`) {
		t.Fatalf("the chosen open link is used: %s", p)
	}
	for name, id := range map[string]string{"password": passID, "expired": expID, "revenue": revID} {
		if p := badge(id); !strings.Contains(p, home) || strings.Contains(p, "/s/") {
			t.Fatalf("a %s link falls back: %s", name, p)
		}
	}
	if code, _ := do(t, owner, "DELETE", base+"/shares/"+goneID, "", csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("delete link: %d", code)
	}
	if p := badge(goneID); !strings.Contains(p, home) {
		t.Fatalf("a deleted link falls back: %s", p)
	}
	// The open link gets a password later: the badge stops following it.
	code, w := do(t, owner, "POST", base+"/widgets", `{"kind":"verified","on":true,"shows":["link:`+openID+`"]}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatal(code)
	}
	do(t, owner, "PUT", base+"/widgets/"+w["id"].(string), `{"kind":"verified","on":true,"shows":["link:`+openID+`"]}`, csrf, "1")
	_, _ = g.ctl.DB.ExecContext(ctx, `UPDATE site_shares SET pass_hash = 'x' WHERE id = ?`, openID)
	res, _ := http.Get(g.srv.URL + "/w/" + w["id"].(string))
	b, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if !strings.Contains(string(b), home) {
		t.Fatalf("a link that later gets a password falls back: %s", b)
	}
}
