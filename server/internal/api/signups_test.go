package api

import (
	"context"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// The signup is the goal called one unless the owner picked another or said there is none; the report carries its
// people either way, and nothing when there is no signup.
func TestReportSignupGoal(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	g.clock.Store(time.Date(2026, 9, 21, 12, 0, 0, 0, time.UTC).UnixMilli())
	at := func(h, m int) int64 { return time.Date(2026, 9, 21, h, m, 0, 0, time.UTC).UnixMilli() }
	add := func(id uint64, e event.Event) { e.EventID = id; g.event(t, e) }
	add(1, event.Event{Kind: event.KindPageview, TS: at(9, 0), Visitor: 1, Path: "/"})
	add(2, event.Event{Kind: event.KindGoal, TS: at(9, 1), Visitor: 1, Goal: "sign-up", Path: "/"})
	add(3, event.Event{Kind: event.KindPageview, TS: at(10, 0), Visitor: 2, Path: "/"})
	add(4, event.Event{Kind: event.KindGoal, TS: at(10, 1), Visitor: 2, Goal: "start-free", Path: "/"})
	add(5, event.Event{Kind: event.KindPageview, TS: at(11, 0), Visitor: 3, Path: "/"})
	g.waitApplied(t, 5)
	ctx := context.Background()
	g.ctl.NoteGoalLabel(ctx, g.site, "sign-up", "Sign up")
	g.ctl.NoteGoalLabel(ctx, g.site, "start-free", "Start free")
	base := g.srv.URL + "/api/v1/sites/" + g.site
	signup := func() map[string]any {
		_, out := do(t, c, "GET", base+"/report?from=2026-09-21&to=2026-09-21", "")
		cur, _ := out["current"].(map[string]any)
		s, _ := cur["signup"].(map[string]any)
		return s
	}
	if s := signup(); s == nil || s["goal"] != "sign-up" || s["visitors"] != float64(1) {
		t.Fatalf("auto signup = %v, want sign-up with 1", s)
	}
	if _, out := do(t, c, "GET", base+"/now", ""); out["signup"] != "sign-up" {
		t.Fatalf("/now signup = %v, want sign-up", out["signup"])
	}
	do(t, c, "PUT", base+"/config", `{"signup_goal":"start-free"}`, csrf, "1")
	if s := signup(); s == nil || s["goal"] != "start-free" || s["visitors"] != float64(1) {
		t.Fatalf("chosen signup = %v, want start-free with 1", s)
	}
	do(t, c, "PUT", base+"/config", `{"signup_goal":"!none"}`, csrf, "1")
	if s := signup(); s != nil {
		t.Fatalf("signup with None chosen = %v, want none", s)
	}
	do(t, c, "PUT", base+"/config", `{}`, csrf, "1")
	if s := signup(); s == nil || s["goal"] != "sign-up" {
		t.Fatalf("signup after clearing the choice = %v, want the automatic one", s)
	}
}
