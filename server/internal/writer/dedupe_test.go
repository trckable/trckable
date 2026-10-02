package writer

import (
	"runtime"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

const hourMs = int64(time.Hour / time.Millisecond)

// t0 is when a test's ring starts: a real clock, never 0 (the ring takes 0 for "not started").
const t0 = 1_800_000_000_000

// A resend can come up to event.MaxAge after the first copy, whatever moment of
// the rotation the first copy arrived in.
func TestAccuracyDedupeRemembersEveryIDForTheLongestResend(t *testing.T) {
	for phase := int64(0); phase < dedupePeriod.Milliseconds(); phase += hourMs / 4 {
		d := newDedupe(dedupePeriod.Milliseconds(), dedupeGens, dedupeMaxIDs)
		d.seen(7, t0) // the ring starts
		if d.seen(1, t0+phase) {
			t.Fatalf("phase %d: a new id was said to be seen", phase)
		}
		if !d.seen(1, t0+phase+event.MaxAge.Milliseconds()+hourMs) {
			t.Fatalf("phase %d: id forgotten before event.MaxAge plus an hour", phase)
		}
	}
}

// Past the window an id is forgotten, so memory stays bounded.
func TestDedupeForgetsOldIDs(t *testing.T) {
	d := newDedupe(dedupePeriod.Milliseconds(), dedupeGens, dedupeMaxIDs)
	d.seen(1, t0)
	if d.seen(1, t0+int64(dedupeGens+1)*dedupePeriod.Milliseconds()) {
		t.Fatal("an id outlived the whole ring")
	}
	if n := d.size(); n != 1 {
		t.Fatalf("size %d, want 1", n)
	}
}

// A server that was idle for days still rotates, once per generation at most.
func TestDedupeAfterALongIdle(t *testing.T) {
	d := newDedupe(dedupePeriod.Milliseconds(), dedupeGens, dedupeMaxIDs)
	d.seen(1, t0)
	d.seen(2, t0+1000*hourMs)
	if d.seen(1, t0+1000*hourMs) || d.size() != 2 {
		t.Fatalf("after a long idle: size %d", d.size())
	}
	if !d.seen(2, t0+1001*hourMs) {
		t.Fatal("an id just recorded was forgotten")
	}
}

func TestDedupeIgnoresIDZero(t *testing.T) {
	d := newDedupe(dedupePeriod.Milliseconds(), dedupeGens, dedupeMaxIDs)
	if d.seen(0, t0) || d.seen(0, t0+1) || d.size() != 0 {
		t.Fatal("id 0 is no id: it is neither deduplicated nor kept")
	}
}

// Under extreme load the ring rotates early: the number of ids held never
// passes the cap, and the newest are the ones kept.
func TestDedupeIsCapped(t *testing.T) {
	d := newDedupe(dedupePeriod.Milliseconds(), 4, 400)
	for i := uint64(1); i <= 10_000; i++ {
		d.seen(i, t0)
		if d.size() > 400 {
			t.Fatalf("holding %d ids, cap is 400", d.size())
		}
	}
	if !d.seen(10_000, t0) {
		t.Fatal("the newest id was dropped")
	}
	if d.seen(1, t0) {
		t.Fatal("the oldest id was kept past the cap")
	}
}

// What the longer window costs in memory. The figure goes in the docs; the
// bound here only catches a structure that grew by itself.
func TestDedupeMemoryPerID(t *testing.T) {
	const n = 2_000_000
	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	d := newDedupe(dedupePeriod.Milliseconds(), dedupeGens, dedupeMaxIDs)
	var x uint64 = 88172645463325252
	for i := 0; i < n; i++ { // ids are 53 random bits
		x ^= x << 13
		x ^= x >> 7
		x ^= x << 17
		d.seen(x&(1<<53-1)|1, t0+int64(i))
	}
	runtime.GC()
	runtime.ReadMemStats(&after)
	per := float64(after.HeapAlloc-before.HeapAlloc) / float64(d.size())
	t.Logf("%d ids held, %.1f bytes each, %.1f MB in all; at the cap of %d ids: %.0f MB", d.size(), per, float64(after.HeapAlloc-before.HeapAlloc)/1e6, dedupeMaxIDs, per*dedupeMaxIDs/1e6)
	if per > 48 {
		t.Fatalf("%.1f bytes an id", per)
	}
	runtime.KeepAlive(d)
}
