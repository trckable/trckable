package alerts

import (
	"testing"
	"time"
)

func TestValidThreshold(t *testing.T) {
	for _, c := range []struct {
		metric, period string
		n              float64
		ok             bool
	}{
		{MetricSales, PeriodDay, 10, true},
		{MetricVisitors, PeriodMonth, 1000, true},
		{MetricRevenue, PeriodAll, 99.5, true},
		{MetricSales, PeriodDay, 2.5, false}, // a half sale is not a number to reach
		{MetricSales, PeriodDay, 0, false},
		{MetricSales, PeriodDay, -3, false},
		{MetricSales, PeriodDay, 1e13, false},
		{"pageviews", PeriodDay, 5, false},
		{MetricSales, "year", 5, false},
		{"", "", 5, false},
	} {
		if got := ValidThreshold(c.metric, c.period, c.n); got != c.ok {
			t.Errorf("ValidThreshold(%q, %q, %v) = %v, want %v", c.metric, c.period, c.n, got, c.ok)
		}
	}
}

// A period has one key for all of it, and a new key the moment the next one
// begins, in the site's own zone and with its own first day of the week.
func TestWindowKeys(t *testing.T) {
	berlin, _ := time.LoadLocation("Europe/Berlin")
	wed := time.Date(2026, 10, 21, 23, 30, 0, 0, berlin) // a Wednesday
	for _, c := range []struct {
		period    string
		weekStart int
		key, from string
	}{
		{PeriodDay, 1, "2026-10-21", "2026-10-21"},
		{PeriodWeek, 1, "w:2026-10-19", "2026-10-19"},
		{PeriodWeek, 0, "w:2026-10-18", "2026-10-18"},
		{PeriodMonth, 1, "2026-10", "2026-10-01"},
		{PeriodAll, 1, "all", ""},
	} {
		key, from := Window(c.period, wed, c.weekStart)
		got := ""
		if !from.IsZero() {
			got = from.Format(time.DateOnly)
		}
		if key != c.key || got != c.from {
			t.Errorf("%s (week from %d): key %q from %q, want %q %q", c.period, c.weekStart, key, got, c.key, c.from)
		}
	}
	// Two minutes later it is already Thursday in Berlin: a new day, the same week.
	thu := wed.Add(time.Hour)
	if a, _ := Window(PeriodDay, wed, 1); a == mustKey(PeriodDay, thu) {
		t.Error("the day did not change at midnight")
	}
	if mustKey(PeriodWeek, wed) != mustKey(PeriodWeek, thu) {
		t.Error("the week changed in the middle of a week")
	}
	// A Sunday belongs to the week that began the Monday before.
	sun := time.Date(2026, 10, 25, 12, 0, 0, 0, berlin)
	if mustKey(PeriodWeek, sun) != mustKey(PeriodWeek, wed) {
		t.Error("Sunday is not in the Monday week")
	}
	if mustKey(PeriodWeek, sun.Add(24*time.Hour)) == mustKey(PeriodWeek, sun) {
		t.Error("the next Monday did not begin a week")
	}
}

func mustKey(period string, at time.Time) string {
	k, _ := Window(period, at, 1)
	return k
}

func TestThresholdDue(t *testing.T) {
	if ThresholdDue(9, 10, "", "2026-10-21") {
		t.Error("spoke below the number")
	}
	if !ThresholdDue(10, 10, "", "2026-10-21") {
		t.Error("did not speak at the number")
	}
	if ThresholdDue(50, 10, "2026-10-21", "2026-10-21") {
		t.Error("spoke twice in one period")
	}
	if !ThresholdDue(10, 10, "2026-10-20", "2026-10-21") {
		t.Error("did not speak again in the next period")
	}
	if ThresholdDue(5, 0, "", "k") {
		t.Error("a rule with no number spoke")
	}
}
