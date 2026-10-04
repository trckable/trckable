package ga

import "testing"

func TestAMetricIsClamped(t *testing.T) {
	for in, want := range map[string]uint64{"12": 12, "7.0": 7, "-3": 0, "x": 0, "99999999999999999999": maxMetric, "5000000000000": maxMetric} {
		if got := atou(in); got != want {
			t.Errorf("atou(%q) = %d, want %d", in, got, want)
		}
	}
}
