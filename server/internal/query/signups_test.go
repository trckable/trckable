package query

import (
	"context"
	"testing"
)

func TestSignupsCountThePeopleWhoReachedTheGoal(t *testing.T) { both(t, testSignups) }

func testSignups(t *testing.T, q Q) {
	p := sep10
	p.SignupGoal = "signup"
	r, err := q.Report(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	if r.Signup == nil {
		t.Fatal("no signup in the report")
	}
	eq(t, "signup goal", r.Signup.Goal, "signup")
	eq(t, "signups", r.Signup.Visitors, int64(1))
	signups := func(dim, v string) int64 {
		for _, row := range r.Dims[dim] {
			if row.Value == v {
				return row.Signups
			}
		}
		return -1
	}
	eq(t, "Search signups", signups("channel", "Search"), int64(1))
	eq(t, "AI signups", signups("channel", "AI"), int64(0))
	eq(t, "DE signups", signups("country", "DE"), int64(1))
	eq(t, "US signups", signups("country", "US"), int64(0))
	eq(t, "Desktop signups", signups("device", "Desktop"), int64(1))
	eq(t, "Mobile signups", signups("device", "Mobile"), int64(0))
}

func TestNoSignupGoalNoSignupFigure(t *testing.T) {
	q := golden(t, false)
	r, err := q.Report(context.Background(), sep10)
	if err != nil {
		t.Fatal(err)
	}
	if r.Signup != nil {
		t.Fatalf("signup = %+v, want none", r.Signup)
	}
	for _, row := range r.Dims["channel"] {
		eq(t, "signups of "+row.Value, row.Signups, int64(0))
	}
}

func TestSignupGoalThatNobodyReachedCountsZero(t *testing.T) {
	q := golden(t, false)
	p := sep10
	p.SignupGoal = "start-free"
	r, err := q.Report(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	if r.Signup == nil {
		t.Fatal("a chosen goal with no one reaching it still shows, at zero")
	}
	eq(t, "signups", r.Signup.Visitors, int64(0))
}

func TestAutoSignupFindsTheGoalCalledSignup(t *testing.T) {
	for _, c := range []struct {
		name   string
		labels map[string]string
		pages  []Group
		want   string
	}{
		{"sign-up key", map[string]string{"sign-up": "Sign up", "start-free": "Start free"}, nil, "sign-up"},
		{"snake case", map[string]string{"sign_up": "sign_up"}, nil, "sign_up"},
		{"one word", map[string]string{"signup": "signup"}, nil, "signup"},
		{"signed up by its name", map[string]string{"signed-up": "Signed up"}, nil, "signed-up"},
		{"by its label only", map[string]string{"g1": "Create account"}, nil, "g1"},
		{"registered", map[string]string{"registered": "Registered"}, nil, "registered"},
		{"start free is not a signup", map[string]string{"start-free": "Start free"}, nil, ""},
		{"a longer name is not", map[string]string{"signup-clicked": "Signup clicked"}, nil, ""},
		{"a page goal", nil, []Group{{Name: "Sign up", Path: "/welcome"}}, "Sign up"},
		{"custom wins over page", map[string]string{"signup": "Signup"}, []Group{{Name: "Register", Path: "/welcome"}}, "signup"},
		{"nothing", nil, nil, ""},
	} {
		t.Run(c.name, func(t *testing.T) {
			eq(t, "goal", AutoSignup(c.labels, c.pages), c.want)
		})
	}
}
