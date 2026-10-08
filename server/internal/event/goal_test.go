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
	}
	for _, c := range cases {
		if got := NormGoal(c.in); got != c.want {
			t.Errorf("NormGoal(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
