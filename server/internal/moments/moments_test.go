package moments

import "testing"

func TestSpikes(t *testing.T) {
	v := []int64{10, 12, 9, 11, 10, 40, 12, 11}
	got := Spikes(v, 0, 1, 4, 3, 10)
	if len(got) != 1 || got[0].I != 5 || got[0].Factor < 3.5 {
		t.Fatalf("one spike at 5, got %+v", got)
	}
	// Only from start on: the baseline may come from before it.
	if got := Spikes(v, 6, 1, 4, 3, 10); len(got) != 0 {
		t.Fatalf("got %+v", got)
	}
}

func TestSpikesNeedABaseline(t *testing.T) {
	// Fewer than two buckets before: never a spike.
	if got := Spikes([]int64{0, 50, 0, 0, 55}, 0, 1, 4, 3, 10); len(got) != 1 || got[0].I != 4 {
		t.Fatalf("got %+v", got)
	}
}

func TestSpikesQuietSite(t *testing.T) {
	// Zero before is a baseline of one: a dozen is a spike, three is not.
	if got := Spikes([]int64{0, 0, 0, 0, 3, 12}, 0, 1, 4, 3, 10); len(got) != 1 || got[0].I != 5 {
		t.Fatalf("got %+v", got)
	}
}

// By the hour, an hour is measured against the same hour on the days before:
// every afternoon is busy, and only an unusual one is a spike.
func TestSpikesSameHour(t *testing.T) {
	day := func(afternoon int64) []int64 {
		d := make([]int64, 24)
		for h := range d {
			d[h] = 2
		}
		d[15] = afternoon
		return d
	}
	v := append(append(append(day(30), day(30)...), day(30)...), day(120)...)
	got := Spikes(v, 24, 24, 7, 3, 10)
	if len(got) != 1 || got[0].I != 72+15 {
		t.Fatalf("only the fourth afternoon, got %+v", got)
	}
}

// Against about one visitor a day, 230 visitors is new traffic: no multiplier
// is told. Against a real baseline of a week or more it is a spike.
func TestSpikesBelowTheFloorAreNewTraffic(t *testing.T) {
	quiet := []int64{1, 1, 0, 2, 1, 1, 1, 1, 230}
	got := Spikes(quiet, 8, 1, 7, 3, 10)
	if len(got) != 1 || !got[0].Quiet {
		t.Fatalf("a usual of one is new traffic, got %+v", got)
	}
	busy := []int64{100, 110, 95, 105, 100, 98, 102, 101, 450}
	got = Spikes(busy, 8, 1, 7, 3, 10)
	if len(got) != 1 || got[0].Quiet {
		t.Fatalf("a usual of 100 keeps its multiplier, got %+v", got)
	}
}

// A site younger than a week has no usual to speak of, whatever it gets a day.
func TestSpikesOfAYoungSiteAreNewTraffic(t *testing.T) {
	v := []int64{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 110, 105, 400}
	got := Spikes(v, 13, 1, 7, 3, 10)
	if len(got) != 1 || !got[0].Quiet {
		t.Fatalf("three days of history is new traffic, got %+v", got)
	}
	old := append([]int64{100, 110, 105, 100, 95, 100, 102}, 400)
	if got := Spikes(old, 7, 1, 7, 3, 10); len(got) != 1 || got[0].Quiet {
		t.Fatalf("a week of history is enough, got %+v", got)
	}
}

// By the hour the floor is per hour, and the first hours of the site's first
// day do not count against it.
func TestSpikesByTheHourFloor(t *testing.T) {
	day := func(afternoon int64) []int64 {
		d := make([]int64, 24)
		for h := range d {
			d[h] = 5
		}
		d[15] = afternoon
		return d
	}
	var v []int64
	for i := 0; i < 7; i++ {
		v = append(v, day(5)...)
	}
	v = append(v, day(60)...)
	got := Spikes(v, 168, 24, 7, 3, 10)
	if len(got) != 1 || got[0].Quiet {
		t.Fatalf("5 visitors an hour is a baseline, got %+v", got)
	}
}

func TestTopPutsRealSpikesFirst(t *testing.T) {
	s := []Spike{{I: 1, Factor: 230, Quiet: true}, {I: 4, Factor: 4}, {I: 6, Factor: 5}}
	got := Top(s, 2)
	if len(got) != 2 || got[0].I != 4 || got[1].I != 6 {
		t.Fatalf("new traffic does not outrank a spike, got %+v", got)
	}
}

func TestTimes(t *testing.T) {
	for in, want := range map[float64]string{3: "3×", 3.04: "3×", 2.44: "2.4×", 9.96: "10×", 12.4: "12×", 230.03: "230×", 17.2: "17×"} {
		if got := Times(in); got != want {
			t.Errorf("Times(%v) = %q, want %q", in, got, want)
		}
	}
	if Round(230.0) != 230 || Round(4.26) != 4.3 || Round(14.6) != 15 {
		t.Fatalf("Round: %v %v %v", Round(230.0), Round(4.26), Round(14.6))
	}
}

func TestTop(t *testing.T) {
	s := []Spike{{I: 1, Factor: 3}, {I: 4, Factor: 9}, {I: 6, Factor: 5}, {I: 9, Factor: 4}}
	got := Top(s, 2)
	if len(got) != 2 || got[0].I != 4 || got[1].I != 6 {
		t.Fatalf("the two biggest in time order, got %+v", got)
	}
}

func TestSort(t *testing.T) {
	ms := []Moment{{T: "b", Kind: "sale"}, {T: "a", Kind: "sale"}, {T: "a", Kind: "note"}}
	Sort(ms)
	if ms[0].Kind != "note" || ms[1].T != "a" || ms[2].T != "b" {
		t.Fatalf("got %+v", ms)
	}
}

func TestBursts(t *testing.T) {
	// Sales most days, a few on a usual one, nine on another.
	c := []int64{1, 2, 0, 1, 9, 2, 1, 0, 2}
	got := Bursts(c, 3, 2)
	if len(got) != 1 || got[0].I != 4 || got[0].Factor != 4.5 {
		t.Fatalf("one burst at 4, 4.5 times the median of 2, got %+v", got)
	}
}

func TestBurstsNeedAPattern(t *testing.T) {
	// Two days with sales are no pattern: nothing is a burst.
	if got := Bursts([]int64{0, 1, 0, 9}, 3, 2); got != nil {
		t.Fatalf("got %+v", got)
	}
	// Enough days, but the big day is under the minimum count.
	if got := Bursts([]int64{1, 1, 1, 1, 2}, 3, 2); got != nil {
		t.Fatalf("got %+v", got)
	}
	// A steady site has no bursts.
	if got := Bursts([]int64{4, 5, 4, 5, 6, 5}, 3, 2); got != nil {
		t.Fatalf("got %+v", got)
	}
}

func TestDedupeKeepsEachMilestoneOnceAtItsEarliestDay(t *testing.T) {
	ms := []Moment{
		{T: "2026-09-12T00:00", Kind: "milestone", Family: "visitors", Step: "100", Value: 100},
		{T: "2026-09-12T00:00", Kind: "milestone", Family: "countries", Step: "10", Value: 10},
		{T: "2026-09-12T00:00", Kind: "milestone", Family: "countries", Step: "25", Value: 25},
		{T: "2026-09-10T00:00", Kind: "milestone", Family: "visitors", Step: "100", Value: 100},
		{T: "2026-09-12T00:00", Kind: "milestone", Family: "visitors", Step: "100", Value: 100},
		{T: "2026-09-12T00:00", Kind: "spike", Visitors: 40},
		{T: "2026-09-12T00:00", Kind: "spike", Visitors: 40},
		{T: "2026-09-12T00:00", Kind: "spike", Visitors: 41},
	}
	got := Dedupe(ms)
	if len(got) != 5 {
		t.Fatalf("got %d moments, want 5: %+v", len(got), got)
	}
	if got[0].Family != "visitors" || got[0].T != "2026-09-10T00:00" {
		t.Errorf("the visitors milestone is not at its earliest day: %+v", got[0])
	}
	if got[3].Visitors != 40 || got[4].Visitors != 41 {
		t.Errorf("the spikes: %+v", got[3:])
	}
}
