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
//	f          filters, repeatable: f=channel:Search&f=country:DE
//	daily      1 = include per-day data for the scrubber
//	deep       1 = also break down exit pages, regions and cities (Full mode)
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
	filters, err := parseFilters(v["f"])
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

	cur, err := a.cachedReport(r, q, params, live)
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
		pr, err := a.cachedReport(r, q, *prev, false)
		if err != nil {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
		out["previous"] = pr
		out["previous_from"] = prev.From.In(loc).Format("2006-01-02")
		out["previous_to"] = prev.To.In(loc).AddDate(0, 0, -1).Format("2006-01-02")
	}
	if live {
		if n, err := q.Online(r.Context(), siteID, a.Now()); err == nil {
			out["online"] = n
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// parseFilters turns repeated f=dim:value parameters into filters, rejecting
// anything outside the dimension whitelist.
func parseFilters(raw []string) ([]query.Filter, error) {
	var out []query.Filter
	for _, f := range raw {
		dim, val, ok := strings.Cut(f, ":")
		if !ok || !query.ValidDim(dim) || val == "" {
			return nil, fmt.Errorf("bad filter %q (use dim:value)", f)
		}
		out = append(out, query.Filter{Dim: dim, Value: val})
	}
	return out, nil
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

// ---- result cache ----

// Past ranges never change (sessions are immutable once written), so they are
// cached for minutes; ranges that include today for a few seconds, which
// keeps the dashboard instant while staying live.
type reportCache struct {
	mu  sync.Mutex
	max int
	m   map[string]cacheEntry
}

type cacheEntry struct {
	res  *query.Result
	exp  time.Time
	site string
}

func newReportCache(max int) *reportCache {
	return &reportCache{max: max, m: map[string]cacheEntry{}}
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
		fs[i] = f.Dim + "=" + f.Value
	}
	sort.Strings(fs)
	gs := make([]string, 0, len(p.Groups)+len(p.PageGoals))
	for _, g := range p.Groups {
		gs = append(gs, g.Name+"="+g.Path)
	}
	for _, g := range p.PageGoals {
		gs = append(gs, "goal:"+g.Name+"="+g.Path)
	}
	return fmt.Sprintf("%s|%d|%d|%s|%s|%v|%v|%s|%s|%v|%v|%v|%s|%s", p.Site, p.From.Unix(), p.To.Unix(), p.TZ, p.Bucket, p.Daily, p.Deep, strings.Join(fs, "&"), p.Currency, p.Test, p.Revenue, p.Goals, p.Attribution, strings.Join(gs, "&"))
}

func (a *API) cachedReport(r *http.Request, q *query.Q, p query.Params, live bool) (*query.Result, error) {
	key := cacheKey(p)
	now := a.Now()
	a.cache.mu.Lock()
	if e, ok := a.cache.m[key]; ok && now.Before(e.exp) {
		a.cache.mu.Unlock()
		return e.res, nil
	}
	a.cache.mu.Unlock()
	res, err := q.Report(r.Context(), p)
	if err != nil {
		return nil, err
	}
	ttl := 10 * time.Minute
	if live {
		ttl = 10 * time.Second
	}
	a.cache.mu.Lock()
	if len(a.cache.m) >= a.cache.max {
		for k, e := range a.cache.m { // evict expired, then arbitrary
			if now.After(e.exp) || len(a.cache.m) >= a.cache.max {
				delete(a.cache.m, k)
			}
			if len(a.cache.m) < a.cache.max*3/4 {
				break
			}
		}
	}
	a.cache.m[key] = cacheEntry{res: res, exp: now.Add(ttl), site: p.Site}
	a.cache.mu.Unlock()
	return res, nil
}

func (c *reportCache) purgeSite(site string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, e := range c.m {
		if e.site == site {
			delete(c.m, k)
		}
	}
}
