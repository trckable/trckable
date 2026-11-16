package api

import (
	"net/http"
	"time"

	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// What a link shows besides its headline numbers is decided here, on the
// server, like revenue: a section the owner switched off is not asked for
// again with another parameter, and what it would have said is not in the
// answer to be found in a network tab. The page hides the same sections, but
// that is only so it does not offer what would come back empty.

// dimSection says which section of the shared dashboard a breakdown of the
// report belongs to. A dimension not listed here belongs to no section the
// link can show, so a link with any section off never carries it (and the
// test in sharescope_test.go fails when a new dimension is not listed).
var dimSection = map[string]string{
	"page": "pages", "entry_page": "pages", "exit_page": "pages", "group": "pages", "hostname": "pages",
	"channel": "sources", "referrer": "sources", "campaign": "sources", "source": "sources", "medium": "sources", "link": "sources",
	"country": "places", "region": "places", "city": "places", "timezone": "places", "language": "places",
	"device": "tech", "browser": "tech", "os": "tech", "browser_version": "tech", "screen": "tech", "network": "tech",
}

// openDims are the dimensions a filter may use on any link: a goal is not a
// section, and filtering by one says nothing about the sections that are off.
var openDims = map[string]bool{"goal": true}

// sectionsAll says whether the link shows every section it can.
func sectionsAll(sh sqlite.Share) bool {
	for _, s := range sqlite.ShareSections {
		if !sh.Shows(s) {
			return false
		}
	}
	return true
}

// showsDim says whether the link may show a breakdown by this dimension.
func showsDim(sh sqlite.Share, dim string) bool {
	if sectionsAll(sh) || openDims[dim] {
		return true
	}
	section, ok := dimSection[dim]
	return ok && sh.Shows(section)
}

// refuseHiddenFilters answers 403 when the request filters by a dimension of
// a hidden section: a filter would tell what the section's table would, by
// the numbers that change when it is applied.
func refuseHiddenFilters(w http.ResponseWriter, sh sqlite.Share, filters []query.Filter) bool {
	for _, f := range filters {
		if !showsDim(sh, f.Dim) {
			fail(w, http.StatusForbidden, "this link does not show that")
			return false
		}
	}
	return true
}

// scoped is the report of a link without the breakdowns it does not show. It
// copies rather than edits: the result may be the one the report cache keeps.
// A section that is off has empty tables, not missing ones, so a page reading
// them has nothing to trip on.
func scoped(sh sqlite.Share, in *query.Result) *query.Result {
	if in == nil || sectionsAll(sh) {
		return in
	}
	out := *in
	out.Dims = scopedDims(sh, in.Dims)
	out.RevenueDims = scopedDims(sh, in.RevenueDims)
	if !sh.Shows("pages") {
		out.Hosts = 0
	}
	if in.Days != nil {
		out.Days = make([]query.Day, len(in.Days))
		for i, d := range in.Days {
			d.Dims = scopedDims(sh, d.Dims)
			out.Days[i] = d
		}
	}
	return &out
}

func scopedDims(sh sqlite.Share, in map[string][]query.Row) map[string][]query.Row {
	if in == nil {
		return nil
	}
	out := make(map[string][]query.Row, len(in))
	for dim, rows := range in {
		if showsDim(sh, dim) {
			out[dim] = rows
		} else {
			out[dim] = []query.Row{}
		}
	}
	return out
}

// lockPeriod holds a report asked through a link that is fixed to one period
// to that period, whatever dates came with it: the range is rewritten here,
// before the request is read, in the site's own time zone. The comparison is
// held too: none, or the stretch just before the period (the figures' own
// change); a request for last year or for dates of its own is answered with
// the stretch before, never with another one.
func (a *API) lockPeriod(w http.ResponseWriter, r *http.Request, sh sqlite.Share) bool {
	if sh.Period == "" {
		return true
	}
	si, err := a.Ctl.SiteInfo(r.Context(), sh.SiteID)
	if err != nil {
		fail(w, http.StatusNotFound, "that site is gone")
		return false
	}
	loc, err := time.LoadLocation(si.Timezone)
	if err != nil {
		loc = time.UTC
	}
	v := r.URL.Query()
	from, to := sharePeriodRange(sh.Period, a.Now().In(loc))
	v.Set("from", from.Format("2006-01-02"))
	v.Set("to", to.Format("2006-01-02"))
	for _, k := range []string{"cfrom", "cto", "tz", "sincehour"} {
		v.Del(k)
	}
	if c := v.Get("compare"); c != "" && c != "none" {
		v.Set("compare", "previous")
		// A calendar period is told against the same stretch of the one before
		// (this month so far against last month's first days), as the dashboard does.
		if cf, ct, ok := calendarPrevious(sh.Period, from, to); ok {
			v.Set("compare", "custom")
			v.Set("cfrom", cf.Format("2006-01-02"))
			v.Set("cto", ct.Format("2006-01-02"))
		}
	}
	r.URL.RawQuery = v.Encode()
	return true
}

// calendarPrevious is the stretch a calendar period is compared with: this
// month's first days against the same days of last month, this year to date
// against the same stretch of last year (dashboard/src/lib/dates.ts).
func calendarPrevious(period string, from, to time.Time) (time.Time, time.Time, bool) {
	switch period {
	case "mtd":
		pf := monthsBack(from, 1)
		pt := monthsBack(to, 1)
		if end := time.Date(pf.Year(), pf.Month()+1, 0, 12, 0, 0, 0, pf.Location()); pt.After(end) {
			pt = end
		}
		return pf, pt, true
	case "ytd":
		return monthsBack(from, 12), monthsBack(to, 12), true
	}
	return from, to, false
}

// sharePeriodRange is the days (inclusive) a period of sqlite.SharePeriods
// covers on the day `now` is: the same ranges the dashboard's period menu
// draws (dashboard/src/lib/dates.ts).
func sharePeriodRange(period string, now time.Time) (time.Time, time.Time) {
	t := time.Date(now.Year(), now.Month(), now.Day(), 12, 0, 0, 0, now.Location()) // noon: a clock change never moves the day
	day := func(d time.Time, n int) time.Time { return d.AddDate(0, 0, n) }
	switch period {
	case "yesterday":
		return day(t, -1), day(t, -1)
	case "7d":
		return day(t, -6), t
	case "30d":
		return day(t, -29), t
	case "90d":
		return day(t, -89), t
	case "12mo":
		return day(monthsBack(t, 12), 1), t
	case "mtd":
		return time.Date(t.Year(), t.Month(), 1, 12, 0, 0, 0, t.Location()), t
	case "lastmonth":
		first := time.Date(t.Year(), t.Month(), 1, 12, 0, 0, 0, t.Location())
		return first.AddDate(0, -1, 0), day(first, -1)
	case "ytd":
		return time.Date(t.Year(), 1, 1, 12, 0, 0, 0, t.Location()), t
	}
	return t, t // "today"
}

// monthsBack goes back n months, to the last day of a month that is too short
// (31 March less one month is 28 February): what the dashboard's own sum does.
func monthsBack(t time.Time, n int) time.Time {
	first := time.Date(t.Year(), t.Month()-time.Month(n), 1, 12, 0, 0, 0, t.Location())
	last := first.AddDate(0, 1, -1).Day()
	return time.Date(first.Year(), first.Month(), min(t.Day(), last), 12, 0, 0, 0, t.Location())
}
