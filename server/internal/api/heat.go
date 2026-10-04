package api

import (
	"net/http"
	"strconv"
	"time"
)

// heatAskViews is how many views one page has to have in a day before the
// dashboard offers the heatmaps module for it.
const heatAskViews = 100

// heat is one page's heatmap: where people click on it and how far down they
// read, at one window width. Counts per element, never a visitor.
//
//	path     the page, as the Pages list names it (required)
//	width    390 | 768 | 1280; the one with the most views when absent
//	from, to, tz   as the report; the filters do not apply, because nothing
//	               here is a visit to filter
//
// With the module off the route answers 404, like the module's other reads.
func (a *API) heat(w http.ResponseWriter, r *http.Request) {
	q, p, ok := a.params(w, r)
	if !ok {
		return
	}
	path := r.URL.Query().Get("path")
	if path == "" || path[0] != '/' || len(path) > 512 {
		fail(w, http.StatusBadRequest, "path must be a page of the site, starting with /")
		return
	}
	width, _ := strconv.Atoi(r.URL.Query().Get("width"))
	res, err := q.HeatFor(r.Context(), p, path, width)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=30")
	writeJSON(w, http.StatusOK, res)
}

// heatAsk says whether the heatmaps module is worth suggesting now: it is off,
// and one page had at least heatAskViews views today (the site's own day).
// The page is named so the card can say which. It reads page views that are
// already kept, so it costs nothing while the module is off.
//
//	{"ask": true, "path": "/pricing", "views": 134}
func (a *API) heatAsk(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	si, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	loc, err := time.LoadLocation(si.Timezone)
	if err != nil {
		loc = time.UTC
	}
	out := map[string]any{"ask": false}
	if !a.modulesOf(r, site).Has("heatmaps") {
		start := startOfDay(a.Now().In(loc), loc)
		path, views, err := q.HeatAsk(r.Context(), site, start.UTC(), start.AddDate(0, 0, 1).UTC(), heatAskViews)
		if err != nil {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
		if path != "" {
			out = map[string]any{"ask": true, "path": path, "views": views}
		}
	}
	w.Header().Set("Cache-Control", "private, max-age=300")
	writeJSON(w, http.StatusOK, out)
}
