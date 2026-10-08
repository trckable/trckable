package api

import (
	"net/http"
	"strings"

	"github.com/trckable/trckable/server/internal/event"
)

// charts is Full mode's chart grid: sources over time, new vs returning,
// page flow, and — with goals or payments — visit to sale and time to
// convert. It reads the same period, filters and modules as /report.
func (a *API) charts(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	ask := a.parse(w, r, r.PathValue("site"), true)
	if ask == nil {
		return
	}
	goal := strings.TrimSpace(r.URL.Query().Get("goal"))
	if len(goal) > 200 {
		fail(w, http.StatusBadRequest, "goal name too long")
		return
	}
	if n := event.NormGoal(goal); n != "" {
		goal = n
	}
	c, err := q.ChartsFor(r.Context(), ask.Params, goal)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, c)
}
