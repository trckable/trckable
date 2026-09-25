package api

// The all-sites view: every site's period at a glance, for anyone running
// more than one. Each site is read in its own timezone and currency, so the
// row says what that site's own dashboard would say.

import (
	"net/http"
	"strconv"
	"time"

	"github.com/trckable/trckable/server/internal/fx"
	"github.com/trckable/trckable/server/internal/query"
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
	Online    int64   `json:"online"`
	Revenue   *int64  `json:"revenue,omitempty"`
	Currency  string  `json:"currency"`
	Exponent  int     `json:"exponent"`
	Error     string  `json:"error,omitempty"`
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
	out := make([]siteRow, 0, len(sites))
	for _, si := range sites {
		row := siteRow{ID: si.ID, Domain: si.Domain, Name: si.Name, Currency: si.Currency, Exponent: fx.Exponent(si.Currency)}
		loc, err := time.LoadLocation(si.Timezone)
		if err != nil {
			loc = time.UTC
		}
		now := a.Now().In(loc)
		to := startOfDay(now, loc).AddDate(0, 0, 1)
		from := to.AddDate(0, 0, -days)
		p := query.Params{Site: si.ID, From: from.UTC(), To: to.UTC(), TZ: loc.String(), Bucket: bucket, Currency: si.Currency,
			Revenue: a.moduleOn(r, si.ID, "revenue"), SundayWeeks: sundayWeeks(r.Context(), a, si.ID)}
		cur, err := q.SiteSummary(r.Context(), p)
		if err != nil {
			row.Error = err.Error()
			out = append(out, row)
			continue
		}
		row.Visitors, row.Pageviews, row.Bounce, row.Series, row.Revenue = cur.Visitors, cur.Pageviews, cur.Bounce, cur.Series, cur.Revenue
		prev := p
		prev.From, prev.To, prev.Revenue = from.AddDate(0, 0, -days).UTC(), from.UTC(), false
		if ps, err := q.SiteSummary(r.Context(), prev); err == nil {
			row.Previous = ps.Visitors
		}
		row.Online, _ = q.Online(r.Context(), si.ID, a.Now())
		out = append(out, row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"days": days, "sites": out})
}
