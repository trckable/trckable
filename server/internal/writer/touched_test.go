package writer

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// One commit that stores events far apart, a late retry from earlier in a
// visit, and a visit that crosses midnight in the site's zone must report the
// whole span it touched: the earliest and the latest of every event and of the
// starts of the visits they joined, before and after.
func TestTouchedSpansTheWholeCommit(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	la, _ := time.LoadLocation("America/Los_Angeles")
	ms := func(tm time.Time) int64 { return tm.UnixMilli() }
	far := time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC)    // earliest: a long-ago point
	mid := far.AddDate(0, 0, 100)                          // more than the 90-day look-back later
	eve := time.Date(2026, 9, 21, 23, 50, 0, 0, la)        // a visit starting late evening in LA
	after := time.Date(2026, 9, 22, 0, 10, 0, 0, la)       // and going on after LA's midnight: the latest point
	retry := time.Date(2026, 8, 10, 12, 0, 0, 0, time.UTC) // a visit whose first retry lands late
	var id uint64
	add := func(visitor uint64, at time.Time) { id++; e.append(t, pv("s1", visitor, id, ms(at))) }
	add(1, mid)
	add(2, retry)
	add(2, retry.Add(-10*time.Minute)) // earlier in the same visit: moves its start back
	add(3, eve)
	add(3, after)
	add(4, far)
	add(5, retry.Add(time.Hour))                             // a second site's worth is not needed; another plain point in the middle
	e.append(t, pv("s2", 9, 1000, ms(after.Add(time.Hour)))) // another site: must not widen s1's span

	var mu sync.Mutex
	spans := map[string][][2]int64{}
	w := New(e.log, e.store, Options{FlushEvery: 20 * time.Millisecond}) // everything is already in the WAL: one replay batch
	w.OnTouch = func(site string, lo, hi int64) {
		mu.Lock()
		defer mu.Unlock()
		spans[site] = append(spans[site], [2]int64{lo, hi})
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Run(ctx) }()
	deadline := time.Now().Add(10 * time.Second)
	seen := func() bool { mu.Lock(); defer mu.Unlock(); return len(spans["s2"]) > 0 }
	for w.Applied() < id+1 || !seen() {
		if time.Now().After(deadline) {
			t.Fatalf("writer stuck at %d", w.Applied())
		}
		time.Sleep(5 * time.Millisecond)
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(spans["s1"]) != 1 {
		t.Fatalf("want one multi-point commit for s1, got %d: %v", len(spans["s1"]), spans["s1"])
	}
	// Together the spans must cover exactly [far, after].
	lo, hi := int64(1<<62), int64(-1<<62)
	for _, s := range spans["s1"] {
		lo, hi = min(lo, s[0]), max(hi, s[1])
	}
	if lo != ms(far) {
		t.Errorf("lowest touched %v, want %v", time.UnixMilli(lo).UTC(), far)
	}
	if hi != ms(after) {
		t.Errorf("highest touched %v, want %v (the visit crossing LA's midnight)", time.UnixMilli(hi).In(la), after)
	}
	// Every point must be inside one reported span (a commit may not report less than it stored).
	for _, p := range []time.Time{far, mid, retry, retry.Add(-10 * time.Minute), eve, after} {
		in := false
		for _, s := range spans["s1"] {
			if ms(p) >= s[0] && ms(p) <= s[1] {
				in = true
			}
		}
		if !in {
			t.Errorf("%v was stored but no reported span covers it: %v", p, spans["s1"])
		}
	}
	for _, s := range spans["s2"] {
		if s[0] != ms(after.Add(time.Hour)) || s[1] != s[0] {
			t.Errorf("site s2 span %v, want its single point", s)
		}
	}
}

// A session written out because it went idle, in a commit that stores no
// events, is still a change a cached report may have missed (a read taken
// between its close and the commit saw it in one place or the other): the
// commit reports the session's span.
func TestIdleCloseReportsTheSessionItWroteOut(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	T := time.Date(2026, 9, 20, 10, 0, 0, 0, time.UTC)
	var clock atomic.Int64
	clock.Store(T.Add(time.Minute).UnixMilli())
	e.append(t, pv("s1", 1, 1, T.UnixMilli()))

	var mu sync.Mutex
	var spans [][2]int64
	w := New(e.log, e.store, Options{FlushEvery: 20 * time.Millisecond, IdleClose: 20 * time.Millisecond})
	w.now = func() time.Time { return time.UnixMilli(clock.Load()).UTC() }
	w.OnTouch = func(site string, lo, hi int64) {
		if site != "s1" {
			return
		}
		mu.Lock()
		defer mu.Unlock()
		spans = append(spans, [2]int64{lo, hi})
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Run(ctx) }()
	wait := func(what string, ok func() bool) {
		t.Helper()
		for deadline := time.Now().Add(10 * time.Second); !ok(); time.Sleep(5 * time.Millisecond) {
			if time.Now().After(deadline) {
				t.Fatalf("stuck waiting for %s; spans %v", what, spans)
			}
		}
	}
	count := func() int { mu.Lock(); defer mu.Unlock(); return len(spans) }
	wait("the visit", func() bool { return w.Applied() >= 1 && count() >= 1 })

	// Past CloseAfter with no new event: the idle tick writes the session out.
	clock.Store(T.Add(3 * time.Hour).UnixMilli())
	wait("the idle close", func() bool { return count() >= 2 })
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	if got := spans[1]; got != [2]int64{T.UnixMilli(), T.UnixMilli()} {
		t.Errorf("idle close reported %v, want the session's span [%d %d]", got, T.UnixMilli(), T.UnixMilli())
	}
	if n := e.count(t, `SELECT count(*) FROM sessions WHERE site_id = 's1'`); n != 1 {
		t.Errorf("the session was not written out: %d", n)
	}
}
