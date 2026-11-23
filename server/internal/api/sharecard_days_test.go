package api

import "testing"

func TestCardDaysCountsTheLast24HoursAsOne(t *testing.T) {
	if got := cardDays(cardPeriod{days: 2, hours: 24}); got != 1 {
		t.Fatalf("last 24 hours: %d days", got)
	}
	if got := cardDays(cardPeriod{days: 7}); got != 7 {
		t.Fatalf("a week: %d days", got)
	}
}
