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

func kindsOK(list []verifiedSource) map[string]bool {
	out := map[string]bool{}
	for _, s := range list {
		out[s.Kind+"/"+s.Provider] = s.OK
	}
	return out
}

func TestSnippetCountsOnlyWhileSeenAndVisited(t *testing.T) {
	good := &sqlite.SiteCheck{At: ago(2 * time.Hour), Found: "site"}
	cases := []struct {
		name  string
		in    verifiedIn
		listd bool
		ok    bool
	}{
		{"found and a visit today", verifiedIn{Check: good, LastEvent: ago(time.Hour)}, true, true},
		{"found, no visit for two days", verifiedIn{Check: good, LastEvent: ago(48 * time.Hour)}, true, false},
		{"found, never a visit", verifiedIn{Check: good}, true, false},
		{"visits, never checked", verifiedIn{LastEvent: ago(time.Hour)}, true, false},
		{"another site's snippet", verifiedIn{Check: &sqlite.SiteCheck{At: ago(time.Hour), Found: "other"}, LastEvent: ago(time.Hour)}, true, false},
		{"the page could not be read", verifiedIn{Check: &sqlite.SiteCheck{At: ago(time.Hour), Error: "unreachable"}, LastEvent: ago(time.Hour)}, true, false},
		{"the check is older than three days", verifiedIn{Check: &sqlite.SiteCheck{At: ago(4 * 24 * time.Hour), Found: "site"}, LastEvent: ago(time.Hour)}, true, false},
		{"nothing at all", verifiedIn{}, false, false},
	}
	for _, c := range cases {
		c.in.Now = vNow
		got := verifiedSources(c.in)
		if (len(got) == 1) != c.listd {
			t.Fatalf("%s: listed %v, want %v", c.name, got, c.listd)
		}
		if c.listd && got[0].OK != c.ok {
			t.Fatalf("%s: ok %v, want %v (%s)", c.name, got[0].OK, c.ok, got[0].Detail)
		}
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

func TestPaymentsCountOnlyWhileTheProviderDelivers(t *testing.T) {
	conn := func(provider, mode string, event, sync *int64, errText string) revenue.Connection {
		return revenue.Connection{Provider: provider, Mode: mode, CreatedAt: ago(60 * 24 * time.Hour), LastEvent: event, LastSync: sync, LastError: errText}
	}
	got := kindsOK(verifiedSources(verifiedIn{Now: vNow, Pay: []revenue.Connection{
		conn("stripe", "live", ptr(ago(time.Hour)), nil, ""),
		conn("paddle", "live", nil, ptr(ago(10*24*time.Hour)), ""),
		conn("paypal", "live", ptr(ago(31*24*time.Hour)), nil, ""),
		conn("lemonsqueezy", "live", nil, ptr(ago(time.Hour)), "401: bad key"),
		conn("polar", "test", ptr(ago(time.Hour)), nil, ""),
		conn("custom", "live", ptr(ago(time.Hour)), nil, ""),
	}}))
	want := map[string]bool{"payments/stripe": true, "payments/paddle": true, "payments/paypal": false, "payments/lemonsqueezy": false}
	if len(got) != len(want) {
		t.Fatalf("manual, custom and test connections are not listed at all: %v", got)
	}
	for k, v := range want {
		if ok, here := got[k]; !here || ok != v {
			t.Fatalf("%s: %v, want %v (all: %v)", k, ok, v, got)
		}
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
	_, _ = g.ctl.DB.ExecContext(ctx, `UPDATE sites SET last_event_at = ? WHERE id = ?`, site.Add(-time.Hour).Unix(), g.site)
	if err := g.ctl.SetCheck(ctx, g.site, sqlite.SiteCheck{At: site.Add(-time.Hour).Unix(), Found: "site", Via: "page"}); err != nil {
		t.Fatal(err)
	}
	c, err := g.rev.Connect(ctx, revenue.ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := g.ctl.DB.ExecContext(ctx, `UPDATE pay_connections SET last_event_at = ? WHERE id = ?`, site.Add(-2*time.Hour).Unix(), c.ID); err != nil {
		t.Fatal(err)
	}
	base := g.srv.URL + "/api/v1/sites/" + g.site

	count := func(v any) (ok int, kinds string) {
		for _, s := range v.(map[string]any)["sources"].([]any) {
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
	if n, kinds := count(one); n != 2 || kinds != "snippet,payments," {
		t.Fatalf("snippet and Stripe: %d %s", n, kinds)
	}
	_, list := do(t, owner, "GET", g.srv.URL+"/api/v1/sites", "")
	row := list["sites"].([]any)[0].(map[string]any)
	if n, _ := count(row["verified"]); n != 2 {
		t.Fatalf("the sites list carries the same: %v", row["verified"])
	}

	// A link without money says nothing about money.
	_, made := do(t, owner, "POST", base+"/shares", `{"name":"x"}`, csrf, "1")
	url := made["url"].(string)
	anon := client()
	_, info := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`)
	if n, kinds := count(info["verified"]); n != 1 || kinds != "snippet," {
		t.Fatalf("a link that hides money hides the provider: %d %s", n, kinds)
	}
	_, made = do(t, owner, "POST", base+"/shares", `{"name":"y","revenue":true}`, csrf, "1")
	url = made["url"].(string)
	_, info = do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`)
	if n, _ := count(info["verified"]); n != 2 {
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
	if res.StatusCode != http.StatusOK || !strings.Contains(page, "Verified by trckable") || !strings.Contains(page, `href="`+made0(t, owner, base)+`"`) {
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

// made0 is the address of the open (no money, no password) link, as the
// badge writes it.
func made0(t *testing.T, owner *http.Client, base string) string {
	t.Helper()
	_, out := do(t, owner, "GET", base+"/shares", "")
	for _, s := range out["shares"].([]any) {
		m := s.(map[string]any)
		if m["name"] == "x" {
			return m["url"].(string)
		}
	}
	t.Fatal("no open link")
	return ""
}
