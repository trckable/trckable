package api

import (
	"net/http"
	"time"

	"github.com/trckable/trckable/server/internal/query"
)

// Two small questions the dashboard asks after its report has drawn, so the
// report itself stays as fast as it was: a sparkline for each row a list
// shows, and what a stretch of today usually brings. Both read the same
// sessions as the report, with its filters, and neither carries a visitor.

// maxSparkDays keeps a sparkline a small chart: a month and a bit, never a
// year of days for twelve rows.
const maxSparkDays = 92

// sparks serves GET /api/v1/sites/{site}/sparks?dim=referrer&v=a&v=b&from=&to=
// (and f=… as in the report): each value's visitors per day, one scan for all
// of the rows.
func (a *API) sparks(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	ask := a.parse(w, r, r.PathValue("site"), false)
	if ask == nil {
		return
	}
	p := ask.Params
	if p.To.Sub(p.From) > maxSparkDays*24*time.Hour {
		fail(w, http.StatusBadRequest, "sparklines cover at most 92 days")
		return
	}
	got, err := q.Sparks(r.Context(), p, r.URL.Query().Get("dim"), r.URL.Query()["v"])
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=60")
	writeJSON(w, http.StatusOK, got)
}

// usual serves GET /api/v1/sites/{site}/usual?from=&to=: the visitors of one
// day (today so far, or a whole day) beside the average of the same stretch on
// the same weekday over the four weeks before.
func (a *API) usual(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	ask := a.parse(w, r, r.PathValue("site"), false)
	if ask == nil {
		return
	}
	p := ask.Params
	if p.To.Sub(p.From) > 26*time.Hour { // a day (a long one at a clock change), not a range
		fail(w, http.StatusBadRequest, "usual is about one day")
		return
	}
	// Today so far is set against the same hours of the days before, not against whole days.
	if now := a.Now(); now.Before(p.To) {
		p.To = now.UTC()
	}
	p.Bucket = "day"
	got, err := q.Usual(r.Context(), p, query.MaxUsualWeeks)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=30")
	writeJSON(w, http.StatusOK, got)
}
