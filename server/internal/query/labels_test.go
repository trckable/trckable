package query

import "testing"

func TestGoalNamesLabelACopy(t *testing.T) {
	names := GoalNames{"start-free": "Start free", "saw-pricing": "nope"}
	rows := []Row{{Value: "start-free", Visitors: 3}, {Value: "other", Visitors: 1}, {Value: "Saw pricing", Visitors: 2}}
	res := &Result{Goals: rows}
	got := names.Report(res, []Group{{Name: "Saw pricing", Path: "/pricing"}})
	if got.Goals[0].Label != "Start free" || got.Goals[0].Name() != "Start free" {
		t.Fatalf("labelled %+v", got.Goals[0])
	}
	if got.Goals[1].Name() != "other" || got.Goals[2].Name() != "Saw pricing" {
		t.Fatalf("fallbacks %+v", got.Goals)
	}
	if res.Goals[0].Label != "" {
		t.Fatal("the cached report was changed")
	}
	steps := names.Funnel([]FunnelStep{{Step: Step{Kind: "page", Value: "/"}}, {Step: Step{Kind: "goal", Value: "start-free"}}})
	if steps[0].Label != "" || steps[1].Label != "Start free" {
		t.Fatalf("funnel %+v", steps)
	}
	j := &Journey{Visits: []JourneyVisit{{Events: []JourneyEvent{{Kind: "goal", Goal: "start-free"}, {Kind: "pageview", Path: "/"}}}}}
	names.Journey(j)
	if j.Visits[0].Events[0].Label != "Start free" || j.Visits[0].Events[1].Label != "" {
		t.Fatalf("journey %+v", j)
	}
}
