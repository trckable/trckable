package api

import (
	"context"
	"fmt"
	"image"
	"math"
	"net/http"
	"time"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/query"
)

// A share card of one site's numbers, drawn here: the dashboard's Share
// dialog shows it and downloads it, so preview and file are one picture.
//
//	GET /api/v1/sites/{site}/card
//	t        overview | leaderboard (default overview)
//	period   24h | 7d | 30d (default 7d)
//	metric   visitors | pageviews | revenue (default visitors)
//	theme    dark | light
//	accent   #rrggbb
//	format   png (default) | json: the numbers in words and a post's text
//
// Only totals, top pages, a chart and the top country: never a visitor. Revenue is in a card
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
	change    string // the people against the period before: "+12%", "" when there is none
	dir       int
	stats     []cards.Stat
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
	tpl := cardTemplateOf(v.Get("t"))
	n, ok := a.cardRead(w, r, q, r.PathValue("site"), cardPeriodOf(v.Get("period")), v.Get("metric"), tpl == "overview" && v.Get("format") != "json")
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
		Template: tpl, Theme: theme, Accent: v.Get("accent"),
		Domain: n.domain, Big: n.Big, Label: n.Label, Foot: n.Foot, Series: n.series,
		Change: n.change, Dir: n.dir, Stats: n.stats,
	}
	if tpl == "overview" {
		spec.Icon = a.cardIcon(r.Context(), r.PathValue("site"), n.domain)
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
// it into the card's words; with overview, also the small numbers and the
// change against the period before.
func (a *API) cardRead(w http.ResponseWriter, r *http.Request, q *query.Q, site string, p cardPeriod, metric string, overview bool) (cardNumbers, bool) {
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
		reportFail(w, err)
		return cardNumbers{}, false
	}
	n := cardWordsOf(res, si.Domain, p, metric)
	if overview {
		// Only the totals of the period before: no money, goals or groups to scan.
		before := fairPrevious(params, a.Now())
		before.Revenue, before.Goals, before.Groups, before.PageGoals, before.Limit = false, false, nil, nil, 1
		if prev, err := a.cachedReport(ask, q, before); err == nil {
			n.overview(res, prev)
		} else {
			n.overview(res, nil)
		}
	}
	return n, true
}

// overview sets what only the overview card draws: the change of the people
// against the period before (nothing when that had none), and the engaged
// visits, the average time and the top country.
func (n *cardNumbers) overview(res, prev *query.Result) {
	if prev != nil && prev.KPIs.Visitors > 0 && n.Metric == "visitors" {
		d := float64(n.visitors-prev.KPIs.Visitors) / float64(prev.KPIs.Visitors) * 100
		n.dir = 1
		switch {
		case math.Round(d) < 0:
			n.dir = -1
		case math.Round(d) == 0:
			n.dir = 0
		}
		if n.dir != 0 {
			n.change = fmt.Sprintf("%+.0f%%", d)
		}
	}
	// A number with nothing behind it (no engaged visit, no time on the site) is left off.
	k := res.KPIs
	if engaged := int64(math.Round(float64(k.Sessions) * (1 - k.BounceRate))); engaged > 0 {
		n.stats = append(n.stats, cards.Stat{Value: number(engaged), Label: cardWords.engaged})
	}
	if k.AvgSessionS >= 0.5 {
		n.stats = append(n.stats, cards.Stat{Value: duration(k.AvgSessionS), Label: cardWords.avgTime})
	}
	if top := res.Dims["country"]; len(top) > 0 && top[0].Visitors > 0 {
		if name := countryName(top[0].Value); name != "" {
			n.stats = append(n.stats, cards.Stat{Value: name, Label: cardWords.topCountry, Flag: top[0].Value})
		}
	}
}

// cardIcon is the picture for the card's tile: the icon the owner set for
// the site, else the site's own favicon from the cache the referrer icons
// use (fetched there, never here: the card does not wait for it, so the first
// card after a cold start has the initial and the next one the icon). nil is
// the initial in the tile.
func (a *API) cardIcon(ctx context.Context, site, domain string) image.Image {
	if _, data, err := a.Ctl.BrandIcon(ctx, site); err == nil {
		if img := cards.DecodeIcon(data); img != nil {
			return img
		}
	}
	host, ok := refHost(domain)
	if !ok {
		return nil
	}
	e, known := a.refIcons.get(host, a.Now())
	if !known {
		a.lookup(host)
		return nil
	}
	if e.typ == "" {
		return nil
	}
	return cards.DecodeIcon(e.data)
}

// duration is a session's length the way the dashboard writes it: 45s, 3m 12s.
func duration(s float64) string {
	sec := int64(math.Round(s))
	switch {
	case sec < 60:
		return fmt.Sprintf("%ds", sec)
	case sec < 3600:
		return fmt.Sprintf("%dm %02ds", sec/60, sec%60)
	}
	return fmt.Sprintf("%dh %02dm", sec/3600, sec%3600/60)
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
