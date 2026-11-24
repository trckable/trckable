package api

import (
	"context"
	"strconv"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// goalWeek puts a site's goals in the shape the rule is told about: "plan" is reached twice a day for ten days and seven
// times today, "usual" once a day and once today, "fresh" once today and never before.
func goalWeek(t *testing.T, g *rig) {
	t.Helper()
	id := uint64(9000)
	add := func(goal string, n int, at time.Time, host string) {
		for i := 0; i < n; i++ {
			id++
			g.event(t, event.Event{Kind: event.KindGoal, Goal: goal, EventID: id, TS: at.Add(time.Duration(i) * time.Minute).UnixMilli(), Visitor: id, Path: "/planner", RefHost: host, Country: "DE", Device: "mobile"})
		}
	}
	total := uint64(0)
	for d := 1; d <= 10; d++ {
		at := g.now.AddDate(0, 0, -d).Add(-3 * time.Hour)
		add("plan", 2, at, "google.com")
		add("usual", 1, at, "")
		total += 3
	}
	today := g.now.Add(-3 * time.Hour)
	add("plan", 7, today, "google.com")
	add("usual", 1, today.Add(time.Hour), "")
	add("fresh", 1, today.Add(90*time.Minute), "bing.com")
	g.waitApplied(t, total+9)
}

func goalOf(rows []any, goal string) map[string]any {
	for _, r := range rows {
		if m := r.(map[string]any); m["goal"] == goal {
			return m
		}
	}
	return nil
}

// The bell's goals card says which goals stand out and why, with the one rule: three times a usual day, or the first time ever.
func TestBellGoalsSayWhatStandsOut(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	goalWeek(t, g)
	var row feedRow
	for _, r := range feedOf(t, g, owner) {
		if r["kind"] == "goal" && r["id"].(string)[:len("goal:"+g.site+":2026-09-22")] == "goal:"+g.site+":2026-09-22" {
			row = r
		}
	}
	if row == nil {
		t.Fatal("no goals row for today")
	}
	list := row["goals"].([]any)
	plan, usual, fresh := goalOf(list, "plan"), goalOf(list, "usual"), goalOf(list, "fresh")
	if plan["out"] != true || plan["why"] != "times" || plan["factor"] != 3.0 || plan["usual"] != 2.0 {
		t.Fatalf("seven against a usual two stands out 3x: %v", plan)
	}
	if fresh["out"] != true || fresh["why"] != "first" {
		t.Fatalf("a goal never reached before stands out as the first time: %v", fresh)
	}
	if usual["out"] == true || usual["why"] != nil {
		t.Fatalf("a usual day is as usual: %v", usual)
	}
}

// "Only tell me when it stands out" takes the goal out of the card on a usual day, and only for the person who asked.
func TestBellGoalQuietHidesAsUsualOnly(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	goalWeek(t, g)
	put := func(goal string, quiet bool) {
		t.Helper()
		body := `{"site":"` + g.site + `","goal":"` + goal + `","quiet":` + strconv.FormatBool(quiet) + `}`
		if code, out := do(t, owner, "PUT", g.srv.URL+"/api/v1/me/goal-quiet", body, csrf, "1"); code != 200 {
			t.Fatalf("goal-quiet: %d %v", code, out)
		}
	}
	goals := func() []any {
		for _, r := range feedOf(t, g, owner) {
			if r["kind"] == "goal" {
				return r["goals"].([]any)
			}
		}
		return nil
	}
	if len(goals()) != 3 {
		t.Fatalf("three goals to begin with: %v", goals())
	}
	put("usual", true)
	put("plan", true)
	list := goals()
	if len(list) != 2 || goalOf(list, "usual") != nil {
		t.Fatalf("a goal kept quiet is left out on a usual day: %v", list)
	}
	if p := goalOf(list, "plan"); p == nil || p["quiet"] != true {
		t.Fatalf("a goal that stands out is told, and says it is kept quiet: %v", p)
	}
	put("usual", false)
	if len(goals()) != 3 {
		t.Fatalf("heard of again: %v", goals())
	}
	if code, _ := do(t, owner, "PUT", g.srv.URL+"/api/v1/me/goal-quiet", `{"site":"tkb_nope","goal":"x","quiet":true}`, csrf, "1"); code != 404 {
		t.Fatalf("a site that is not theirs: %d", code)
	}
}

// The goals list and a goal's page read the same rule as the bell.
func TestGoalListAndPage(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	goalWeek(t, g)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/report/"
	code, out := do(t, owner, "GET", base+"goals?from=2026-09-22&to=2026-09-22", "")
	if code != 200 {
		t.Fatalf("goals: %d %v", code, out)
	}
	list := out["goals"].([]any)
	if len(list) != 3 || out["reached"] != 9.0 || out["out"] != 2.0 {
		t.Fatalf("today's goals: %v", out)
	}
	if first := list[0].(map[string]any); first["out"] != true {
		t.Fatalf("the goals that stand out come first: %v", list)
	}
	if plan := goalOf(list, "plan"); plan["count"] != 7.0 || plan["why"] != "times" {
		t.Fatalf("%v", plan)
	}
	code, one := do(t, owner, "GET", base+"goal?goal=plan&from=2026-09-22&to=2026-09-22", "")
	if code != 200 {
		t.Fatalf("goal: %d %v", code, one)
	}
	events := one["events"].([]any)
	if len(events) != 7 {
		t.Fatalf("each time it happened: %v", events)
	}
	if e := events[0].(map[string]any); e["path"] != "/planner" || e["source"] != "google.com" || e["country"] != "DE" {
		t.Fatalf("an event says its page, source and place: %v", e)
	}
	if s := one["sources"].([]any); len(s) != 1 || s[0].(map[string]any)["source"] != "google.com" {
		t.Fatalf("mostly from: %v", s)
	}
	if s := one["paths"].([]any); len(s) != 1 || s[0].(map[string]any)["source"] != "/planner" || s[0].(map[string]any)["count"] != 7.0 {
		t.Fatalf("on page: %v", s)
	}
	// A week: seven days of the ten-day history are in it, the days before it are the usual.
	_, week := do(t, owner, "GET", base+"goals?from=2026-09-16&to=2026-09-22", "")
	if p := goalOf(week["goals"].([]any), "plan"); p["count"] != 19.0 || p["out"] == true {
		t.Fatalf("2 a day for six days and 7 today is a usual week: %v", p)
	}
	if code, _ := do(t, owner, "GET", base+"goal?goal=nothing&from=2026-09-22&to=2026-09-22", ""); code != 404 {
		t.Fatalf("a goal the site never had: %d", code)
	}
}

// The goals list obeys the filters Explore has on: only the visits that pass count.
func TestGoalListIsNarrowedByFilters(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	goalWeek(t, g)
	for i := 0; i < 4; i++ {
		g.event(t, event.Event{Kind: event.KindPageview, EventID: uint64(9400 + i), TS: g.now.Add(-2*time.Hour + time.Duration(i)*time.Minute).UnixMilli(), Visitor: uint64(9500 + i), Path: "/", Country: "AT", Device: "desktop"})
		g.event(t, event.Event{Kind: event.KindGoal, Goal: "plan", EventID: uint64(9500 + i), TS: g.now.Add(-2*time.Hour + time.Duration(i)*time.Minute).UnixMilli(), Visitor: uint64(9500 + i), Path: "/", Country: "AT", Device: "desktop"})
	}
	g.waitApplied(t, 39+8)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/report/"
	_, all := do(t, owner, "GET", base+"goals?from=2026-09-22&to=2026-09-22", "")
	if p := goalOf(all["goals"].([]any), "plan"); p["count"] != 11.0 {
		t.Fatalf("every visit: %v", p)
	}
	// Visits are rolled into sessions a moment after their events.
	var list []any
	for i := 0; i < 100 && len(list) == 0; i++ {
		_, at := do(t, owner, "GET", base+"goals?from=2026-09-22&to=2026-09-22&f=country:AT", "")
		list = at["goals"].([]any)
		time.Sleep(30 * time.Millisecond)
	}
	if p := goalOf(list, "plan"); p == nil || p["count"] != 4.0 || len(list) != 1 {
		t.Fatalf("only the visits from Austria: %v", list)
	}
	_, one := do(t, owner, "GET", base+"goal?goal=plan&from=2026-09-22&to=2026-09-22&f=country:AT", "")
	if ev := one["events"].([]any); len(ev) != 4 {
		t.Fatalf("each time, of those visits: %v", ev)
	}
}

// A page goal counts in the bell like any other goal: the same rule says when it stands out.
func TestBellPageGoalStandsOut(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	cfg, _ := g.ctl.SiteConfig(context.Background(), g.site)
	cfg.PageGoals = []sqlite.Group{{Name: "Saw planner", Path: "/planner"}}
	if err := g.ctl.SetSiteConfig(context.Background(), g.site, cfg); err != nil {
		t.Fatal(err)
	}
	id := uint64(9800)
	visit := func(at time.Time, n int) {
		for i := 0; i < n; i++ {
			id++
			g.event(t, event.Event{Kind: event.KindPageview, EventID: id, TS: at.Add(time.Duration(i) * time.Minute).UnixMilli(), Visitor: id, Path: "/planner"})
		}
	}
	for d := 1; d <= 10; d++ {
		visit(g.now.AddDate(0, 0, -d).Add(-3*time.Hour), 2)
	}
	visit(g.now.Add(-3*time.Hour), 8)
	g.waitApplied(t, 28)
	var plan map[string]any
	for _, r := range feedOf(t, g, owner) {
		if r["kind"] == "goal" && r["day"] == "2026-09-22" {
			plan = goalOf(r["goals"].([]any), "Saw planner")
		}
	}
	if plan == nil || plan["page"] != true || plan["count"] != 8.0 || plan["out"] != true || plan["why"] != "times" || plan["factor"] != 4.0 {
		t.Fatalf("a page goal is told in the card with the one rule: %v", plan)
	}
}
