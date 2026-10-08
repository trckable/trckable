package config

import "testing"

func TestDuckMemoryFor(t *testing.T) {
	for _, c := range []struct {
		avail int64
		want  string
	}{
		{0, "512MB"},
		{1 << 30, "512MB"},
		{4 << 30, "1024MB"},
		{64 << 30, "4096MB"},
	} {
		if got := duckMemoryFor(c.avail); got != c.want {
			t.Errorf("duckMemoryFor(%d) = %s, want %s", c.avail, got, c.want)
		}
	}
}
