package surge

import (
	"testing"
	"time"
)

func TestStoryTellsWhenItBeganItsPeakAndNow(t *testing.T) {
	now := time.Date(2026, 10, 6, 19, 0, 0, 0, time.UTC)
	// Twelve slices of five minutes: 18:00 to 19:00. Usual 20: it climbs from the 18:40 slice.
	series := []int64{18, 22, 19, 21, 20, 23, 19, 22, 40, 53, 49, 31}
	s := BuildStory(series, now, 20, Seen{
		Devices: []Count{{"mobile", 30}, {"desktop", 10}, {"", 5}}, Countries: []Count{{"AL", 20}, {"US", 8}, {"DE", 3}, {"FR", 1}},
		Hosts: []Count{{"l.facebook.com", 20}, {"m.facebook.com", 14}, {"google.com", 6}}, Pages: []Count{{"/blog/launch-post", 30}, {"/", 12}},
	})
	if want := time.Date(2026, 10, 6, 18, 40, 0, 0, time.UTC).Unix(); s.Start != want {
		t.Errorf("start %v, want %v", time.Unix(s.Start, 0).UTC(), time.Unix(want, 0).UTC())
	}
	if s.Peak != 53 || s.PeakAt != time.Date(2026, 10, 6, 18, 45, 0, 0, time.UTC).Unix() || s.Now != 31 {
		t.Errorf("peak %d at %v, now %d", s.Peak, time.Unix(s.PeakAt, 0).UTC(), s.Now)
	}
	if s.Mobile != 30 || s.Devices != 40 {
		t.Errorf("devices %d of %d: people with no device known are not counted", s.Mobile, s.Devices)
	}
	if len(s.Places) != 3 || s.Places[0].Country != "AL" {
		t.Errorf("places %+v", s.Places)
	}
	if len(s.Sources) != 2 || s.Sources[0] != (Tally{"Facebook", 34}) || s.Sources[1] != (Tally{"Google", 6}) {
		t.Errorf("sources %+v: hosts of one source are added up", s.Sources)
	}
	if len(s.Pages) != 2 || s.Pages[0].Name != "/blog/launch-post" {
		t.Errorf("pages %+v", s.Pages)
	}
}

// A surge that fills the whole hour began before it; one that has already
// fallen back has no start to tell.
func TestStoryStartIsOnlyToldWhenItIsKnown(t *testing.T) {
	now := time.Date(2026, 10, 6, 19, 0, 0, 0, time.UTC)
	busy := []int64{40, 41, 42, 40, 41, 42, 40, 41, 42, 40, 41, 42}
	if s := BuildStory(busy, now, 20, Seen{}); s.Start != 0 {
		t.Errorf("busy all hour: %d", s.Start)
	}
	over := []int64{20, 20, 20, 20, 20, 20, 20, 20, 50, 50, 30, 20}
	if s := BuildStory(over, now, 20, Seen{}); s.Start != 0 {
		t.Errorf("already over: %d", s.Start)
	}
}
