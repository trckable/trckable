package api

import (
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/alerts"
)

func withMail(t *testing.T) {
	t.Helper()
	old := alerts.Mail
	t.Cleanup(func() { alerts.Mail = old })
	m, err := alerts.ParseMailer("smtp://127.0.0.1:1", "trckable@example.com")
	if err != nil {
		t.Fatal(err)
	}
	alerts.Mail = m
}

func alertsFor(t *testing.T, g *rig, c *http.Client, site string) map[string]map[string]any {
	t.Helper()
	code, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+site+"/alerts", "")
	if code != http.StatusOK {
		t.Fatalf("alerts: %d", code)
	}
	got := map[string]map[string]any{}
	for _, a := range out["alerts"].([]any) {
		m := a.(map[string]any)
		got[m["kind"].(string)] = m
	}
	return got
}

func TestANewSiteStartsWithTheWeeklyEmailTrackingStoppedAndSurge(t *testing.T) {
	withMail(t)
	g := newRig(t)
	c := client()
	g.setup(t, c) // the site the server started with waits for its owner, and gets them now
	if got := alertsFor(t, g, c, g.site); len(got) != 3 || got["surge"]["enabled"] != true || got["weekly"]["enabled"] != true || got["stopped"]["target"] != "mailto:me@site.com" {
		t.Fatalf("the site that was there before the owner: %v", got)
	}
	code, out := do(t, c, "POST", g.srv.URL+"/api/v1/sites", `{"domain":"new.example.com"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("create: %d %v", code, out)
	}
	got := alertsFor(t, g, c, out["id"].(string))
	if len(got) != 3 || got["surge"]["enabled"] != true || got["weekly"]["enabled"] != true || got["stopped"]["enabled"] != true || got["weekly"]["target"] != "mailto:me@site.com" {
		t.Fatalf("a new site: %v", got)
	}
	// An existing site is not touched by a new one's defaults.
	if _, err := g.ctl.DB.Exec(`DELETE FROM alerts WHERE site_id = ?`, g.site); err != nil {
		t.Fatal(err)
	}
	if code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/sites", `{"domain":"other.example.com"}`, csrf, "1"); code != http.StatusCreated {
		t.Fatal(code)
	}
	if len(alertsFor(t, g, c, g.site)) != 0 {
		t.Fatal("creating a site changed another site's alerts")
	}
}

func TestANewSiteHasNoAlertsWhereNothingCanBeSent(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	_, out := do(t, c, "POST", g.srv.URL+"/api/v1/sites", `{"domain":"new.example.com"}`, csrf, "1")
	if got := alertsFor(t, g, c, out["id"].(string)); len(got) != 0 {
		t.Fatalf("alerts with nowhere to send them: %v", got)
	}
}

// post sends a form the way a browser, or a mail client's one-click, does.
func post(t *testing.T, u string, form url.Values) (int, string) {
	t.Helper()
	res, err := client().Post(u, "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res.StatusCode, string(b)
}

func TestTheStopLinkSwitchesOneAlertWithoutSigningIn(t *testing.T) {
	withMail(t)
	g := newRig(t)
	c := client()
	g.setup(t, c)
	got := alertsFor(t, g, c, g.site)
	weekly, stopped := got["weekly"]["id"].(string), got["stopped"]["id"].(string)
	key := g.api.Box.Derive(alerts.KeyLabel)
	link := g.srv.URL + "/u/" + alerts.UnsubscribeToken(key, weekly)

	// Opening it changes nothing (mail scanners open links) and shows the state.
	code, _, page := get(t, client(), link)
	if code != http.StatusOK || !strings.Contains(page, "The weekly email") || !strings.Contains(page, "site.com") {
		t.Fatalf("page: %d %s", code, page)
	}
	if alertsFor(t, g, c, g.site)["weekly"]["enabled"] != true {
		t.Fatal("opening the link switched the alert")
	}
	// One click, as a mail client sends it: that alert off, the other still on.
	if code, _ := post(t, link, url.Values{"List-Unsubscribe": {"One-Click"}}); code != http.StatusOK {
		t.Fatalf("one-click: %d", code)
	}
	after := alertsFor(t, g, c, g.site)
	if after["weekly"]["enabled"] != false || after["stopped"]["enabled"] != true {
		t.Fatalf("only that alert goes off: %v", after)
	}
	// The page's own button turns it back on.
	if code, body := post(t, link, url.Values{"action": {"on"}}); code != http.StatusOK || !strings.Contains(body, "Stop it") {
		t.Fatalf("back on: %d %s", code, body)
	}
	if alertsFor(t, g, c, g.site)["weekly"]["enabled"] != true {
		t.Fatal("not back on")
	}
	// A link for one alert cannot switch another, and a forged or foreign one does nothing.
	good := alerts.UnsubscribeToken(key, stopped)
	for _, bad := range []string{
		weekly + ".AAAAAAAAAAAAAAAAAAAAAA", alerts.UnsubscribeToken([]byte("another server, another key....."), stopped),
		stopped + strings.TrimPrefix(alerts.UnsubscribeToken(key, weekly), weekly), "alert_nope." + strings.SplitN(alerts.UnsubscribeToken(key, "alert_nope"), ".", 2)[1],
	} {
		if code, _ := post(t, g.srv.URL+"/u/"+bad, url.Values{"action": {"off"}}); code != http.StatusNotFound {
			t.Errorf("%s: %d, want 404", bad, code)
		}
	}
	if a := alertsFor(t, g, c, g.site); a["weekly"]["enabled"] != true || a["stopped"]["enabled"] != true {
		t.Fatalf("a bad link changed something: %v", a)
	}
	if code, _ := post(t, g.srv.URL+"/u/"+good, url.Values{"List-Unsubscribe": {"One-Click"}}); code != http.StatusOK {
		t.Fatal(code)
	}
	if a := alertsFor(t, g, c, g.site); a["stopped"]["enabled"] != false || a["weekly"]["enabled"] != true {
		t.Fatalf("each link names its own alert: %v", a)
	}
}
