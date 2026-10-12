package event

import "testing"

func TestNormGoal(t *testing.T) {
	long := ""
	for range 65 {
		long += "a"
	}
	cases := []struct{ in, want string }{
		{"signup", "signup"},
		{"Sign up", "sign-up"},
		{"signup.done", "signup-done"},
		{"checkout/complete", "checkout-complete"},
		{"  Sign   up  now ", "sign-up-now"},
		{"a..b//c", "a-b-c"},
		{"cta:hero_click", "cta:hero_click"},
		{"-lead-", "lead"},
		{"", ""},
		{"...", ""},
		{long, ""},
		{long[:64], long[:64]},
		{"Të lumtur", "të-lumtur"},
		{"Größe bestellen", "größe-bestellen"},
		{"Начать", "начать"},
		{"Start free!", "start-free"},
	}
	for _, c := range cases {
		if got := NormGoal(c.in); got != c.want {
			t.Errorf("NormGoal(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestGoalLabel(t *testing.T) {
	long := ""
	for range 70 {
		long += "ë"
	}
	cases := []struct{ in, want string }{
		{"Start free", "Start free"},
		{"  Start \t free\n", "Start free"},
		{"Të lumtur", "Të lumtur"},
		{"Buy\x00 now\x07", "Buy now"},
		{"", ""},
		{"   ", ""},
		{long, long[:128]},
	}
	for _, c := range cases {
		if got := GoalLabel(c.in); got != c.want {
			t.Errorf("GoalLabel(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
