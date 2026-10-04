package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func TestUsualOfIsTheSameWeekdayOverFourWeeks(t *testing.T) {
	day := func(s string) time.Time { d, _ := time.Parse("2006-01-02", s); return d }
	by := map[string]int64{"2026-09-01": 10, "2026-09-08": 20, "2026-09-15": 30}
	yesterday := day("2026-09-22")
	// A past Tuesday: the Tuesdays before it, the ones the site had.
	if got := usualOf(by, day("2026-09-22"), yesterday); got != 20 {
		t.Errorf("usual of Sep 22 = %d, want 20", got)
	}
	// A Tuesday to come: the last four Tuesdays that have been.
	if got := usualOf(by, day("2026-09-29"), yesterday); got != 20 {
		t.Errorf("usual of Sep 29 = %d, want 20", got)
	}
	// The first Tuesday has no weeks before it.
	if got := usualOf(by, day("2026-09-01"), yesterday); got != 0 {
		t.Errorf("usual of Sep 1 = %d, want 0", got)
	}
}

// A month in one answer: days in the site's own timezone, the usual, the
// hours, revenue only where it may be seen, plans and who may add them.
func TestCalendarMonth(t *testing.T) {
	o := newGolden(t)
	g, c := o.g, o.c
	// Auckland is 12 hours ahead in September: now is Wed 23 Sep 08:00 there.
	if code, out := do(t, c, "PATCH", o.base, `{"timezone":"Pacific/Auckland"}`, csrf, "1"); code != http.StatusOK {
		t.Fatalf("timezone: %d %v", code, out)
	}
	g.clock.Store(time.Date(2026, 9, 22, 20, 0, 0, 0, time.UTC).UnixMilli())
	nz, _ := time.LoadLocation("Pacific/Auckland")
	at := func(d string, h, m int) time.Time {
		t0, _ := time.ParseInLocation("2006-01-02", d, nz)
		return t0.Add(time.Duration(h)*time.Hour + time.Duration(m)*time.Minute)
	}
	var v uint64
	for _, d := range []string{"2026-09-01", "2026-09-08", "2026-09-15"} { // Tuesdays: 20 each
		for i := 0; i < 20; i++ {
			v++
			o.visit(at(d, 12, i), v, "Search", "DE", "/", false)
		}
	}
	for i := 0; i < 60; i++ { // Tue 22: three times the usual; the first at 00:30 local, still the 22nd
		v++
		o.visit(at("2026-09-22", i%20, 30), v, "Social", "DE", "/docs", false)
	}
	o.sale("ord_1", at("2026-09-22", 16, 0), v, 5000)
	o.applied()

	base := o.base + "/calendar?month=2026-09"
	code, out := do(t, c, "GET", base, "")
	if code != http.StatusOK {
		t.Fatalf("calendar: %d %v", code, out)
	}
	days := out["days"].([]any)
	if len(days) != 30 || out["today"] != "2026-09-23" {
		t.Fatalf("%d days, today %v", len(days), out["today"])
	}
	day := func(n int) map[string]any { return days[n-1].(map[string]any) }
	if day(1)["visitors"] != 20.0 || day(21)["visitors"] != 0.0 {
		t.Errorf("Sep 1 %v, Sep 21 %v", day(1)["visitors"], day(21)["visitors"])
	}
	d22 := day(22)
	if d22["visitors"] != 60.0 || d22["usual"] != 20.0 || d22["source"] != "Social" || d22["page"] != "/docs" {
		t.Errorf("Sep 22: %v", d22)
	}
	hours := d22["hours"].([]any)
	if len(hours) != 24 || hours[0] != 3.0 {
		t.Errorf("the 22nd's hours (local midnight hour holds 3): %v", hours)
	}
	if d22["revenue"] != 5000.0 || d22["sales"] != 1.0 || out["currency"] != "USD" {
		t.Errorf("revenue: %v %v", d22, out["currency"])
	}
	// A day to come carries its usual and nothing else.
	if f := day(29); f["visitors"] != 0.0 || f["usual"] != 30.0 || f["hours"] != nil {
		t.Errorf("Sep 29: %v", f)
	}
	kinds := map[string]bool{}
	for _, m := range out["moments"].([]any) {
		mm := m.(map[string]any)
		kinds[mm["kind"].(string)] = true
		if mm["kind"] == "sale" && mm["t"] != "2026-09-22T16:00" {
			t.Errorf("the sale's hour: %v", mm)
		}
	}
	if !kinds["spike"] || !kinds["sale"] {
		t.Errorf("moments: %v", kinds)
	}
	if avg := out["weekday_avg"].([]any); avg[2] != 30.0 { // Tuesdays so far: 20, 20, 20, 60
		t.Errorf("Tuesday's average: %v", avg[2])
	}

	// Filters narrow the numbers and say the moments are the whole site's.
	_, f := do(t, c, "GET", base+"&f=channel:Search", "")
	if f["filtered"] != true || f["days"].([]any)[21].(map[string]any)["visitors"] != 0.0 {
		t.Errorf("filtered: %v", f["filtered"])
	}
	if code, _ := do(t, c, "GET", o.base+"/calendar?month=2026-13", ""); code != http.StatusBadRequest {
		t.Errorf("a bad month: %d", code)
	}

	// Plans: a day to come only, owners only, everyone signed in sees them.
	notes := o.base + "/annotations"
	if code, p := do(t, c, "POST", notes, `{"day":"2026-09-30","text":"Newsletter","planned":true}`, csrf, "1"); code != http.StatusCreated || p["planned"] != true {
		t.Fatalf("plan: %d %v", code, p)
	}
	if code, _ := do(t, c, "POST", notes, `{"day":"2026-09-01","text":"Too late","planned":true}`, csrf, "1"); code != http.StatusBadRequest {
		t.Errorf("a plan for a past day: %d", code)
	}
	if code, _ := do(t, c, "POST", notes, `{"day":"2026-09-01","text":"Launched"}`, csrf, "1"); code != http.StatusCreated {
		t.Errorf("a plain note for a past day: %d", code)
	}
	ctx := context.Background()
	if _, err := g.ctl.AddUser(ctx, sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	viewer := client()
	do(t, viewer, "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@site.com","password":"correct horse battery V"}`)
	if code, _ := do(t, viewer, "POST", notes, `{"day":"2026-09-30","text":"Mine","planned":true}`, csrf, "1"); code != http.StatusForbidden {
		t.Errorf("a viewer added a plan: %d", code)
	}
	_, seen := do(t, viewer, "GET", base, "")
	list := seen["notes"].([]any)
	if len(list) != 2 || list[1].(map[string]any)["planned"] != true {
		t.Errorf("a viewer sees plans and notes: %v", list)
	}
}

// A share link never carries money the link hides, nor notes it was not
// allowed, nor who wrote them.
func TestShareCalendarHidesWhatTheLinkHides(t *testing.T) {
	o := newGolden(t)
	g, c := o.g, o.c
	g.clock.Store(time.Date(2026, 9, 22, 20, 0, 0, 0, time.UTC).UnixMilli())
	o.visit(time.Date(2026, 9, 21, 10, 0, 0, 0, time.UTC), 7, "Search", "DE", "/", false)
	o.sale("ord_9", time.Date(2026, 9, 21, 11, 0, 0, 0, time.UTC), 7, 4200)
	o.applied()
	do(t, c, "POST", o.base+"/annotations", `{"day":"2026-09-25","text":"Webinar","planned":true}`, csrf, "1")

	open := func(body string) *http.Client {
		_, out := do(t, c, "POST", o.base+"/shares", body, csrf, "1")
		url := out["url"].(string)
		anon := client()
		do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`)
		return anon
	}
	cal := g.srv.URL + "/api/v1/share/calendar?month=2026-09"
	if code, _ := do(t, client(), "GET", cal, ""); code != http.StatusUnauthorized {
		t.Fatalf("no link, no calendar: %d", code)
	}
	plain := open(`{"name":"a"}`)
	code, out := do(t, plain, "GET", cal, "")
	if code != http.StatusOK {
		t.Fatalf("share calendar: %d %v", code, out)
	}
	for _, d := range out["days"].([]any) {
		if _, ok := d.(map[string]any)["revenue"]; ok {
			t.Fatalf("a link that hides revenue carried it: %v", d)
		}
	}
	if out["currency"] != nil || len(out["notes"].([]any)) != 0 {
		t.Errorf("money or notes leaked: %v %v", out["currency"], out["notes"])
	}
	_, withMoney := do(t, open(`{"name":"b","revenue":true,"notes":true}`), "GET", cal, "")
	if withMoney["days"].([]any)[20].(map[string]any)["revenue"] != 4200.0 {
		t.Errorf("a link that allows revenue lost it: %v", withMoney["days"].([]any)[20])
	}
	n := withMoney["notes"].([]any)
	if len(n) != 1 || n[0].(map[string]any)["planned"] != true || n[0].(map[string]any)["author"] != nil {
		t.Errorf("notes on a link: %v", n)
	}
	if b, _ := json.Marshal(withMoney); strings.Contains(string(b), "me@site.com") {
		t.Error("an author's address left the server")
	}
}
