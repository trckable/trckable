package ingest

import (
	"fmt"
	"testing"
	"time"
)

func total(l *limiter) int {
	n := 0
	for i := range l.shards {
		l.shards[i].Lock()
		n += len(l.shards[i].m)
		l.shards[i].Unlock()
	}
	return n
}

// An address that goes quiet is forgotten after ten minutes, without waiting
// for the map to grow, and one that is still active is not. One request, in
// any shard, is enough to clean every shard.
func TestIdleBucketsAreEvictedByTime(t *testing.T) {
	l := newLimiter(10, 60)
	now := time.Now()
	for i := 0; i < 200; i++ {
		l.allow(fmt.Sprintf("203.0.113.%d|v", i), now)
	}
	l.allow("active", now)
	if total(l) != 201 {
		t.Fatalf("expected 201 buckets, got %d", total(l))
	}
	// Nine minutes on, nothing is old enough to go.
	l.allow("active", now.Add(9*time.Minute))
	if got := total(l); got != 201 {
		t.Fatalf("buckets went early: %d", got)
	}
	// Eleven minutes on: the 200 quiet ones go, "active" (seen at nine) stays.
	l.allow("someone new", now.Add(11*time.Minute))
	if got := total(l); got != 2 {
		t.Fatalf("after the sweep %d buckets, want the active one and the new one", got)
	}
}

// The key of an address is not the plain FNV of it: two limiters (two
// processes) hash the same address differently.
func TestKeysDifferBetweenLimiters(t *testing.T) {
	a, b := newLimiter(1, 1), newLimiter(1, 1)
	if a.seed == b.seed {
		t.Fatal("two limiters share a seed")
	}
}

func TestLimiterStillLimits(t *testing.T) {
	l := newLimiter(1, 3)
	now := time.Now()
	ok := 0
	for i := 0; i < 10; i++ {
		if l.allow("1.2.3.4|v", now) {
			ok++
		}
	}
	if ok != 3 {
		t.Fatalf("allowed %d, want the burst of 3", ok)
	}
	if !l.allow("1.2.3.4|v", now.Add(2*time.Second)) {
		t.Fatal("tokens did not refill")
	}
}
