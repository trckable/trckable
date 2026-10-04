package api

import (
	"net/http"
	"net/url"
	"time"

	"github.com/trckable/trckable/server/internal/moments"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// usualWeeks is how many past weeks a day's "usual" is taken over: the same
// weekday, the four before.
const usualWeeks = query.MaxUsualWeeks

// calDay is one day of the month grid: its visitors, what that weekday
// usually brings, the hours it was made of. Aggregates only.
type calDay struct {
	Day      string  `json:"day"`
	Visitors int64   `json:"visitors"`
	Usual    int64   `json:"usual"`             // the same weekday's mean over the last four weeks; 0 when the site has no such weeks yet
	Revenue  int64   `json:"revenue,omitempty"` // only where the reader may see money
	Sales    int64   `json:"sales,omitempty"`
	Hours    []int64 `json:"hours,omitempty"` // visitors per hour, 24 of them, for days that have begun
	Source   string  `json:"source,omitempty"`
	Page     string  `json:"page,omitempty"`
}

// calendar serves GET /api/v1/sites/{site}/calendar?month=YYYY-MM: the whole
// month in one answer, for the Data view's calendar.
//
//	month   YYYY-MM, in the site's timezone
//	f, tz   as the report
//
// Per day: visitors, the usual for that weekday, revenue and sales (where
// the report would show money to this reader), the hourly shape, the best
// source and page. For the month: moments with the hour they happened in
// where there is one (spikes, surges, sales, milestones, new referrers, the
// first AI visit), the notes and the plans. Filters narrow the numbers; the
// moments, notes and plans are the whole site's, and the answer says so.
func (a *API) calendar(w http.ResponseWriter, r *http.Request) {
	a.calendarFor(w, r, r.PathValue("site"), true, true, true)
}

// shareCalendar is the same month for a shared link: money only when the link
// carries it, notes and plans only when it shows notes, never who wrote them,
// and none of the moments only a signed-in reader sees.
func (a *API) shareCalendar(w http.ResponseWriter, r *http.Request) {
	sh, ok := a.shared(w, r)
	if !ok {
		return
	}
	a.calendarFor(w, r, sh.SiteID, sh.Revenue, sh.Notes, false)
}

func (a *API) calendarFor(w http.ResponseWriter, r *http.Request, site string, revenue, notes, member bool) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	first, err := time.Parse("2006-01-02", r.URL.Query().Get("month")+"-01")
	if err != nil {
		fail(w, http.StatusBadRequest, "month must look like 2026-09")
		return
	}
	last := first.AddDate(0, 1, -1)
	v := r.URL.Query()
	v.Set("from", first.Format("2006-01-02"))
	v.Set("to", last.Format("2006-01-02"))
	v.Set("bucket", "day")
	v.Del("daily")
	v.Del("compare")
	r2 := r.Clone(r.Context())
	r2.URL = &url.URL{Path: r.URL.Path, RawQuery: v.Encode()}
	ask := a.parse(w, r2, site, revenue)
	if ask == nil {
		return
	}
	loc := ask.Loc
	today := startOfDay(a.Now(), loc)
	monthStart := time.Date(first.Year(), first.Month(), 1, 0, 0, 0, 0, loc)
	monthEnd := monthStart.AddDate(0, 1, 0)
	hi := monthEnd
	if tomorrow := today.AddDate(0, 0, 1); tomorrow.Before(hi) {
		hi = tomorrow
	}
	lo := monthStart
	if today.Before(lo) {
		lo = today
	}
	lo = lo.AddDate(0, 0, -7*usualWeeks)

	// The days (with the baseline weeks before them and the day's own
	// sources and pages), and the hours: two reads for the whole month.
	days := ask.Params
	days.From, days.To, days.Daily, days.Bucket = lo.UTC(), hi.UTC(), true, "day"
	days.Sales, days.NewReferrers = false, 5
	res, err := a.cachedReport(r2, q, days)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	var hours *query.Result
	if monthStart.Before(hi) {
		hp := ask.Params
		hp.From, hp.To, hp.Daily, hp.Bucket, hp.Sales = monthStart.UTC(), hi.UTC(), false, "hour", hp.Revenue
		if hours, err = a.cachedReport(r2, q, hp); err != nil {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	byDay := map[string]int64{}
	for _, pt := range res.Series {
		byDay[pt.T[:10]] = pt.Visitors
	}
	perDay := map[string]query.Day{}
	for _, d := range res.Days {
		perDay[d.Date] = d
	}
	rev := map[string]int64{}
	for _, pt := range res.Series {
		if pt.Revenue != 0 {
			rev[pt.T[:10]] += pt.Revenue
		}
	}
	yesterday := today.AddDate(0, 0, -1)
	out := make([]calDay, 0, 31)
	for d := monthStart; d.Before(monthEnd); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		cd := calDay{Day: key, Visitors: byDay[key], Revenue: rev[key], Usual: usualOf(byDay, d, yesterday)}
		if dd, ok := perDay[key]; ok {
			cd.Source, cd.Page = topValue(dd.Dims["channel"]), topValue(dd.Dims["entry_page"])
		}
		out = append(out, cd)
	}
	var list []moments.Moment
	if hours != nil {
		out, list = hoursOf(out, hours, loc, res.Money != nil)
	}
	list = append(list, spikesIn(res, monthStart, loc)...)
	for _, n := range res.NewReferrers {
		if member && n.First >= first.Format("2006-01-02") && n.First <= last.Format("2006-01-02") {
			list = append(list, moments.Moment{T: n.First + "T00:00", Kind: "new_referrer", Referrer: n.Referrer, Visitors: n.Visitors})
		}
	}
	if member { // a share link tells numbers and, when allowed, notes: not what the owner's milestones or crawlers saw
		list = append(list, a.calendarFirsts(r2, q, ask)...)
		list = append(list, a.calendarMilestones(r2, site, first, last)...)
	}
	list = moments.Dedupe(list)
	moments.Sort(list)

	body := map[string]any{
		"month": first.Format("2006-01"), "timezone": ask.TZ, "today": today.Format("2006-01-02"),
		"days": out, "moments": list, "filtered": len(ask.Params.Filters) > 0,
		"weekday_avg": weekdayAverages(out, today),
	}
	if res.Money != nil {
		body["currency"], body["exponent"] = res.Money.Currency, res.Money.Exponent
	}
	if notes && a.modulesOf(r2, site).Has("notes") {
		body["notes"] = a.calendarNotes(r2, site, first, last, member)
	} else {
		body["notes"] = []sqlite.Annotation{}
	}
	w.Header().Set("Cache-Control", "private, max-age=30")
	writeJSON(w, http.StatusOK, body)
}

// calendarNotes are the month's notes and plans; the author's name only for
// someone signed in.
func (a *API) calendarNotes(r *http.Request, site string, first, last time.Time, withAuthor bool) []sqlite.Annotation {
	list, err := a.Ctl.Annotations(r.Context(), site, first.Format("2006-01-02"), last.Format("2006-01-02"))
	if err != nil {
		return []sqlite.Annotation{}
	}
	if !withAuthor {
		for i := range list {
			list[i].Author = ""
		}
	}
	return list
}

// usualOf is what a weekday brings: the mean of the same weekday over the
// four weeks before it, or before yesterday for a day that has not come. Weeks
// the site had no visitors in at all are not counted: it did not exist yet.
func usualOf(byDay map[string]int64, d, yesterday time.Time) int64 {
	ref := d.AddDate(0, 0, -7)
	for ref.After(yesterday) {
		ref = ref.AddDate(0, 0, -7)
	}
	var sum int64
	n := 0
	for k := 0; k < usualWeeks; k++ {
		v, ok := byDay[ref.AddDate(0, 0, -7*k).Format("2006-01-02")]
		if ok && v > 0 {
			sum += v
			n++
		}
	}
	if n == 0 {
		return 0
	}
	return (sum + int64(n)/2) / int64(n)
}

func topValue(rows []query.Row) string {
	if len(rows) == 0 {
		return ""
	}
	return rows[0].Value
}

// hoursOf puts each day's 24 hours on its cell, and finds what the hours
// tell: the sales, with the hour they came, and the day's one surge.
func hoursOf(days []calDay, res *query.Result, loc *time.Location, money bool) ([]calDay, []moments.Moment) {
	at := map[string]int{}
	for i := range days {
		at[days[i].Day] = i
	}
	values := make([]int64, len(res.Series))
	for i, pt := range res.Series {
		values[i] = pt.Visitors
		if d, ok := at[pt.T[:10]]; ok && len(pt.T) >= 13 {
			if days[d].Hours == nil {
				days[d].Hours = make([]int64, 24)
			}
			if h := int(pt.T[11]-'0')*10 + int(pt.T[12]-'0'); h >= 0 && h < 24 {
				days[d].Hours[h] = pt.Visitors
			}
		}
	}
	var out []moments.Moment
	if money {
		for _, s := range res.Sales {
			out = append(out, moments.Moment{T: s.T, Kind: "sale", Count: s.Count, Amount: s.Amount, Channel: s.Channel})
			if d, ok := at[s.T[:10]]; ok {
				days[d].Sales += s.Count
			}
		}
	}
	best := map[string]moments.Spike{}
	for _, s := range moments.Spikes(values, 0, 24, 7, 3, 10) {
		if s.Quiet {
			continue
		}
		day := res.Series[s.I].T[:10]
		if b, ok := best[day]; !ok || s.Factor > b.Factor {
			best[day] = s
		}
	}
	for _, s := range best {
		out = append(out, moments.Moment{T: res.Series[s.I].T, Kind: "surge", Visitors: values[s.I], Factor: moments.Round(s.Factor)})
	}
	return days, out
}

// spikesIn is the days of the month that ran at three times their usual
// or more (new traffic told by its count alone).
func spikesIn(res *query.Result, monthStart time.Time, loc *time.Location) []moments.Moment {
	values := make([]int64, len(res.Series))
	start := len(res.Series)
	for i, pt := range res.Series {
		values[i] = pt.Visitors
		if start == len(res.Series) {
			if at, err := time.ParseInLocation("2006-01-02T15:04", pt.T, loc); err == nil && !at.Before(monthStart) {
				start = i
			}
		}
	}
	var out []moments.Moment
	for _, s := range moments.Spikes(values, start, 1, 7, 3, 10) {
		m := moments.Moment{T: res.Series[s.I].T, Kind: "spike", Visitors: values[s.I]}
		if !s.Quiet {
			m.Factor = moments.Round(s.Factor)
		}
		out = append(out, m)
	}
	return out
}

// calendarFirsts is the first AI assistant visit in the month, when the
// crawlers module is on.
func (a *API) calendarFirsts(r *http.Request, q *query.Q, ask *asked) []moments.Moment {
	var out []moments.Moment
	for _, m := range a.firstsOf(r, q, ask.Params) {
		if m.Kind == "ai" {
			out = append(out, m)
		}
	}
	return out
}

// calendarMilestones are the milestones reached in the month, their family
// only where it may be shown.
func (a *API) calendarMilestones(r *http.Request, site string, first, last time.Time) []moments.Moment {
	var out []moments.Moment
	if on, err := a.Ctl.MilestonesOn(r.Context(), site); err != nil || !on {
		return nil
	}
	list, _, err := a.visibleMilestones(r, site)
	if err != nil {
		return nil
	}
	from, to := first.Format("2006-01-02"), last.Format("2006-01-02")
	for _, m := range list {
		if m.Day >= from && m.Day <= to {
			out = append(out, moments.Moment{T: m.Day + "T00:00", Kind: "milestone", Family: m.Kind, Step: m.Step, Value: m.Value, Currency: m.Currency})
		}
	}
	return out
}

// weekdayAverages is the mean visitors of each weekday (Sunday first) over
// the month's finished days.
func weekdayAverages(days []calDay, today time.Time) [7]int64 {
	var sum, n [7]int64
	for _, d := range days {
		t, err := time.Parse("2006-01-02", d.Day)
		if err != nil || !t.Before(today) {
			continue
		}
		sum[t.Weekday()] += d.Visitors
		n[t.Weekday()]++
	}
	var out [7]int64
	for i := range out {
		if n[i] > 0 {
			out[i] = (sum[i] + n[i]/2) / n[i]
		}
	}
	return out
}
