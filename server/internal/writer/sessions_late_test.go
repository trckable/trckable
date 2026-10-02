package writer

import (
	"testing"

	"github.com/trckable/trckable/server/internal/event"
)

// A browser that kept a whole visit through an outage sends it one event at a
// time, oldest first. Each event is dated hours ago, but the visit is still
// arriving: the writer must not write the session after the first commit and
// start another for the second event.
func TestAccuracyALateVisitArrivingInSeveralCommitsIsOneSession(t *testing.T) {
	z := newSessionizer(DefaultCloseAfter)
	base := int64(1_800_000_000_000)
	wall := base + 20*3600_000 // the server is back, twenty hours on

	first := event.Event{Site: "s1", Kind: event.KindPageview, EventID: 1, TS: base, Visitor: 9, Pageview: 100, Path: "/a", Late: true}
	id1, _, _, _ := z.assign(&first, wall)
	if closed, _ := z.closeIdle(wall); len(closed) != 0 {
		t.Fatalf("the visit was written after its first event: %d sessions", len(closed))
	}

	for i, ev := range []event.Event{
		{Site: "s1", Kind: event.KindGoal, EventID: 2, TS: base + 5_000, Visitor: 9, Goal: "signup", Late: true},
		{Site: "s1", Kind: event.KindPageview, EventID: 3, TS: base + 20_000, Visitor: 9, Pageview: 101, Path: "/b", Late: true},
		{Site: "s1", Kind: event.KindEngagement, EventID: 4, TS: base + 40_000, Visitor: 9, Pageview: 101, EngagedMs: 20_000, Late: true},
	} {
		at := wall + int64(i+1)*1_000 // each in a later commit
		id, _, _, _ := z.assign(&ev, at)
		if id != id1 {
			t.Fatalf("event %d started a session of its own", ev.EventID)
		}
		if closed, _ := z.closeIdle(at); len(closed) != 0 {
			t.Fatalf("the visit was written before it had all arrived")
		}
	}

	// An hour after the last of it, it is written, once, whole.
	closed, _ := z.closeIdle(wall + 3_000 + DefaultCloseAfter)
	if len(closed) != 1 || closed[0].Pageviews != 2 || closed[0].Goals != 1 || closed[0].Start != base {
		t.Fatalf("written: %+v", closed)
	}
}

// What is live is not held longer: a session closes an hour after its own last
// event, as it always did.
func TestLiveSessionClosesAnHourAfterItsLastEvent(t *testing.T) {
	z := newSessionizer(DefaultCloseAfter)
	base := int64(1_800_000_000_000)
	e := event.Event{Site: "s1", Kind: event.KindPageview, EventID: 1, TS: base, Visitor: 9, Pageview: 100, Path: "/"}
	z.assign(&e, base+500) // arrives half a second after it happened
	if closed, _ := z.closeIdle(base + DefaultCloseAfter - 1); len(closed) != 0 {
		t.Fatal("closed early")
	}
	if closed, _ := z.closeIdle(base + DefaultCloseAfter); len(closed) != 1 {
		t.Fatal("not closed an hour after its last event")
	}
}

// Old events that are not late (history that was imported, a replay of the
// write-ahead log) are written as soon as the writer has them, however old.
func TestOldEventsThatAreNotLateAreWrittenAtOnce(t *testing.T) {
	z := newSessionizer(DefaultCloseAfter)
	base := int64(1_800_000_000_000)
	e := event.Event{Site: "s1", Kind: event.KindPageview, EventID: 1, TS: base, Visitor: 9, Pageview: 100, Path: "/"}
	z.assign(&e, base+20*3600_000)
	if closed, _ := z.closeIdle(base + 20*3600_000); len(closed) != 1 {
		t.Fatal("a session of old, not late, events was held open")
	}
}
