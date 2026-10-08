package api

import (
	"testing"
	"time"
)

func TestPreviousStartCountsCalendarDays(t *testing.T) {
	cases := []struct {
		name, zone, from, to, want string
	}{
		{"Berlin across the October clock change", "Europe/Berlin", "2026-10-25", "2026-10-28", "2026-10-22"},
		{"Berlin period ending on the change", "Europe/Berlin", "2026-10-20", "2026-10-26", "2026-10-14"},
		{"New York across the November clock change", "America/New_York", "2026-11-01", "2026-11-04", "2026-10-29"},
		{"New York one day", "America/New_York", "2026-11-01", "2026-11-02", "2026-10-31"},
		{"Berlin across the March clock change", "Europe/Berlin", "2026-03-29", "2026-03-31", "2026-03-27"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			loc, err := time.LoadLocation(c.zone)
			if err != nil {
				t.Fatal(err)
			}
			from, err := time.ParseInLocation("2006-01-02", c.from, loc)
			if err != nil {
				t.Fatal(err)
			}
			to, err := time.ParseInLocation("2006-01-02", c.to, loc)
			if err != nil {
				t.Fatal(err)
			}
			want, _ := time.ParseInLocation("2006-01-02", c.want, loc)
			if got := previousStart(from, to, loc); !got.Equal(want) {
				t.Fatalf("previousStart = %s, want %s", got, want)
			}
		})
	}
}
