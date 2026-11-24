package sqlite

import "testing"

func TestGoalQuiet(t *testing.T) {
	st, ctx, site := domainSite(t)
	u, err := st.CompleteSetup(ctx, "q@example.com", "correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if got, err := st.GoalQuiet(ctx, u.ID); err != nil || len(got) != 0 {
		t.Fatalf("a new person keeps none quiet: %v %v", got, err)
	}
	if err := st.SetGoalQuiet(ctx, u.ID, site, "signup", true); err != nil {
		t.Fatal(err)
	}
	if err := st.SetGoalQuiet(ctx, u.ID, site, "signup", true); err != nil {
		t.Fatalf("twice is once: %v", err)
	}
	got, _ := st.GoalQuiet(ctx, u.ID)
	if len(got) != 1 || !got[QuietKey(site, "signup")] {
		t.Fatalf("%v", got)
	}
	if err := st.SetGoalQuiet(ctx, u.ID, site, "signup", false); err != nil {
		t.Fatal(err)
	}
	if got, _ := st.GoalQuiet(ctx, u.ID); len(got) != 0 {
		t.Fatalf("heard of again: %v", got)
	}
	if err := st.SetGoalQuiet(ctx, u.ID, site, "", true); err != ErrGoalQuiet {
		t.Fatalf("an empty goal: %v", err)
	}
}
