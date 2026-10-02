package server

import "testing"

// Against a usual under ten visitors a day, or fewer than seven days, the
// alert is new traffic with the count, not a multiplier.
func TestBusyDayWords(t *testing.T) {
	title, msg := busyDay("example.com", 230, 1, 7)
	if title != "New traffic" || msg != "example.com has 230 visitors today, more than it usually gets." {
		t.Fatalf("%q %q", title, msg)
	}
	if title, _ := busyDay("example.com", 400, 100, 4); title != "New traffic" {
		t.Fatalf("a site under a week old: %q", title)
	}
	title, msg = busyDay("example.com", 1230, 100, 7)
	if title != "Busy day" || msg != "example.com has 1230 visitors today — about 12× a normal day." {
		t.Fatalf("%q %q", title, msg)
	}
	if _, msg := busyDay("example.com", 250, 100, 7); msg != "example.com has 250 visitors today — about 2.5× a normal day." {
		t.Fatalf("%q", msg)
	}
}
