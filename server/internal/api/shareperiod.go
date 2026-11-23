package api

import (
	"net/http"
	"time"
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
// running now. The end is an instant (an hour boundary), so a clock change
// inside the window does not move it.
func last24Hours(now time.Time) (from, to time.Time) {
	to = now.Truncate(time.Hour).Add(time.Hour)
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
