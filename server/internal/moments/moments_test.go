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

func TestTop(t *testing.T) {
	s := []Spike{{1, 3}, {4, 9}, {6, 5}, {9, 4}}
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
