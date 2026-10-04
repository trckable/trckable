package api

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/query"
)

// Report serves GET /api/v1/sites/{site}/report
//
//	from, to   YYYY-MM-DD in the site's timezone, inclusive (default: last 30 days)
//	bucket     hour | day | week | month (default: picked from the range length)
//	compare    previous | year | custom (cfrom, cto) | none (default none)
//	f          filters, repeatable: f=channel:Search&f=country:DE (is). f=country!:US is "is not".
//	           The same dimension twice means any of: f=country:DE&f=country:AT
//	segment    a saved segment's id: its filters are added to the f ones
//	daily      1 = include per-day data for the scrubber
//	deep       1 = also break down exit pages, regions, cities, languages, browser versions and screens (Full mode)
//	tz         override the site's timezone
func (a *API) report(w http.ResponseWriter, r *http.Request) {
	a.reportFor(w, r, r.PathValue("site"), true)
}

// asked is one parsed report request: the query parameters turned into
// everything both the JSON report and the CSV export need. They share it so
// that an export can never quietly answer a different question than the page
// it was taken from.
type asked struct {
	Params query.Params
	Prev   *query.Params // the comparison period, if one was asked for
	Loc    *time.Location
	From   time.Time // local midnight, inclusive
	To     time.Time // local midnight, exclusive
	TZ     string
	Bucket string
	Live   bool // the range includes today
}

// parse reads the query parameters. On a bad request it writes the error and
// returns nil, so callers can simply return.
func (a *API) parse(w http.ResponseWriter, r *http.Request, siteID string, allowRevenue bool) *asked {
	si, err := a.Ctl.SiteInfo(r.Context(), siteID)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return nil
	}
	v := r.URL.Query()
	tzName := si.Timezone
	if t := v.Get("tz"); t != "" {
		tzName = t
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil {
		fail(w, http.StatusBadRequest, "unknown timezone")
		return nil
	}
	today := a.Now().In(loc)
	from, to, err := dateRange(v.Get("from"), v.Get("to"), today)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return nil
	}
	filters, err := a.filtersOf(r.Context(), siteID, v)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return nil
	}
	days := int(to.Sub(from).Hours()/24 + 0.5)
	bucket := v.Get("bucket")
	if bucket == "" {
		switch {
		case days <= 2:
			bucket = "hour"
		case days <= 120:
			bucket = "day"
		case days <= 730:
			bucket = "week"
		default:
			bucket = "month"
		}
	}
	params := query.Params{
		Site: siteID, From: startOfDay(from, loc).UTC(), To: startOfDay(to, loc).UTC(),
		TZ: tzName, Filters: filters, Bucket: bucket, Daily: v.Get("daily") == "1" && days <= 400,
		Deep:     v.Get("deep") == "1",
		Currency: si.Currency, Test: v.Get("payments") == "test",
		// Money and goals are read only while their modules are on. Set before
		// the comparison period is derived, so both halves match.
		Revenue: allowRevenue && a.moduleOn(r, siteID, "revenue"),
		Goals:   a.moduleOn(r, siteID, "goals"),
		// Which visit gets the credit. Both halves of a comparison use the
		// same model, so the two periods are read the same way.
		Attribution: attribution(v.Get("attr")),
		Groups:      contentGroups(r.Context(), a, siteID),
		SundayWeeks: sundayWeeks(r.Context(), a, siteID),
		PageGoals:   pageGoals(r.Context(), a, siteID),
	}

	var prev *query.Params
	switch v.Get("compare") {
	case "previous":
		p := params
		p.From, p.To = params.From.Add(-to.Sub(from)), params.From
		p.Daily = false
		prev = &p
	case "year":
		p := params
		p.From, p.To = startOfDay(from.AddDate(-1, 0, 0), loc).UTC(), startOfDay(to.AddDate(-1, 0, 0), loc).UTC()
		p.Daily = false
		prev = &p
	case "custom":
		cf, ct, err := dateRange(v.Get("cfrom"), v.Get("cto"), today)
		if err != nil {
			fail(w, http.StatusBadRequest, "compare range: "+err.Error())
			return nil
		}
		p := params
		p.From, p.To, p.Daily = startOfDay(cf, loc).UTC(), startOfDay(ct, loc).UTC(), false
		prev = &p
	}

	return &asked{
		Params: params, Prev: prev, Loc: loc, From: from, To: to,
		TZ: tzName, Bucket: bucket,
		Live: !to.Before(startOfDay(today, loc)),
	}
}

// reportFor builds the report for one site. allowRevenue is how a public share
// hides money: not by leaving it out of the page, but by never asking for it,
// so the number is not in the answer at all.
func (a *API) reportFor(w http.ResponseWriter, r *http.Request, siteID string, allowRevenue bool) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	ask := a.parse(w, r, siteID, allowRevenue)
	if ask == nil {
		return
	}
	params, prev, loc, live := ask.Params, ask.Prev, ask.Loc, ask.Live
	from, to, tzName, bucket := ask.From, ask.To, ask.TZ, ask.Bucket

	// The period, the one it is compared with and who is online now are
	// independent reads: they run side by side, so the report takes as long
	// as its slowest part rather than the sum of all three.
	var (
		wg       sync.WaitGroup
		pr       *query.Result
		prErr    error
		online   int64
		onlineOK bool
	)
	if prev != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			pr, prErr = a.cachedReport(r, q, *prev)
		}()
	}
	if live {
		wg.Add(1)
		go func() {
			defer wg.Done()
			n, err := q.Online(r.Context(), siteID, a.Now())
			online, onlineOK = n, err == nil
		}()
	}
	cur, err := a.cachedReport(r, q, params)
	wg.Wait()
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	out := map[string]any{
		"site": siteID, "timezone": tzName, "bucket": bucket, "attribution": params.Attribution,
		"from": from.Format("2006-01-02"), "to": to.AddDate(0, 0, -1).Format("2006-01-02"),
		"current": cur,
	}
	if prev != nil {
		if prErr != nil {
			fail(w, http.StatusBadRequest, prErr.Error())
			return
		}
		out["previous"] = pr
		out["previous_from"] = prev.From.In(loc).Format("2006-01-02")
		out["previous_to"] = prev.To.In(loc).AddDate(0, 0, -1).Format("2006-01-02")
	}
	if onlineOK {
		out["online"] = online
	}
	// What was turned away is a count of the whole site: under a filter it
	// would say something else, so it is not offered. Read outside the report
	// cache, which a flush every minute would not invalidate.
	if len(params.Filters) == 0 {
		if b, err := q.Bots(r.Context(), params); err == nil {
			out["bots"] = b
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// dateRange parses inclusive YYYY-MM-DD dates into [from, to+1d) at midnight
// in today's location. Defaults to the last 30 days including today.
func dateRange(fromS, toS string, today time.Time) (time.Time, time.Time, error) {
	loc := today.Location()
	day := func(t time.Time) time.Time { return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc) }
	to := day(today)
	from := to.AddDate(0, 0, -29)
	var err error
	if toS != "" {
		if to, err = time.ParseInLocation("2006-01-02", toS, loc); err != nil {
			return from, to, fmt.Errorf("bad to date %q", toS)
		}
	}
	if fromS != "" {
		if from, err = time.ParseInLocation("2006-01-02", fromS, loc); err != nil {
			return from, to, fmt.Errorf("bad from date %q", fromS)
		}
	}
	if from.After(to) {
		return from, to, fmt.Errorf("from is after to")
	}
	if to.Sub(from) > 20*366*24*time.Hour {
		return from, to, fmt.Errorf("range longer than 20 years")
	}
	return from, to.AddDate(0, 0, 1), nil
}

func startOfDay(t time.Time, loc *time.Location) time.Time {
	t = t.In(loc)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
}

// attribution reads the model a report asks for, defaulting to last touch —
// the visit that closed the sale, which is what most people mean by "where
// this customer came from".
func attribution(v string) string {
	if v == query.FirstTouch {
		return query.FirstTouch
	}
	return query.LastTouch
}

// contentGroups reads the site's sections. They are part of the report's
// cache key, so editing them shows the change at once.
func contentGroups(ctx context.Context, a *API, site string) []query.Group {
	c, err := a.Ctl.SiteConfig(ctx, site)
	if err != nil || len(c.Groups) == 0 {
		return nil
	}
	out := make([]query.Group, 0, len(c.Groups))
	for _, g := range c.Groups {
		out = append(out, query.Group{Name: g.Name, Path: g.Path})
	}
	return out
}

// sundayWeeks is the site's "Week starts on" setting: weekly buckets begin
// on Sunday when it says so.
func sundayWeeks(ctx context.Context, a *API, site string) bool {
	c, err := a.Ctl.SiteConfig(ctx, site)
	return err == nil && c.WeekStart == 0
}

// pageGoals are the site's "a page was seen" goals.
func pageGoals(ctx context.Context, a *API, site string) []query.Group {
	c, err := a.Ctl.SiteConfig(ctx, site)
	if err != nil || len(c.PageGoals) == 0 {
		return nil
	}
	out := make([]query.Group, 0, len(c.PageGoals))
	for _, g := range c.PageGoals {
		out = append(out, query.Group{Name: g.Name, Path: g.Path})
	}
	return out
}

func cacheKey(p query.Params) string {
	fs := make([]string, len(p.Filters))
	for i, f := range p.Filters {
		fs[i] = f.Dim + "|" + f.Op + "=" + f.Value
	}
	sort.Strings(fs)
	gs := make([]string, 0, len(p.Groups)+len(p.PageGoals))
	for _, g := range p.Groups {
		gs = append(gs, g.Name+"="+g.Path)
	}
	for _, g := range p.PageGoals {
		gs = append(gs, "goal:"+g.Name+"="+g.Path)
	}
	return fmt.Sprintf("%s|%d|%d|%s|%s|%v|%v|%v|%s|%s|%v|%v|%v|%s|%s|%v|%v|%d|%d|%d", p.Site, p.From.Unix(), p.To.Unix(), p.TZ, p.Bucket, p.SundayWeeks, p.Daily, p.Deep, strings.Join(fs, "&"), p.Currency, p.Test, p.Revenue, p.Goals, p.Attribution, strings.Join(gs, "&"), p.Sales, p.SalePages, p.Limit, p.Buyers, p.NewReferrers)
}
