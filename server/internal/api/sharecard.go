package api

import (
	"context"
	"fmt"
	"image"
	"math"
	"net/http"
	"net/url"
	"time"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/query"
)

// A share card of one site's numbers, drawn here: the dashboard's Share
// dialog shows it and downloads it, so preview and file are one picture.
//
//	GET /api/v1/sites/{site}/card
//	t        overview | leaderboard (default overview)
//	period   24h | 7d | 30d | all | custom (default 7d); custom takes from and to (YYYY-MM-DD). A period ends on the last full day or hour
//	compare  1: the change against the period just before, in a pill (off by default; not for all time)
//	metric   visitors | pageviews | engaged | revenue (default visitors)
//	stats    up to three small numbers under the chart, comma-separated (see cardStatIDs); default engaged,avgtime,country
//	shape    link | square | story | wide: the picture's size (cards.Formats; default link, 1200 × 630)
//	theme    dark | light
//	accent   #rrggbb
//	format   png (default) | json: the numbers in words and a post's text
//
// Only totals, top pages, a chart and the top country, page or source: never a visitor. Revenue is in a card
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
	change    string // the pick against the period before: "+12%", "" when there is none
	vs        string // what it is against ("previous 30 days"), said after the change
	dir       int
	stats     []cards.Stat
	domain    string
	visitors  int64
	pageviews int64
	engaged   int64
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
	n, ok := a.cardRead(w, r, q, r.PathValue("site"), v, tpl == "overview" && v.Get("format") != "json")
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
		Template: tpl, Format: cards.FormatOf(v.Get("shape")).ID, Theme: theme, Accent: v.Get("accent"),
		Domain: n.domain, Big: n.Big, Label: n.Label, Foot: n.Foot, Series: n.series,
		Change: n.change, Dir: n.dir, Stats: n.stats,
		NoBrand: a.HidesBrand(r.Context(), r.PathValue("site")),
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
func (a *API) cardRead(w http.ResponseWriter, r *http.Request, q *query.Q, site string, v url.Values, overview bool) (cardNumbers, bool) {
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
	p := resolvePeriod(v.Get("period"), v.Get("from"), v.Get("to"), now, time.Unix(si.CreatedAt, 0), v.Get("compare") == "1")
	ask := r.Clone(r.Context())
	if p.hours > 0 {
		ask.URL.RawQuery = "from=" + now.AddDate(0, 0, -1).Format("2006-01-02") + "&to=" + now.Format("2006-01-02")
	} else {
		ask.URL.RawQuery = "from=" + p.from.Format("2006-01-02") + "&to=" + p.to.Format("2006-01-02")
	}
	parsed := a.parse(w, ask, site, true)
	if parsed == nil {
		return cardNumbers{}, false
	}
	params := parsed.Params
	if p.hours > 0 {
		// The last 24 full hours: the hour now is still running, so it is left out.
		end := now.Truncate(time.Hour)
		params.From, params.To, params.Bucket = end.Add(-time.Duration(p.hours)*time.Hour).UTC(), end.UTC(), "hour"
	}
	res, err := a.cachedReport(ask, q, params)
	if err != nil {
		reportFail(w, err)
		return cardNumbers{}, false
	}
	n := cardWordsOf(res, si.Domain, p, v.Get("metric"))
	if overview {
		var prev *query.Result
		if p.vs != "" {
			// Only the totals of the period just before it, the same length: no money, goals or groups to scan.
			before := params
			before.From, before.To = previousStart(params.From, params.To, loc).UTC(), params.From
			if p.hours > 0 {
				before.From = params.From.Add(-params.To.Sub(params.From))
			}
			before.Revenue, before.Goals, before.Groups, before.PageGoals, before.Limit = false, false, nil, nil, 1
			if got, err := a.cachedReport(ask, q, before); err == nil {
				prev = got
			}
		}
		n.vs = p.vs
		n.overview(res, prev, v.Get("stats"), a.refIconOf)
	}
	return n, true
}

// overview sets what only the overview card draws: the change of the people
// against the period before (nothing when that had none), and the small
// numbers the reader picked (stats: see cardStatsOf).
func (n *cardNumbers) overview(res, prev *query.Result, stats string, icon func(host string) image.Image) {
	if before, now := compared(n.Metric, prev, n); prev != nil && before > 0 {
		d := float64(now-before) / float64(before) * 100
		n.dir = 1
		switch {
		case math.Round(d) < 0:
			n.dir = -1
		case math.Round(d) == 0:
			n.dir = 0
		}
		if n.dir != 0 {
			n.change = fmt.Sprintf("%+.0f%%", d)
			if n.vs != "" {
				n.change += " vs " + n.vs
			}
		}
	}
	// A number with nothing behind it (no engaged visit, no time on the site) is left off.
	for _, id := range cardStatsOf(stats, n.Metric) {
		if st, ok := n.stat(id, res, icon); ok {
			n.stats = append(n.stats, st)
		}
	}
}

// compared is the picked number before and now, for the metrics that have one before (revenue is not read for it).
func compared(metric string, prev *query.Result, n *cardNumbers) (before, now int64) {
	if prev == nil {
		return 0, 0
	}
	switch metric {
	case "visitors":
		return prev.KPIs.Visitors, n.visitors
	case "pageviews":
		return prev.KPIs.Pageviews, n.pageviews
	case "engaged":
		return engagedOf(prev.KPIs), n.engaged
	}
	return 0, 0
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
	return a.refIconOf(host)
}

// refIconOf is a site's favicon from the referrer-icon cache, nil when there
// is none (yet: an unknown host is fetched in the background, never waited for).
func (a *API) refIconOf(site string) image.Image {
	host, ok := refHost(site)
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
		domain: domain, visitors: res.KPIs.Visitors, pageviews: res.KPIs.Pageviews, engaged: engagedOf(res.KPIs),
		Revenue: res.Money != nil, HasData: res.KPIs.Visitors > 0, Foot: p.label,
	}
	if res.Money != nil {
		n.money = money(res.Money.Revenue, res.Money.Currency, res.Money.Exponent)
	}
	// Anything not allowed or not known is visitors: revenue never slips in.
	n.Metric = "visitors"
	if metric == "pageviews" || metric == "engaged" || (metric == "revenue" && n.Revenue) {
		n.Metric = metric
	}
	for _, pt := range res.Series {
		n.series = append(n.series, pointOf(pt, n.Metric))
	}
	switch n.Metric {
	case "revenue":
		n.Big, n.Label = n.money, cardWords.revenue
	case "pageviews":
		n.Big, n.Label = number(n.pageviews), cardWords.pageviews
	case "engaged":
		n.Big, n.Label = number(n.engaged), cardWords.engagedVisits
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

// pointOf is one chart bucket's number for the metric. Engaged visits are
// not counted per bucket: the bucket's visitors less its bounce rate, which
// draws the same shape.
func pointOf(pt query.Point, metric string) float64 {
	switch metric {
	case "revenue":
		return float64(pt.Revenue)
	case "pageviews":
		return float64(pt.Pageviews)
	case "engaged":
		return float64(pt.Visitors) * (1 - pt.Bounce)
	}
	return float64(pt.Visitors)
}

// engagedOf is the visits that did more than bounce.
func engagedOf(k query.KPIs) int64 {
	return int64(math.Round(float64(k.Sessions) * (1 - k.BounceRate)))
}
