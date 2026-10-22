package alerts

import (
	"math"
	"slices"
	"time"
)

// A threshold alert tells you when a count reaches a number: "10 sales today",
// "1,000 visitors this month", "$5,000 in all". It is one alert like the
// others (same destination, same outbox), with a metric, a period and a
// number. It fires once for each period it is crossed in: the next day, week
// or month it may fire again; "all" fires once, ever.

// What a threshold counts.
const (
	MetricSales    = "sales"    // payments that were not refunded in full
	MetricRevenue  = "revenue"  // net of tax and refunds, in the site's currency
	MetricVisitors = "visitors" // distinct visitors
)

// The stretch it counts over, in the site's own time.
const (
	PeriodDay   = "day"
	PeriodWeek  = "week"
	PeriodMonth = "month"
	PeriodAll   = "all"
)

// Metrics and Periods are every choice, in the order the dashboard shows them.
var (
	Metrics = []string{MetricSales, MetricRevenue, MetricVisitors}
	Periods = []string{PeriodDay, PeriodWeek, PeriodMonth, PeriodAll}
)

// maxThreshold keeps a typo ("1e30") from being stored as a rule.
const maxThreshold = 1e12

// ValidThreshold says whether a metric, a period and a number make a rule:
// sales and visitors are counted whole, so a half is not a number to reach.
func ValidThreshold(metric, period string, n float64) bool {
	if !slices.Contains(Metrics, metric) || !slices.Contains(Periods, period) {
		return false
	}
	if math.IsNaN(n) || n <= 0 || n > maxThreshold {
		return false
	}
	return metric == MetricRevenue || n == math.Trunc(n)
}

// Window is the stretch of a period that contains now: Key names it (the same
// day, week or month always has the same key), From is where it begins, in
// now's own zone. weekStart is the first day of the week (1 Monday, 0 Sunday).
// "all" begins at the zero time.
func Window(period string, now time.Time, weekStart int) (key string, from time.Time) {
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	switch period {
	case PeriodDay:
		return day.Format(time.DateOnly), day
	case PeriodWeek:
		from = day.AddDate(0, 0, -((int(day.Weekday()) - weekStart + 7) % 7))
		return "w:" + from.Format(time.DateOnly), from
	case PeriodMonth:
		from = day.AddDate(0, 0, 1-day.Day())
		return from.Format("2006-01"), from
	}
	return PeriodAll, time.Time{}
}

// ThresholdDue says whether a threshold alert should speak: the count has
// reached the number, and it has not already spoken for this period.
func ThresholdDue(value, threshold float64, firedKey, key string) bool {
	return threshold > 0 && value >= threshold && firedKey != key
}
