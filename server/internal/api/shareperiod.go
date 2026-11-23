package api

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// A shared link reads three periods and no other: the last 7 days, the last
// 30 days (the default) and the last 12 months, each ending today. The list is
// the dashboard's too (dashboard/src/lib/sharePeriods.json); a test reads that
// file, so the two cannot drift apart. Whatever a link's address asks for is
// brought to the nearest of these, so editing it never gets another range.

type sharePeriod struct {
	ID     string
	Days   int // the last n days, today included
	Months int // or the last n months, from the day after today n months ago
}

var sharePeriods = []sharePeriod{{"7d", 7, 0}, {"30d", 30, 0}, {"12mo", 0, 12}}

const shareDefaultPeriod = "30d"

// start is the first day of the period ending on today (midnight, in today's zone).
func (p sharePeriod) start(today time.Time) time.Time {
	day := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location())
	if p.Months > 0 {
		return day.AddDate(0, -p.Months, 1)
	}
	return day.AddDate(0, 0, 1-p.Days)
}

// sharePeriodFor picks the shortest period that holds the days asked for (the
// longest when none does).
func sharePeriodFor(days int, today time.Time) sharePeriod {
	for _, p := range sharePeriods {
		if int(today.Sub(p.start(today)).Hours()/24+0.5)+1 >= days {
			return p
		}
	}
	return sharePeriods[len(sharePeriods)-1]
}

// fixSharePeriod rewrites a share-scoped request so that it asks for one of
// the offered periods ending today, with no comparison and no other cut of the
// range. A request that cannot be read is left for the report to refuse.
func (a *API) fixSharePeriod(r *http.Request, siteID string) {
	v := r.URL.Query()
	tz := ""
	if si, err := a.Ctl.SiteInfo(r.Context(), siteID); err == nil {
		tz = si.Timezone
	}
	if t := v.Get("tz"); t != "" {
		tz = t
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return
	}
	today := a.Now().In(loc)
	from, to, err := dateRange(v.Get("from"), v.Get("to"), today)
	if err != nil {
		return
	}
	p := sharePeriodFor(int(to.Sub(from).Hours()/24+0.5), today)
	for _, k := range []string{"compare", "cfrom", "cto", "sofar", "sincehour", "bucket"} {
		v.Del(k)
	}
	v.Set("from", p.start(today).Format("2006-01-02"))
	v.Set("to", today.Format("2006-01-02"))
	r.URL.RawQuery = v.Encode()
}

// last24Hours is the card's 24 hours: the 24 hour buckets that end with the one
// running now. The end is an instant (a local hour boundary), so a clock change
// inside the window does not move it.
func last24Hours(now time.Time) (from, to time.Time) {
	// The next hour boundary of the site's own clock (zones of +5:30 or +5:45 have
	// theirs at :30 and :45 of UTC's hours): subtract the clock's minutes, then add the hour.
	to = now.Add(-time.Duration(now.Minute())*time.Minute - time.Duration(now.Second())*time.Second - time.Duration(now.Nanosecond())).Add(time.Hour)
	return to.Add(-24 * time.Hour), to
}

// periodDays is the days a period covers, in the zone of now, ending today at
// the latest: a share period (sharePeriods), all time (from first, the site's
// first data; today when there is none) or a custom from..to (two dates). ok is
// false for a name or a range that is not one of these, which the caller reads
// as the default. A card and a shared link ask the same days for the same name.
func periodDays(name, fromS, toS string, now, first time.Time) (from, to time.Time, ok bool) {
	loc := now.Location()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	switch name {
	case "all":
		from = today
		if !first.IsZero() {
			f := first.In(loc)
			from = time.Date(f.Year(), f.Month(), f.Day(), 0, 0, 0, 0, loc)
		}
		if from.After(today) {
			from = today
		}
		return from, today, true
	case "since":
		f, err := time.ParseInLocation("2006-01-02", fromS, loc)
		if err != nil || f.After(today) {
			return today, today, false
		}
		return f, today, true
	case "custom":
		f, e1 := time.ParseInLocation("2006-01-02", fromS, loc)
		t, e2 := time.ParseInLocation("2006-01-02", toS, loc)
		if e1 != nil || e2 != nil || f.After(t) || f.After(today) || t.Sub(f) >= 20*366*24*time.Hour {
			return today, today, false
		}
		if t.After(today) {
			t = today
		}
		return f, t, true
	}
	for _, p := range sharePeriods {
		if p.ID == name {
			return p.start(today), today, true
		}
	}
	return today, today, false
}

// fixedDays is the days a link fixed to a period covers on the day of now: a preset, a range
// (cut back to today) or a start (up to today). ok is false for none, and for what is not a period.
func fixedDays(p string, now time.Time) (from, to time.Time, ok bool) {
	loc := now.Location()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	first, last, span := sqlite.SharePeriodDays(p)
	if !span {
		if p == "" {
			return today, today, false
		}
		sp := sharePeriodByID(p)
		return sp.start(today), today, true
	}
	f, err := time.ParseInLocation(time.DateOnly, first, loc)
	if err != nil {
		return today, today, false
	}
	to = today
	if last != "" {
		if t, err := time.ParseInLocation(time.DateOnly, last, loc); err == nil && t.Before(today) {
			to = t
		}
	}
	if f.After(to) {
		f = to
	}
	return f, to, true
}

var errSharePeriod = errors.New("period can be 7d, 30d, 12mo, all, or two days (from..to, from no later than to, neither after today)")

// sharePeriodIn is the period a link is made with, from what its owner sent: the same word for a
// preset, the start of the site's data for "all" (kept as that day, so the link shows the same days
// whenever it is opened), and a range as written once it is a real one that does not reach past today.
func (a *API) sharePeriodIn(ctx context.Context, site, in string) (string, error) {
	if in == "" {
		return "", nil
	}
	if err := sqlite.CheckSharePeriod(in); err != nil && in != "all" {
		return "", errSharePeriod
	}
	tz := ""
	if si, err := a.Ctl.SiteInfo(ctx, site); err == nil {
		tz = si.Timezone
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	today := a.Now().In(loc).Format(time.DateOnly)
	if in == "all" {
		first := today
		if q := a.Query(); q != nil {
			if day, err := a.firstDayOf(ctx, q, site, tz); err == nil && day != "" && day < today {
				first = day
			}
		}
		return sqlite.SinceDay(first), nil
	}
	if f, l, ok := sqlite.SharePeriodDays(in); ok && (f > today || l > today) {
		return "", errSharePeriod
	}
	return in, nil
}

// sharePeriodLabel is a link's fixed period in the card's words, in the card's language: the same function the
// card's own period line is made by. "" for a link whose reader chooses.
func sharePeriodLabel(l *cardLang, period string, now time.Time) string {
	if period == "" {
		return ""
	}
	if first, last, ok := sqlite.SharePeriodDays(period); ok {
		if last == "" {
			return resolvePeriod(l, "since", first, "", now, time.Time{}, false).label
		}
		return resolvePeriod(l, "custom", first, last, now, time.Time{}, false).label
	}
	return resolvePeriod(l, period, "", "", now, time.Time{}, false).label
}
