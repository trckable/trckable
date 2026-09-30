package api

import (
	"net/http"
	"time"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/query"
)

// A share card of one site's numbers, drawn here: the dashboard's Share
// dialog shows it and downloads it, so preview and file are one picture.
//
//	GET /api/v1/sites/{site}/card
//	t        spotlight | leaderboard | dashboard (default spotlight)
//	period   24h | 7d | 30d (default 7d)
//	metric   visitors | pageviews | revenue (default visitors)
//	theme    dark | light
//	accent   #rrggbb
//	format   png (default) | json: the numbers in words and a post's text
//
// Only totals, top pages and a chart: never a visitor. Revenue is in a card
// only where the report would show it to this reader (the module on, a
// payment provider connected); asked for anywhere else it is visitors.

// cardRenders caps the pictures drawn at once, so a burst of previews
// cannot take the server's CPU.
var cardRenders = make(chan struct{}, 2)

// cardNumbers is what the cards and the post say.
type cardNumbers struct {
	Metric    string `json:"metric"`
	Big       string `json:"big"`
	Label     string `json:"label"`
	Foot      string `json:"foot"`
	Revenue   bool   `json:"revenue"` // revenue may be picked
	HasData   bool   `json:"has_data"`
	Post      string `json:"post"`
	rows      []cards.Item
	series    []float64
	domain    string
	visitors  int64
	pageviews int64
	money     string
}

func (a *API) shareCard(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	v := r.URL.Query()
	n, ok := a.cardRead(w, r, q, r.PathValue("site"), cardPeriodOf(v.Get("period")), v.Get("metric"))
	if !ok {
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=30")
	if v.Get("format") == "json" {
		writeJSON(w, http.StatusOK, n)
		return
	}
	_, theme := cards.ThemeOf(v.Get("theme"))
	spec := cards.Spec{
		Template: cardTemplateOf(v.Get("t")), Theme: theme, Accent: v.Get("accent"),
		Domain: n.domain, Big: n.Big, Label: n.Label, Foot: n.Foot, Series: n.series,
	}
	if spec.Template == "leaderboard" {
		spec.Label, spec.Rows = cardWords.topPages, n.rows
		spec.Big = cardWords.noVisits
	}
	select {
	case cardRenders <- struct{}{}:
	case <-r.Context().Done():
		return
	}
	png, err := spec.PNG()
	<-cardRenders
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "image/png")
	_, _ = w.Write(png)
}

// cardRead reads the period's report the way the dashboard does, and turns
// it into the card's words.
func (a *API) cardRead(w http.ResponseWriter, r *http.Request, q *query.Q, site string, p cardPeriod, metric string) (cardNumbers, bool) {
	si, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return cardNumbers{}, false
	}
	loc, err := time.LoadLocation(si.Timezone)
	if err != nil {
		loc = time.UTC
	}
	now := a.Now().In(loc)
	today := now.Format("2006-01-02")
	ask := r.Clone(r.Context())
	ask.URL.RawQuery = "from=" + now.AddDate(0, 0, 1-p.days).Format("2006-01-02") + "&to=" + today
	parsed := a.parse(w, ask, site, true)
	if parsed == nil {
		return cardNumbers{}, false
	}
	params := parsed.Params
	if p.hours > 0 {
		// The last full hours up to this one: the hour buckets of a day and
		// a bit, cut to exactly 24 of them.
		end := now.Truncate(time.Hour).Add(time.Hour)
		params.From, params.To, params.Bucket = end.Add(-time.Duration(p.hours)*time.Hour).UTC(), end.UTC(), "hour"
	}
	res, err := a.cachedReport(ask, q, params)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return cardNumbers{}, false
	}
	return cardWordsOf(res, si.Domain, p, metric), true
}

func cardWordsOf(res *query.Result, domain string, p cardPeriod, metric string) cardNumbers {
	n := cardNumbers{
		domain: domain, visitors: res.KPIs.Visitors, pageviews: res.KPIs.Pageviews,
		Revenue: res.Money != nil, HasData: res.KPIs.Visitors > 0, Foot: p.label,
	}
	if res.Money != nil {
		n.money = money(res.Money.Revenue, res.Money.Currency, res.Money.Exponent)
	}
	// Anything not allowed or not known is visitors: revenue never slips in.
	n.Metric = "visitors"
	if metric == "pageviews" || (metric == "revenue" && n.Revenue) {
		n.Metric = metric
	}
	for _, pt := range res.Series {
		n.series = append(n.series, float64(pointOf(pt, n.Metric)))
	}
	switch n.Metric {
	case "revenue":
		n.Big, n.Label = n.money, cardWords.revenue
	case "pageviews":
		n.Big, n.Label = number(n.pageviews), cardWords.pageviews
	default:
		n.Big, n.Label = number(n.visitors), cardWords.visitors
	}
	top := res.Dims["entry_page"]
	for _, row := range top {
		if len(n.rows) == cards.MaxRows {
			break
		}
		if row.Value == "" || top[0].Visitors == 0 {
			continue
		}
		n.rows = append(n.rows, cards.Item{Name: row.Value, Value: number(row.Visitors), Share: float64(row.Visitors) / float64(top[0].Visitors)})
	}
	n.Post = cardPost(n, p)
	return n
}

func pointOf(pt query.Point, metric string) int64 {
	switch metric {
	case "revenue":
		return pt.Revenue
	case "pageviews":
		return pt.Pageviews
	}
	return pt.Visitors
}
