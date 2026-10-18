package api

// The team overview: one row for each site the caller may see, about today in
// the site's own day. Every number is read from the same place as the site's
// own dashboard, and a number the server cannot stand behind is left out: no
// usual before two weeks of history, no revenue without payments, no source
// without a visit.

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/fx"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

type teamRow struct {
	ID string `json:"id"`
	// Today is the site's visitors since its day began; it is the last of Series.
	Today int64 `json:"today"`
	// Usual is the mean of the same stretch of the day (midnight to now) on the same weekday over the weeks before, when at least two such weeks exist.
	Usual *float64 `json:"usual,omitempty"`
	// Series is visitors for each of the last seven days, oldest first.
	Series    []int64 `json:"series"`
	Online    int64   `json:"online"`
	TopSource string  `json:"top_source,omitempty"`
	// Revenue is today's net revenue in minor units, only when something was paid.
	Revenue  *int64 `json:"revenue,omitempty"`
	Currency string `json:"currency"`
	Exponent int    `json:"exponent"`
	Error    string `json:"error,omitempty"`
}

// minUsualWeeks is how many past weeks a "usual" needs before it is told.
const minUsualWeeks = 2

func (a *API) team(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	sites, err := a.Ctl.ListSites(r.Context(), principalOf(r).account)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	sites = visible(principalOf(r), sites)
	ctx, cancel := context.WithTimeout(r.Context(), reportTimeout)
	defer cancel()
	out := make([]teamRow, len(sites))
	var wg sync.WaitGroup
	slots := make(chan struct{}, overviewReads)
	for i, si := range sites {
		wg.Add(1)
		go func() {
			defer wg.Done()
			select {
			case slots <- struct{}{}:
				defer func() { <-slots }()
			case <-ctx.Done():
				out[i] = teamRow{ID: si.ID, Series: []int64{}, Currency: si.Currency, Exponent: fx.Exponent(si.Currency), Error: overviewSlow}
				return
			}
			out[i] = a.teamRow(ctx, r, q, si)
		}()
	}
	wg.Wait()
	writeJSON(w, http.StatusOK, map[string]any{"sites": out})
}

// teamRow reads one site's day in its own timezone and currency.
func (a *API) teamRow(ctx context.Context, r *http.Request, q *query.Q, si sqlite.SiteRow) teamRow {
	row := teamRow{ID: si.ID, Series: []int64{}, Currency: si.Currency, Exponent: fx.Exponent(si.Currency)}
	loc, err := time.LoadLocation(si.Timezone)
	if err != nil {
		loc = time.UTC
	}
	now := a.Now()
	day := startOfDay(now.In(loc), loc)
	tomorrow := day.AddDate(0, 0, 1)
	fail := func(err error) teamRow {
		row.Error = err.Error()
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			row.Error = overviewSlow
		}
		return row
	}
	week := query.Params{Site: si.ID, From: day.AddDate(0, 0, -6).UTC(), To: tomorrow.UTC(), TZ: loc.String(), Bucket: "day", Currency: si.Currency, SundayWeeks: sundayWeeks(ctx, a, si.ID)}
	sum, err := q.SiteSummary(ctx, week)
	if err != nil {
		return fail(err)
	}
	row.Series = sum.Series
	if n := len(sum.Series); n > 0 {
		row.Today = sum.Series[n-1]
	}
	if row.Today > 0 {
		today := week
		today.From, today.To = day.UTC(), tomorrow.UTC()
		if row.TopSource, err = q.TopSource(ctx, today); err != nil {
			return fail(err)
		}
	}
	if a.moduleOn(r, si.ID, "revenue") {
		paid := week
		paid.From, paid.To, paid.Revenue = day.UTC(), tomorrow.UTC(), true
		if s, err := q.SiteSummary(ctx, paid); err == nil && s.Revenue != nil && *s.Revenue > 0 {
			row.Revenue = s.Revenue
		}
	}
	sofar := week
	sofar.From, sofar.To = day.UTC(), now.UTC()
	if u, err := q.Usual(ctx, sofar, query.MaxUsualWeeks); err == nil && len(u.Weeks) >= minUsualWeeks && u.Average > 0 {
		row.Usual = &u.Average
	}
	row.Online, _ = q.Online(ctx, si.ID, now)
	return row
}
