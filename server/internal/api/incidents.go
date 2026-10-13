package api

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Every stretch a site was down or quiet (internal/server/incidents.go keeps
// the record). Read by the dashboard's incident page, the status panel's link
// and the chart's markers; a share link gets none of it.

const (
	incidentsDefault = 5
	incidentsMax     = 50
	// incidentsPeriod bounds what a period's totals and strips rest on.
	incidentsPeriod = 5000
)

// incidentSummary is a period's totals, with downtime cut to the period.
type incidentSummary struct {
	Count    int   `json:"count"`
	Seconds  int64 `json:"seconds"`   // time spent in incidents inside the period
	Lost     int64 `json:"lost"`      // the estimated visits of those that have an estimate
	LostSome bool  `json:"lost_some"` // at least one has
}

func summarize(list []sqlite.Incident, from, to int64) incidentSummary {
	s := incidentSummary{Count: len(list)}
	for _, x := range list {
		end := to
		if x.EndedAt != nil {
			end = min(*x.EndedAt, to)
		}
		s.Seconds += max(0, end-max(x.StartedAt, from))
		if x.Expected != nil {
			s.Lost += *x.Expected
			s.LostSome = true
		}
	}
	return s
}

func intParam(r *http.Request, name string) int64 {
	n, _ := strconv.ParseInt(r.URL.Query().Get(name), 10, 64)
	return max(n, 0)
}

// incidents is GET /api/v1/sites/{site}/incidents?limit=N&before=<started_at>,
// newest first. With from (and to, unix seconds, default now) it answers for
// that period: every incident that overlaps it, and the period's totals.
func (a *API) incidents(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	limit := int(intParam(r, "limit"))
	if limit <= 0 {
		limit = incidentsDefault
	}
	limit = min(limit, incidentsMax)
	from, to := intParam(r, "from"), intParam(r, "to")
	out := map[string]any{}
	if from > 0 {
		now := a.Now().Unix()
		if to == 0 || to > now {
			to = now
		}
		list, err := a.Ctl.Incidents(r.Context(), site, incidentsPeriod, 0, from, to)
		if err != nil {
			fail(w, http.StatusInternalServerError, "could not read the incidents")
			return
		}
		out["summary"] = summarize(list, from, to)
		out["incidents"] = list
		w.Header().Set("Cache-Control", "private, no-store")
		writeJSON(w, http.StatusOK, out)
		return
	}
	list, err := a.Ctl.Incidents(r.Context(), site, limit+1, intParam(r, "before"), 0, 0)
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the incidents")
		return
	}
	// One more than asked for says whether there is a next page.
	var next any
	if len(list) > limit {
		list = list[:limit]
		next = list[limit-1].StartedAt
	}
	out["incidents"], out["next_before"] = list, next
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, out)
}

// accountIncidents is GET /api/v1/incidents?days=N: the incidents of every
// site this person may see, for the all-sites page. Each carries its site.
func (a *API) accountIncidents(w http.ResponseWriter, r *http.Request) {
	days := intParam(r, "days")
	if days <= 0 {
		days = 30
	}
	days = min(days, 366)
	p := principalOf(r)
	from := a.Now().Unix() - days*86400
	list, err := a.Ctl.AccountIncidents(r.Context(), p.account, from, incidentsPeriod)
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the incidents")
		return
	}
	out := make([]sqlite.Incident, 0, len(list))
	for _, x := range list {
		if p.sees(x.Site) {
			out = append(out, x)
		}
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, map[string]any{"incidents": out})
}

// incidentNote is PATCH /api/v1/sites/{site}/incidents/{id}: the note that
// says why ("Hosting migration"). Viewers and API keys cannot (authed).
func (a *API) incidentNote(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Note string `json:"note"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	x, err := a.Ctl.SetIncidentNote(r.Context(), r.PathValue("site"), r.PathValue("id"), in.Note)
	switch {
	case errors.Is(err, auth.ErrNotFound):
		fail(w, http.StatusNotFound, "incident not found")
	case err != nil:
		fail(w, http.StatusInternalServerError, "could not save the note")
	default:
		writeJSON(w, http.StatusOK, x)
	}
}
