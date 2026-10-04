package api

// The AI & Search tab: the visitors AI assistants sent, the robots that read
// the site, and for each page how often it was read against how many people it
// was sent. Google's own terms stay the Search Console endpoint's; this adds
// only the clicks per page, so a page Google ranks and AI ignores can be said.

import (
	"net/http"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/gsc"
	"github.com/trckable/trckable/server/internal/query"
)

// aiSearch serves GET /api/v1/sites/{site}/report/ai-search, with the report's
// own period and filters. It works with the crawlers module off: the robots'
// side is then empty, and says so.
func (a *API) aiSearch(w http.ResponseWriter, r *http.Request) {
	q, p, ok := a.params(w, r)
	if !ok {
		return
	}
	site := r.PathValue("site")
	opts := query.AIOptions{}
	var device string
	for _, f := range p.Filters {
		switch f.Dim {
		case "page", "entry_page":
			opts.Page = f.Value
		case "device":
			device = f.Value
		}
	}
	crawlersOn := a.moduleOn(r, site, "crawlers")
	if !crawlersOn {
		opts.Page = "" // nothing is read with the module off: no counters to narrow
	}
	if a.moduleOn(r, site, "search") {
		opts.Clicks = a.pageClicks(r, site, p, opts.Page, device)
	}
	rep, err := q.AISearch(r.Context(), p, opts)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=30")
	writeJSON(w, http.StatusOK, struct {
		*query.AISearch
		Crawlers bool `json:"crawlers"` // the module is on: robots are being recorded
		Google   bool `json:"google"`   // Search Console answered: pages carry its clicks
	}{rep, crawlersOn, opts.Clicks != nil})
}

// pageClicks is Google's clicks per page path for the period, from the hour's
// cache. Nil when Search Console is not connected or Google does not answer:
// the tab then simply has no clicks, and never fails for it.
func (a *API) pageClicks(r *http.Request, site string, p query.Params, page, device string) map[string]float64 {
	c, err := a.Ctl.SearchConsoleOf(r.Context(), site)
	if err != nil || c.Property == "" {
		return nil
	}
	loc, err := time.LoadLocation(p.TZ)
	if err != nil {
		loc = time.UTC
	}
	from := startOfDay(p.From.In(loc), loc)
	last := startOfDay(p.To.In(loc), loc).AddDate(0, 0, -1) // the period's end is exclusive; Google's is not
	q := gsc.Query{From: from, To: last, Dimension: "page", Page: page, Limit: 100}
	if device != "" {
		q.Device = strings.ToUpper(device)
	}
	body, _, err := a.searchBody(r.Context(), site, c, loc, q, from, last)
	if err != nil {
		return nil
	}
	rows, _ := body["rows"].([]gsc.Row)
	out := make(map[string]float64, len(rows))
	for _, row := range rows {
		out[row.Key] += row.Clicks
	}
	return out
}

// aiSeen serves GET /api/v1/sites/{site}/report/ai-seen: whether an AI
// assistant has ever sent a visitor and an AI crawler has ever read the site.
// It is what a guide asks before it speaks, once.
func (a *API) aiSeen(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	if !a.siteExists(w, r) {
		return
	}
	site := r.PathValue("site")
	visitor, crawler, err := q.AISeen(r.Context(), site)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"visitor": visitor, "crawler": crawler && a.moduleOn(r, site, "crawlers")})
}
