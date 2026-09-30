package api

import (
	"testing"
	"time"
)

// A commit whose span runs from far back to a day more than the look-back
// later must drop the closed report around its latest point, and keep one
// that ended before its earliest.
func TestTouchedSpanReachesItsLatestPoint(t *testing.T) {
	c := newReportCache(100)
	day := func(y int, m time.Month, d int) (int64, int64) {
		f := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
		return f.UnixMilli(), f.AddDate(0, 0, 1).UnixMilli()
	}
	put := func(k string, from, to int64) {
		c.m[k] = cacheEntry{site: "s1", from: from, to: to, exp: time.Now().Add(time.Hour)}
	}
	bf, bt := day(2026, 4, 1)  // before the earliest point
	lf, lt := day(2026, 9, 22) // the latest point's day (over 90 days after the earliest)
	put("before", bf, bt)
	put("late", lf, lt)
	far := time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC).UnixMilli()
	last := time.Date(2026, 9, 22, 7, 10, 0, 0, time.UTC).UnixMilli()
	c.touched("s1", far, last)
	if _, ok := c.m["late"]; ok {
		t.Error("the report around the commit's latest point is still served")
	}
	if _, ok := c.m["before"]; !ok {
		t.Error("a report that ended before the commit's earliest point was dropped")
	}
}
