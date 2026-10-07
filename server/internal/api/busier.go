package api

import (
	"context"
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/busier"
	"github.com/trckable/trckable/server/internal/query"
)

// Whether the site is busier than usual (internal/busier), and why: Live
// asks once a minute while it is open. How the people online now compare with
// the same hour on past days, and who brings the difference. The work is only
// done when the count is far enough above the usual to say something.

// busierFresh is how long an answer is reused: asking again sooner changes nothing.
const busierFresh = 30 * time.Second

// busierPeople is how many values of each kind are compared with their usual.
const busierPeople = 20

type busierAnswer struct {
	Now      int64   `json:"now"`
	Baseline bool    `json:"baseline"` // false while the site has under a week of history
	Usual    float64 `json:"usual"`
	Low      float64 `json:"low"`
	High     float64 `json:"high"`
	Basis    string  `json:"basis,omitempty"` // weekday | week
	State    string  `json:"state"`           // busier | quieter | ""
	// Since is when the rise began (unix seconds); SinceCapped says it began
	// at or before that, the look back ending there.
	Since       int64                `json:"since,omitempty"`
	SinceCapped bool                 `json:"since_capped,omitempty"`
	Rest        int64                `json:"rest"` // extra people the named sources do not explain
	Why         []busier.Contributor `json:"why"`
}

type busierEntry struct {
	at  time.Time
	out *busierAnswer
}

type busierCache struct {
	mu sync.Mutex
	by map[string]busierEntry
}

func (c *busierCache) get(site string, now time.Time) *busierAnswer {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.by[site]
	if !ok || now.Sub(e.at) >= busierFresh || now.Before(e.at) {
		return nil
	}
	return e.out
}

func (c *busierCache) put(site string, now time.Time, out *busierAnswer) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.by == nil {
		c.by = map[string]busierEntry{}
	}
	c.by[site] = busierEntry{at: now, out: out}
}

func (a *API) busierNow(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	now := a.Now()
	w.Header().Set("Cache-Control", "private, no-store")
	if out := a.busier.get(site, now); out != nil {
		writeJSON(w, http.StatusOK, out)
		return
	}
	loc, _ := time.LoadLocation(a.Ctl.SiteZone(r.Context(), site))
	if loc == nil {
		loc = time.UTC
	}
	out, err := a.busierRead(r.Context(), q, site, now, loc)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.busier.put(site, now, out)
	writeJSON(w, http.StatusOK, out)
}

func (a *API) busierRead(ctx context.Context, q *query.Q, site string, now time.Time, loc *time.Location) (*busierAnswer, error) {
	online, err := q.Online(ctx, site, now)
	if err != nil {
		return nil, err
	}
	out := &busierAnswer{Now: online, Why: []busier.Contributor{}}
	first, err := q.BusierFirst(ctx, site)
	if err != nil {
		return nil, err
	}
	hours, basis := busier.Hours(now, first, loc)
	if len(hours) == 0 {
		return out, nil
	}
	samples, err := a.busierSamples(ctx, q, site, hours)
	if err != nil {
		return nil, err
	}
	out.Baseline, out.Basis = true, string(basis)
	out.Usual, out.Low, out.High = busier.Spread(samples)
	out.State = string(busier.Judge(online, out.Usual, true))
	if out.State == string(busier.Busier) {
		if err := a.busierWhy(ctx, q, site, now, hours, out); err != nil {
			return nil, err
		}
	}
	round := func(f float64) float64 { return math.Round(f*10) / 10 }
	out.Usual, out.Low, out.High = round(out.Usual), round(out.Low), round(out.High)
	return out, nil
}

func (a *API) busierSamples(ctx context.Context, q *query.Q, site string, hours []time.Time) ([]float64, error) {
	samples := make([]float64, len(hours))
	for i, h := range hours {
		var err error
		if samples[i], err = q.BusierHour(ctx, site, h); err != nil {
			return nil, err
		}
	}
	return samples, nil
}

// busierUsual is the usual for this hour and whether online is busier than
// it: the one rule surge alerts and Live share. A site with no usual yet is
// never busier.
func (a *API) busierUsual(ctx context.Context, q *query.Q, site string, now time.Time, loc *time.Location, online int64) (float64, bool, error) {
	first, err := q.BusierFirst(ctx, site)
	if err != nil {
		return 0, false, err
	}
	hours, _ := busier.Hours(now, first, loc)
	if len(hours) == 0 {
		return 0, false, nil
	}
	samples, err := a.busierSamples(ctx, q, site, hours)
	if err != nil {
		return 0, false, err
	}
	usual := busier.Median(samples)
	return usual, busier.Judge(online, usual, true) == busier.Busier, nil
}

// busierWhy fills in who brings the extra people and when the rise began.
func (a *API) busierWhy(ctx context.Context, q *query.Q, site string, now time.Time, hours []time.Time, out *busierAnswer) error {
	cur, err := q.BusierEntries(ctx, site, now.Add(-busier.Idle), now.Add(time.Millisecond), false)
	if err != nil {
		return err
	}
	var flat []busier.Entry
	for _, s := range cur {
		flat = append(flat, s...)
	}
	nowTally := busier.Tally(flat)
	var past []map[string]map[string]float64
	per := float64(time.Hour / (5 * time.Minute))
	for _, h := range hours {
		slices, err := q.BusierEntries(ctx, site, h, h.Add(time.Hour), true)
		if err != nil {
			return err
		}
		var all []busier.Entry
		for _, s := range slices {
			all = append(all, s...)
		}
		t := busier.Tally(all)
		for _, vals := range t {
			for v := range vals {
				vals[v] /= per
			}
		}
		past = append(past, t)
	}
	usual := busier.UsualOf(past)
	var groups []busier.Group
	for _, dim := range []string{busier.DimSource, busier.DimPage, busier.DimCountry, busier.DimCampaign} {
		groups = append(groups, busier.Group{Dim: dim, Now: busier.Biggest(nowTally[dim], busierPeople), Usual: usual[dim]})
	}
	out.Why = busier.Contributors(groups)
	out.Rest = busier.Rest(out.Now, out.Usual, groups)

	// When it began: the first minute of the unbroken stretch up to now at or
	// above the threshold. The look back is padded by the idle time so the
	// first counted minute already has its five.
	pad := int(busier.Idle / time.Minute)
	n := int(busier.Lookback/time.Minute) + pad
	seen, start, err := q.BusierMinutes(ctx, site, now, n)
	if err != nil {
		return err
	}
	series := busier.Online(seen)[pad-1:]
	minuteAt := start.Add(time.Duration(pad-1) * time.Minute)
	idx, capped, ok := busier.Since(series, busier.Threshold(out.Usual))
	if !ok { // busier by the exact count, not yet by the minute's: it began just now
		idx, capped = len(series)-1, false
	}
	out.Since = minuteAt.Add(time.Duration(idx) * time.Minute).Unix()
	out.SinceCapped = capped
	return nil
}
