package headcount

import "testing"

func TestOncePerDay(t *testing.T) {
	cases := []struct {
		cookieless bool
		days       int
		want       bool
	}{
		{true, 0, false},
		{true, 1, false},
		{true, 2, true},
		{true, 30, true},
		{false, 1, false},
		{false, 30, false},
	}
	for _, c := range cases {
		if got := OncePerDay(c.cookieless, c.days); got != c.want {
			t.Errorf("OncePerDay(%v, %d) = %v, want %v", c.cookieless, c.days, got, c.want)
		}
	}
}

func TestLast24HoursIsOneDay(t *testing.T) {
	if OncePerDay(true, 1) {
		t.Fatal("one day, however it is cut, has no note")
	}
}
