package api

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/surge"
)

type feedRow = map[string]any

func feedOf(t *testing.T, g *rig, c *http.Client) []feedRow {
	t.Helper()
	code, out := do(t, c, "GET", g.srv.URL+"/api/v1/me/notifications", "")
	if code != http.StatusOK {
		t.Fatalf("notifications: %d %v", code, out)
	}
	var rows []feedRow
	for _, r := range out["notifications"].([]any) {
		rows = append(rows, r.(map[string]any))
	}
	return rows
}

func rowByID(rows []feedRow, id string) feedRow {
	for _, r := range rows {
		if r["id"] == id {
			return r
		}
	}
	return nil
}

// The bell's list holds each source at its true time, under ids that do not change when the thing does.
func TestBellFeedSources(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	owner := client()
	g.setup(t, owner)
	now := g.now

	// A site that went down and came back up: one id for both.
	started := now.Add(-3 * time.Hour).Unix()
	if _, err := g.ctl.StartIncident(ctx, g.site, "down", started, "timeout"); err != nil {
		t.Fatal(err)
	}
	open, _ := g.ctl.OpenIncident(ctx, g.site)
	rows := feedOf(t, g, owner)
	down := rowByID(rows, "down:"+open.ID)
	if down == nil || down["kind"] != "down" || down["ended"] != nil || int64(down["at"].(float64)) != started {
		t.Fatalf("a down site: %v", down)
	}
	if err := g.ctl.EndIncident(ctx, open.ID, now.Add(-2*time.Hour).Unix(), nil); err != nil {
		t.Fatal(err)
	}
	g.api.bell = bellCache{}
	up := rowByID(feedOf(t, g, owner), "down:"+open.ID)
	if up == nil || up["ended"] == nil || int64(up["at"].(float64)) != started {
		t.Fatalf("back up keeps the id and the start: %v", up)
	}

	// A quiet spell is not a row.
	if _, err := g.ctl.StartIncident(ctx, g.site, "quiet", now.Add(-time.Hour).Unix(), ""); err != nil {
		t.Fatal(err)
	}

	// A daily milestone is told at its day, never at the hour the check found it.
	day := now.AddDate(0, 0, -2).Format(time.DateOnly)
	if _, err := g.ctl.AddMilestones(ctx, g.site, []sqlite.Milestone{{Kind: "visitors", Step: "100", Value: 100, Day: day}}); err != nil {
		t.Fatal(err)
	}

	// An alert that fired, at the minute it fired.
	al, err := g.ctl.SaveAlert(ctx, sqlite.Alert{SiteID: g.site, Kind: "customer", Enabled: true, Target: "me@site.com"})
	if err != nil {
		t.Fatal(err)
	}
	fired := now.Add(-90 * time.Minute).Unix()
	if err := g.ctl.MarkFired(ctx, al.ID, fired); err != nil {
		t.Fatal(err)
	}

	// A surge keeps the time it began; three goals in one hour are one row of three.
	if err := g.ctl.SaveSurge(ctx, surge.Surge{ID: "s1", Site: g.site, Started: now.Add(-5*time.Hour).Unix() + 17, Online: 40, Usual: 4}); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		g.event(t, event.Event{Kind: event.KindGoal, Goal: "newsletter", EventID: uint64(7000 + i), TS: now.Add(-4*time.Hour + time.Duration(i)*time.Minute).UnixMilli(), Visitor: uint64(900 + i), Path: "/"})
	}
	g.waitApplied(t, 3)

	g.api.bell = bellCache{}
	rows = feedOf(t, g, owner)
	m := rowByID(rows, "mile:"+g.site+":visitors:100")
	if m == nil || m["day"] != day {
		t.Fatalf("milestone: %v", m)
	}
	if want := time.Date(now.Year(), now.Month(), now.Day()-2, 0, 0, 0, 0, time.UTC).Unix(); int64(m["at"].(float64)) != want {
		t.Fatalf("a milestone is at its day: %v want %d", m["at"], want)
	}
	if a := rowByID(rows, "alert:1"); a == nil || a["what"] != "customer" || int64(a["at"].(float64)) != fired {
		t.Fatalf("alert: %v", a)
	}
	if s := rowByID(rows, "busy:surge:s1"); s == nil || int64(s["at"].(float64)) != now.Add(-5*time.Hour).Unix()+17 {
		t.Fatalf("surge: %v", s)
	}
	var goals feedRow
	for _, r := range rows {
		if r["kind"] == "goal" && strings.HasPrefix(r["id"].(string), "goal:"+g.site+":newsletter:") {
			goals = r
		}
	}
	if goals == nil || goals["count"] != 3.0 {
		t.Fatalf("three goals in an hour are one row: %v", goals)
	}
	for _, r := range rows {
		if r["kind"] == "down" && r["what"] == "quiet" {
			t.Fatalf("a quiet spell: %v", r)
		}
	}

	// The order is the time, newest first, then the id; a second read is the same list.
	for i := 1; i < len(rows); i++ {
		a, b := rows[i-1], rows[i]
		if a["at"].(float64) < b["at"].(float64) || (a["at"] == b["at"] && a["id"].(string) > b["id"].(string)) {
			t.Fatalf("order: %v before %v", a, b)
		}
	}
	g.api.bell = bellCache{}
	again := feedOf(t, g, owner)
	if len(again) != len(rows) {
		t.Fatalf("a second read: %d rows, was %d", len(again), len(rows))
	}
	for i := range rows {
		if again[i]["id"] != rows[i]["id"] {
			t.Fatalf("ids moved: %v vs %v", again[i]["id"], rows[i]["id"])
		}
	}
}

// A person sees only the sites they may read, and a key or a signed-out request sees none.
func TestBellFeedPermissions(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	owner := client()
	g.setup(t, owner)
	two, err := g.ctl.CreateSite(ctx, sqlite.DefaultAccount, "two.com", "")
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{g.site, two} {
		if _, err := g.ctl.StartIncident(ctx, id, "down", g.now.Add(-time.Hour).Unix(), "timeout"); err != nil {
			t.Fatal(err)
		}
	}
	viewer, err := g.ctl.AddUser(ctx, sqlite.DefaultAccount, "viewer@site.com", "correct horse battery A", sqlite.RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	if err := g.ctl.SetAccess(ctx, sqlite.DefaultAccount, viewer.ID, []string{two}); err != nil {
		t.Fatal(err)
	}
	if n := len(feedOf(t, g, owner)); n != 2 {
		t.Fatalf("the owner sees both sites: %d rows", n)
	}
	v := client()
	if code, out := do(t, v, "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@site.com","password":"correct horse battery A"}`); code != http.StatusOK {
		t.Fatalf("viewer signs in: %d %v", code, out)
	}
	rows := feedOf(t, g, v)
	if len(rows) != 1 || rows[0]["site"] != two {
		t.Fatalf("the viewer sees only their site: %v", rows)
	}
	if code, _ := do(t, client(), "GET", g.srv.URL+"/api/v1/me/notifications", ""); code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", code)
	}
	key, _, err := g.ctl.CreateAPIKey(ctx, sqlite.DefaultAccount, "k")
	if err != nil {
		t.Fatal(err)
	}
	if code, _, _ := getBearer(t, g.srv.URL+"/api/v1/me/notifications", key); code != http.StatusForbidden {
		t.Fatalf("a key: %d", code)
	}
}

func getBearer(t *testing.T, url, key string) (int, string, string) {
	t.Helper()
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", "Bearer "+key)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	return res.StatusCode, "", ""
}

// An hour of a site in another zone is told at its true moment, not at the same clock reading in UTC.
func TestBellFeedHourInTheSitesZone(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	owner := client()
	g.setup(t, owner)
	if err := g.ctl.UpdateSite(ctx, g.site, "site.com", "Asia/Kolkata", ""); err != nil {
		t.Fatal(err)
	}
	zone, _ := time.LoadLocation("Asia/Kolkata")
	at := g.now.Add(-4*time.Hour - 40*time.Minute)
	g.event(t, event.Event{Kind: event.KindGoal, Goal: "newsletter", EventID: 8001, TS: at.UnixMilli(), Visitor: 1, Path: "/"})
	g.waitApplied(t, 1)
	for _, r := range feedOf(t, g, owner) {
		if r["kind"] == "goal" {
			l := at.In(zone)
			if want := time.Date(l.Year(), l.Month(), l.Day(), l.Hour(), 0, 0, 0, zone).Unix(); int64(r["at"].(float64)) != want {
				t.Fatalf("the hour is %v, want %d", r["at"], want)
			}
			return
		}
	}
	t.Fatal("no goal row")
}
