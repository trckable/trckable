package api

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func postForm(t *testing.T, c *http.Client, url, body string) (int, string) {
	t.Helper()
	req, _ := http.NewRequest("POST", url, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res.StatusCode, string(b)
}

// Schedules are an owner's: made, changed and removed with words for what is
// wrong, a few to a site and a few people to each.
func TestReportSchedulesAreAnOwnersToManage(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/report-schedules"

	code, out := do(t, c, "GET", base, "")
	if code != 200 || len(out["schedules"].([]any)) != 0 || out["ready"] != false || len(out["langs"].([]any)) != 6 {
		t.Fatalf("empty list: %d %v", code, out)
	}
	good := `{"name":"Acme","cadence":"monthly","lang":"nl","pdf":true,"recipients":["Client@Example.com","two@example.com"]}`
	code, sc := do(t, c, "POST", base, good, csrf, "1")
	if code != 200 || sc["cadence"] != "monthly" || sc["lang"] != "nl" || sc["enabled"] != true || sc["recipients"].([]any)[0] != "client@example.com" {
		t.Fatalf("create: %d %v", code, sc)
	}
	id := sc["id"].(string)
	for body, want := range map[string]string{
		`{"cadence":"daily","lang":"en"}`:                                           "weekly or monthly",
		`{"cadence":"weekly","lang":"xx"}`:                                          "language",
		`{"cadence":"weekly","lang":"en","recipients":["not an address"]}`:          "not an email address",
		`{"cadence":"weekly","lang":"en","recipients":["a@b.com\r\nBcc: c@d.com"]}`: "not an email address",
	} {
		code, out := do(t, c, "POST", base, body, csrf, "1")
		if code != 400 || !strings.Contains(out["error"].(string), want) {
			t.Errorf("%s: %d %v", body, code, out)
		}
	}
	var eleven []string
	for i := range 11 {
		eleven = append(eleven, strings.Repeat("a", i+1)+"@example.com")
	}
	if code, out := do(t, c, "POST", base, `{"cadence":"weekly","lang":"en","recipients":["`+strings.Join(eleven, `","`)+`"]}`, csrf, "1"); code != 400 || !strings.Contains(out["error"].(string), "10 addresses") {
		t.Errorf("eleven addresses: %d %v", code, out)
	}

	// Change it, switch it off.
	code, sc = do(t, c, "PUT", base+"/"+id, `{"name":"Acme GmbH","cadence":"weekly","lang":"de","pdf":false,"recipients":["one@example.com"],"enabled":false}`, csrf, "1")
	if code != 200 || sc["name"] != "Acme GmbH" || sc["enabled"] != false || sc["pdf"] != false || len(sc["recipients"].([]any)) != 1 {
		t.Fatalf("update: %d %v", code, sc)
	}
	if code, _ := do(t, c, "PUT", base+"/rep_nope", good, csrf, "1"); code != 404 {
		t.Errorf("a schedule that is not there: %d", code)
	}

	// Four more fill the site; a sixth is refused.
	for range sqlite.MaxSchedulesPerSite - 1 {
		if code, _ := do(t, c, "POST", base, good, csrf, "1"); code != 200 {
			t.Fatalf("fill: %d", code)
		}
	}
	if code, out := do(t, c, "POST", base, good, csrf, "1"); code != 400 || !strings.Contains(out["error"].(string), "at most") {
		t.Errorf("a sixth schedule: %d %v", code, out)
	}

	// A viewer neither reads nor changes any of it.
	if _, err := g.ctl.AddUser(context.Background(), sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	v := client()
	do(t, v, "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@site.com","password":"correct horse battery V"}`)
	if code, _ := do(t, v, "GET", base, ""); code != http.StatusForbidden {
		t.Errorf("a viewer read the schedules: %d", code)
	}
	if code, _ := do(t, v, "DELETE", base+"/"+id, "", csrf, "1"); code != http.StatusForbidden {
		t.Errorf("a viewer deleted one: %d", code)
	}
	if code, _ := do(t, c, "DELETE", base+"/"+id, "", csrf, "1"); code != http.StatusNoContent {
		t.Errorf("delete: %d", code)
	}
	if code, _ := do(t, c, "DELETE", base+"/"+id, "", csrf, "1"); code != 404 {
		t.Errorf("delete again: %d", code)
	}
}

// A test report goes to the person who asked, only where reports can be sent,
// three times a day.
func TestReportTestSendGoesToTheOwnerAndIsLimited(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/report-schedules"
	_, sc := do(t, c, "POST", base, `{"cadence":"weekly","lang":"fr","recipients":["client@example.com"]}`, csrf, "1")
	id := sc["id"].(string)

	if code, _ := do(t, c, "POST", base+"/"+id+"/test", "", csrf, "1"); code != http.StatusConflict {
		t.Errorf("without mail and an address: %d", code)
	}
	var sentTo []string
	g.api.ReportsReady = func() bool { return true }
	g.api.SendReport = func(_ context.Context, s sqlite.ReportSchedule, email string) error {
		if s.Lang != "fr" {
			t.Errorf("the schedule sent: %+v", s)
		}
		sentTo = append(sentTo, email)
		return nil
	}
	for range reportsPerDay {
		if code, out := do(t, c, "POST", base+"/"+id+"/test", "", csrf, "1"); code != 200 || out["sent_to"] != "me@site.com" {
			t.Fatalf("test send: %d %v", code, out)
		}
	}
	if code, _ := do(t, c, "POST", base+"/"+id+"/test", "", csrf, "1"); code != http.StatusTooManyRequests {
		t.Errorf("a fourth in a day: %d", code)
	}
	if len(sentTo) != 3 || sentTo[0] != "me@site.com" {
		t.Errorf("sent to %v", sentTo)
	}
	if code, _ := do(t, c, "POST", base+"/rep_nope/test", "", csrf, "1"); code != 404 {
		t.Errorf("a missing schedule: %d", code)
	}
	if _, out := do(t, c, "GET", base, ""); out["ready"] != true {
		t.Errorf("ready: %v", out)
	}
}

// The link in a report removes one address from one schedule, asks before it
// does, speaks the schedule's language and works without signing in.
func TestReportStopLink(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	c := client()
	g.setup(t, c)
	sc, err := g.ctl.SaveReportSchedule(ctx, sqlite.ReportSchedule{SiteID: g.site, Cadence: "weekly", Lang: "de", Enabled: true, Recipients: []string{"a@example.com", "b@example.com", "c@example.com"}})
	if err != nil {
		t.Fatal(err)
	}
	key := g.api.Box.Derive(alerts.ReportKeyLabel)
	link := func(email string) string { return g.srv.URL + "/r/" + alerts.ReportToken(key, sc.ID, email) }
	recipients := func() []string { s, _ := g.ctl.ReportScheduleByID(ctx, sc.ID); return s.Recipients }
	anon := client()

	// Opening it changes nothing.
	res, err := anon.Get(link("a@example.com"))
	if err != nil {
		t.Fatal(err)
	}
	page, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 || !strings.Contains(string(page), "Bericht abbestellen") || !strings.Contains(string(page), "a@example.com") || !strings.Contains(string(page), "<form method=\"post\">") {
		t.Fatalf("the page: %d %s", res.StatusCode, page)
	}
	if res.Header.Get("Referrer-Policy") != "no-referrer" || !strings.Contains(res.Header.Get("Content-Security-Policy"), "default-src 'none'") {
		t.Errorf("headers: %v", res.Header)
	}
	if len(recipients()) != 3 {
		t.Fatal("opening the link changed the list")
	}

	// The button removes that address and no other.
	if code, body := postForm(t, anon, link("a@example.com"), ""); code != 200 || !strings.Contains(body, "nicht mehr an a@example.com gesendet") {
		t.Fatalf("stop: %d %s", code, body)
	}
	if got := recipients(); len(got) != 2 || got[0] != "b@example.com" {
		t.Errorf("recipients: %v", got)
	}
	// A mail client's one-click unsubscribe says nothing and does the same.
	if code, body := postForm(t, anon, link("b@example.com"), "List-Unsubscribe=One-Click"); code != 200 || body != "" {
		t.Errorf("one click: %d %q", code, body)
	}
	if got := recipients(); len(got) != 1 || got[0] != "c@example.com" {
		t.Errorf("recipients: %v", got)
	}
	// Again is fine; an address that was never there is fine too.
	if code, _ := postForm(t, anon, link("b@example.com"), ""); code != 200 {
		t.Errorf("again: %d", code)
	}

	// A made-up, damaged or another server's link opens nothing.
	other := alerts.ReportToken([]byte("another key"), sc.ID, "c@example.com")
	for _, tok := range []string{"nonsense", other, alerts.ReportToken(key, "rep_nope", "c@example.com"), alerts.UnsubscribeToken(key, "alert_x")} {
		for _, get := range []bool{true, false} {
			var code int
			if get {
				r, _ := anon.Get(g.srv.URL + "/r/" + tok)
				code = r.StatusCode
				r.Body.Close()
			} else {
				code, _ = postForm(t, anon, g.srv.URL+"/r/"+tok, "")
			}
			if code != http.StatusNotFound {
				t.Errorf("%.20s (get=%v): %d", tok, get, code)
			}
		}
	}
	if len(recipients()) != 1 {
		t.Error("a bad link changed the list")
	}
}
