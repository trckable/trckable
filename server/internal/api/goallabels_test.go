package api

import (
	"context"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// A goal is counted under its key and shown as it was written: in the report,
// the funnel and the export.
func TestGoalsCarryTheirNameAsWritten(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	now := g.advance(time.Second)
	for i, goal := range []string{"start-free", "start-free", "këtu"} {
		v := uint64(i + 1)
		g.event(t, event.Event{Kind: event.KindPageview, EventID: v * 10, TS: now.Add(-time.Hour).UnixMilli(), Visitor: v, Pageview: v * 10, Path: "/"})
		g.event(t, event.Event{Kind: event.KindGoal, EventID: v*10 + 1, TS: now.Add(-time.Hour + time.Second).UnixMilli(), Visitor: v, Goal: goal})
	}
	g.waitApplied(t, 6)
	g.api.Ctl.NoteGoalLabel(context.Background(), g.site, "start-free", "Start free")
	g.api.Ctl.NoteGoalLabel(context.Background(), g.site, "këtu", "Këtu")

	base := g.srv.URL + "/api/v1/sites/" + g.site
	for _, m := range []string{"goals", "funnels"} {
		do(t, c, "PUT", base+"/modules/"+m, `{"enabled":true}`, csrf, "1")
	}
	code, out := do(t, c, "GET", base+"/report", "")
	if code != 200 {
		t.Fatalf("report: %d %v", code, out)
	}
	goals, _ := out["current"].(map[string]any)["goals"].([]any)
	if len(goals) != 2 {
		t.Fatalf("goals %v", goals)
	}
	first := goals[0].(map[string]any)
	if first["value"] != "start-free" || first["label"] != "Start free" {
		t.Fatalf("first goal %v", first)
	}
	if goals[1].(map[string]any)["label"] != "Këtu" {
		t.Fatalf("second goal %v", goals[1])
	}

	steps := `[{"kind":"page","value":"/"},{"kind":"goal","value":"start-free"}]`
	code, out = do(t, c, "GET", base+"/report/funnel?steps="+url.QueryEscape(steps), "")
	if code != 200 {
		t.Fatalf("funnel: %d %v", code, out)
	}
	fs := out["steps"].([]any)
	if _, ok := fs[0].(map[string]any)["label"]; ok || fs[1].(map[string]any)["label"] != "Start free" {
		t.Fatalf("funnel %v", fs)
	}

	res, err := c.Get(base + "/export.csv")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var sb strings.Builder
	buf := make([]byte, 4096)
	for {
		n, err := res.Body.Read(buf)
		sb.Write(buf[:n])
		if err != nil {
			break
		}
	}
	if !strings.Contains(sb.String(), "goal,Start free,") || strings.Contains(sb.String(), "goal,start-free,") {
		t.Fatalf("csv: %s", sb.String())
	}
}
