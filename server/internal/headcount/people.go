// Package headcount decides when a count of people needs its caveat.
//
// A site without cookies recognises a person only within one UTC day: the
// same person on two days is counted twice. So a count over more than one day
// on such a site is told with "counted once per day"; a single day, or a site
// in cookie mode, is just "people".
package headcount

// OncePerDayNote is the short clause that goes with such a count.
const OncePerDayNote = "counted once per day"

// OncePerDay reports whether a count of people over a period of days needs
// the note: only a cookieless site, and only when the period is longer than
// one day.
func OncePerDay(cookieless bool, days int) bool {
	return cookieless && days > 1
}
