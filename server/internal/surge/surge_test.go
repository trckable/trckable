package surge

import (
	"testing"
	"time"
)

func TestStartsNeedsTwiceTheUsualAndTenPeople(t *testing.T) {
	cases := []struct {
		online int64
		usual  float64
		weeks  int
		want   bool
		why    string
	}{
		{53, 20, 4, true, "the card's own example"},
		{40, 20, 4, true, "exactly twice"},
		{39, 20, 4, false, "just under twice"},
		{4, 2, 4, false, "small site: 2 becoming 4"},
		{9, 1, 4, false, "nine is under the floor"},
		{10, 0, 4, true, "nobody usually, ten now"},
		{30, 5, 1, false, "a site with one week of history has no usual"},
	}
	for _, c := range cases {
		if got := Starts(c.online, c.usual, c.weeks); got != c.want {
			t.Errorf("%s: Starts(%d, %v, %d) = %v", c.why, c.online, c.usual, c.weeks, got)
		}
	}
}

func TestHoldsUntilUnderOneAndAHalf(t *testing.T) {
	if !Holds(30, 20) {
		t.Error("1.5x is still a surge")
	}
	if Holds(29, 20) {
		t.Error("under 1.5x is over")
	}
}

func TestBookEndsAtOneAndAHalfAndWaitsThreeHours(t *testing.T) {
	var b Book
	at := time.Date(2026, 10, 6, 18, 40, 0, 0, time.UTC)
	step := func(d time.Duration, online int64) (Act, *Surge) {
		return b.Step("s", at.Add(d), Reading{Online: online, Usual: 20, Weeks: 4})
	}
	if act, _ := step(0, 19); act != None {
		t.Fatal("a normal evening is not a surge")
	}
	act, s := step(time.Minute, 53)
	if act != Start || s.Online != 53 || s.Usual != 20 {
		t.Fatalf("start: %v %+v", act, s)
	}
	if act, s = step(2*time.Minute, 61); act != Keep || s.Online != 61 {
		t.Fatalf("a bigger moment is the peak: %v %+v", act, s)
	}
	if act, s = step(3*time.Minute, 35); act != Keep || s.Online != 61 {
		t.Fatalf("1.75x goes on and keeps its peak: %v %+v", act, s)
	}
	if act, s = step(20*time.Minute, 29); act != End || s.Ended == 0 || s.Online != 61 {
		t.Fatalf("end: %v %+v", act, s)
	}
	// Busy again within three hours: no second surge.
	if act, _ = step(40*time.Minute, 70); act != None {
		t.Fatalf("debounce: %v", act)
	}
	if act, _ = step(3*time.Hour+2*time.Minute, 70); act != Start {
		t.Fatalf("three hours later it may start again: %v", act)
	}
}

func TestBookSeededFromBeforeARestart(t *testing.T) {
	var b Book
	now := time.Date(2026, 10, 6, 19, 0, 0, 0, time.UTC)
	b.Seed("s", &Surge{ID: "sg_1", Started: now.Add(-30 * time.Minute).Unix(), Online: 50})
	if act, s := b.Step("s", now, Reading{Online: 45, Usual: 20, Weeks: 4}); act != Keep || s.ID != "sg_1" {
		t.Fatalf("a surge that never ended goes on: %v %+v", act, s)
	}
	// One that ended an hour ago still counts for the cooldown.
	var c Book
	c.Seed("s", &Surge{ID: "sg_0", Started: now.Add(-90 * time.Minute).Unix(), Ended: now.Add(-60 * time.Minute).Unix(), Online: 50})
	if act, _ := c.Step("s", now, Reading{Online: 60, Usual: 20, Weeks: 4}); act != None {
		t.Fatalf("cooldown after a restart: %v", act)
	}
}

func TestRecentReusesALookUnderThirtySeconds(t *testing.T) {
	var b Book
	now := time.Now()
	if _, ok := b.Recent("s", now); ok {
		t.Fatal("nothing seen yet")
	}
	b.Step("s", now, Reading{Online: 3, Usual: 20, Weeks: 4})
	if _, ok := b.Recent("s", now.Add(10*time.Second)); !ok {
		t.Fatal("a look 10 seconds ago is fresh")
	}
	if _, ok := b.Recent("s", now.Add(Fresh)); ok {
		t.Fatal("a look 30 seconds ago is stale")
	}
}
