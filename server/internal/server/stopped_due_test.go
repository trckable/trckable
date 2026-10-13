package server

import (
	"testing"
	"time"
)

// The "stopped" alert speaks when a site goes quiet, once more three days
// later, then stays silent until visits return.
func TestStoppedDueSendsOnceThenAgainThenNever(t *testing.T) {
	const hours = 6.0
	last := int64(1_000_000)
	at := func(since time.Duration) time.Time { return time.Unix(last, 0).Add(since) }
	h := time.Hour

	if stoppedDue(last, 0, hours, at(5*h)) {
		t.Fatal("fired before the site had been quiet long enough")
	}
	if !stoppedDue(last, 0, hours, at(6*h)) {
		t.Fatal("did not fire when the site went quiet")
	}
	fired1 := at(6 * h).Unix()
	for _, since := range []time.Duration{12 * h, 24 * h, 60 * h, 77 * h} {
		if stoppedDue(last, fired1, hours, at(since)) {
			t.Fatalf("repeated after %v of quiet", since)
		}
	}
	if !stoppedDue(last, fired1, hours, at(6*h+72*h)) {
		t.Fatal("did not fire the second time after three more days")
	}
	fired2 := at(6*h + 72*h).Unix()
	for _, since := range []time.Duration{80 * h, 7 * 24 * h, 60 * 24 * h} {
		if stoppedDue(last, fired2, hours, at(since)) {
			t.Fatalf("fired a third time after %v of quiet", since)
		}
	}
	// Visits come back, then stop again: the cycle starts over.
	back := at(10 * 24 * h).Unix()
	if stoppedDue(back, fired2, hours, time.Unix(back, 0).Add(2*h)) {
		t.Fatal("fired right after visits returned")
	}
	if !stoppedDue(back, fired2, hours, time.Unix(back, 0).Add(6*h)) {
		t.Fatal("did not fire again after visits returned and stopped")
	}
}

func TestHeldAlertWaitsOutTheQuietWindow(t *testing.T) {
	var h heldAlerts
	now := time.Now()
	if h.holding("a", now) {
		t.Fatal("held before anything failed")
	}
	h.hold("a", now)
	if !h.holding("a", now.Add(time.Hour)) {
		t.Fatal("not held inside the window")
	}
	if h.holding("a", now.Add(alertQuiet)) {
		t.Fatal("still held after the window")
	}
}
