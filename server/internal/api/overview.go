package api

// The all-sites view: every site's period at a glance, for anyone running
// more than one. Each site is read in its own timezone and currency, so the
// row says what that site's own dashboard would say.

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/fx"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

type siteRow struct {
	ID        string  `json:"id"`
	Domain    string  `json:"domain"`
	Name      string  `json:"name"`
	Visitors  int64   `json:"visitors"`
	Pageviews int64   `json:"pageviews"`
	Bounce    float64 `json:"bounce_rate"`
	Previous  int64   `json:"previous_visitors"` // the period before, same length
	Series    []int64 `json:"series"`
	// The other cards' days, bucket for bucket with Series; bounce is each
	// bucket's rate and Sessions its weight when sites are added up.
	PageviewSeries []int64   `json:"pageview_series"`
	SessionSeries  []int64   `json:"session_series"`
	BounceSeries   []float64 `json:"bounce_series"`
	// What the period before had, for the change on each number.
	PreviousPageviews int64   `json:"previous_pageviews"`
	PreviousBounce    float64 `json:"previous_bounce_rate"`
	Online            int64   `json:"online"`
	// OnlineSeries is Online for each of the last 30 minutes, oldest first.
	OnlineSeries []int64 `json:"online_series"`
	Revenue      *int64  `json:"revenue,omitempty"`
	Currency     string  `json:"currency"`
	Exponent     int     `json:"exponent"`
	Error        string  `json:"error,omitempty"`
}

func (a *API) overview(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	switch days {
	case 7, 30, 90, 365:
	default:
		days = 30
	}
	bucket := "day"
	if days == 365 {
		bucket = "week"
	}
	sites, err := a.Ctl.ListSites(r.Context(), principalOf(r).account)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	sites = visible(principalOf(r), sites)
	// Sites are read side by side, a few at a time, and the whole view ends
	// at the report timeout: a site that is not read by then shows its error
	// instead of holding the page.
	ctx, cancel := context.WithTimeout(r.Context(), reportTimeout)
	defer cancel()
	out := make([]siteRow, len(sites))
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
				out[i] = siteRow{ID: si.ID, Domain: si.Domain, Name: si.Name, Currency: si.Currency, Exponent: fx.Exponent(si.Currency), Error: overviewSlow}
				return
			}
			out[i] = a.overviewRow(ctx, r, q, si, days, bucket)
		}()
	}
	wg.Wait()
	writeJSON(w, http.StatusOK, map[string]any{"days": days, "sites": out})
}

// overviewSlow is what a site's row says when its numbers did not arrive in time.
const overviewSlow = "took too long to load"

// overviewReads is how many sites the all-sites view reads at once.
const overviewReads = 3

// overviewRow reads one site's period, in its own timezone and currency.
func (a *API) overviewRow(ctx context.Context, r *http.Request, q *query.Q, si sqlite.SiteRow, days int, bucket string) siteRow {
	row := siteRow{ID: si.ID, Domain: si.Domain, Name: si.Name, Currency: si.Currency, Exponent: fx.Exponent(si.Currency)}
	loc, err := time.LoadLocation(si.Timezone)
	if err != nil {
		loc = time.UTC
	}
	now := a.Now().In(loc)
	to := startOfDay(now, loc).AddDate(0, 0, 1)
	from := to.AddDate(0, 0, -days)
	p := query.Params{Site: si.ID, From: from.UTC(), To: to.UTC(), TZ: loc.String(), Bucket: bucket, Currency: si.Currency,
		Revenue: a.moduleOn(r, si.ID, "revenue"), SundayWeeks: sundayWeeks(ctx, a, si.ID)}
	cur, err := q.SiteSummary(ctx, p)
	if err != nil {
		row.Error = err.Error()
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			row.Error = overviewSlow
		}
		return row
	}
	row.Visitors, row.Pageviews, row.Bounce, row.Series, row.Revenue = cur.Visitors, cur.Pageviews, cur.Bounce, cur.Series, cur.Revenue
	row.PageviewSeries, row.SessionSeries, row.BounceSeries = cur.PageviewSeries, cur.SessionSeries, cur.BounceSeries
	prev := p
	prev.From, prev.To, prev.Revenue = from.AddDate(0, 0, -days).UTC(), from.UTC(), false
	if ps, err := q.SiteSummary(ctx, prev); err == nil {
		row.Previous, row.PreviousPageviews, row.PreviousBounce = ps.Visitors, ps.Pageviews, ps.Bounce
	}
	row.Online, _ = q.Online(ctx, si.ID, a.Now())
	row.OnlineSeries, _ = q.OnlineSeries(ctx, si.ID, a.Now())
	return row
}
