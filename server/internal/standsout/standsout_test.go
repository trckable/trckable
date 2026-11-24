package standsout

import (
	"testing"
	"time"
)

func fill(n int, v int64) []int64 {
	out := make([]int64, n)
	for i := range out {
		out[i] = v
	}
	return out
}

func TestFirstTimeEver(t *testing.T) {
	v := Judge(In{Count: 1, Days: 1, History: fill(Window, 0), Known: true})
	if !v.Out || v.Why != First {
		t.Fatalf("a goal never reached before stands out as the first time: %+v", v)
	}
}

func TestFirstTimeNeedsASiteWithAPast(t *testing.T) {
	v := Judge(In{Count: 2, Days: 1, History: fill(Window, 0)})
	if v.Out {
		t.Fatalf("on a site's first day nothing is a first time: %+v", v)
	}
}

func TestThreeTimesAUsualDay(t *testing.T) {
	h := fill(Window, 2)
	if v := Judge(In{Count: 6, Days: 1, History: h, Seen: true, Known: true}); !v.Out || v.Why != Times || v.Factor != 3 || v.Usual != 2 {
		t.Fatalf("6 against a usual 2 stands out 3x: %+v", v)
	}
	if v := Judge(In{Count: 5, Days: 1, History: h, Seen: true, Known: true}); v.Out {
		t.Fatalf("5 against a usual 2 is as usual: %+v", v)
	}
}

func TestAsUsual(t *testing.T) {
	v := Judge(In{Count: 4, Days: 1, History: fill(Window, 5), Seen: true, Known: true})
	if v.Out || v.Why != None {
		t.Fatalf("a usual day is not told: %+v", v)
	}
}

func TestLowVolumeNeedsThreeReaches(t *testing.T) {
	// Reached on two days of the window, once each: a usual day is 1, so 2 is nothing and 3 is something.
	h := fill(Window, 0)
	h[3], h[20] = 1, 1
	if v := Judge(In{Count: 2, Days: 1, History: h, Seen: true, Known: true}); v.Out {
		t.Fatalf("2 reaches of a goal that is rare is not told: %+v", v)
	}
	if v := Judge(In{Count: 3, Days: 1, History: h, Seen: true, Known: true}); !v.Out || v.Factor != 3 {
		t.Fatalf("3 reaches is: %+v", v)
	}
	// Seen long ago, nothing in the window: the same floor.
	if v := Judge(In{Count: 1, Days: 1, History: fill(Window, 0), Seen: true, Known: true}); v.Out {
		t.Fatalf("one reach of a goal last seen long ago is not told: %+v", v)
	}
}

func TestNothingReachedNothingTold(t *testing.T) {
	if v := Judge(In{Count: 0, Days: 7, History: fill(Window, 1), Seen: true, Known: true}); v.Out {
		t.Fatalf("%+v", v)
	}
}

func TestPeriodOfDaysScalesTheUsual(t *testing.T) {
	h := fill(Window, 2)
	if v := Judge(In{Count: 20, Days: 7, History: h, Seen: true, Known: true}); v.Out {
		t.Fatalf("20 in a week against 2 a day is as usual: %+v", v)
	}
	if v := Judge(In{Count: 42, Days: 7, History: h, Seen: true, Known: true}); !v.Out || v.Factor != 3 {
		t.Fatalf("%+v", v)
	}
}

func TestUsualIsTheMedianOfDaysWithReaches(t *testing.T) {
	if u := Usual([]int64{0, 0, 1, 5, 9, 0}); u != 5 {
		t.Fatalf("median of 1,5,9 is 5, got %v", u)
	}
	if u := Usual([]int64{2, 4, 0}); u != 3 {
		t.Fatalf("median of 2,4 is 3, got %v", u)
	}
	if u := Usual(nil); u != 0 {
		t.Fatalf("no days, no usual: %v", u)
	}
}

func TestHistoryTakesTheWindowBeforeTheStart(t *testing.T) {
	start := time.Date(2026, 11, 24, 0, 0, 0, 0, time.UTC)
	h := History(map[string]int64{"2026-11-23": 7, "2026-10-27": 2, "2026-10-26": 9, "2026-11-24": 100}, start)
	if len(h) != Window || h[Window-1] != 7 || h[0] != 2 {
		t.Fatalf("%v", h)
	}
	for _, n := range h {
		if n == 9 || n == 100 {
			t.Fatalf("the day of the period and the day before the window are not history: %v", h)
		}
	}
}
