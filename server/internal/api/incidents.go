package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

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
	// Paused is the time of the period the uptime check was paused: not looked
	// at, so neither up nor down, and out of the uptime share.
	Paused int64 `json:"paused,omitempty"`
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

// quietTracked says whether the site is busy enough for quiet spells to be
// recorded at all (server/incidents.go busyEnough: on average a visit an hour
// over the last four weeks, or over the time it has existed, at least a day).
// A quieter one has its down periods recorded only. nil when the analytics
// store is not ready or cannot tell.
func (a *API) quietTracked(ctx context.Context, site string, now time.Time) *bool {
	q := a.Query()
	if q == nil {
		return nil
	}
	var first *time.Time
	if err := q.DB.QueryRowContext(ctx, `SELECT min(start) FROM sessions WHERE site_id = ?`, site).Scan(&first); err != nil {
		return nil
	}
	yes := false
	if first == nil {
		return &yes
	}
	from := max(first.Unix(), now.Unix()-4*7*86400)
	if now.Unix()-from < 86400 {
		return &yes
	}
	var n int64
	if err := q.DB.QueryRowContext(ctx, `SELECT count(*) FROM sessions WHERE site_id = ? AND start >= ? AND start < ?`,
		site, time.Unix(from, 0).UTC(), now.UTC()).Scan(&n); err != nil {
		return nil
	}
	yes = float64(n) >= float64(now.Unix()-from)/3600
	return &yes
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
		sum := summarize(list, from, to)
		if sum.Paused, err = a.Ctl.PausedSeconds(r.Context(), site, from, to); err != nil {
			fail(w, http.StatusInternalServerError, "could not read the incidents")
			return
		}
		out["summary"] = sum
		if out["paused_spans"], err = a.Ctl.PauseSpans(r.Context(), site, from, to); err != nil {
			fail(w, http.StatusInternalServerError, "could not read the incidents")
			return
		}
		out["incidents"] = list
		if t := a.quietTracked(r.Context(), site, a.Now()); t != nil {
			out["quiet_tracked"] = *t
		}
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
	// Which of those sites are busy enough for quiet spells to be recorded.
	quiet := map[string]bool{}
	sites, _ := a.Ctl.ListSites(r.Context(), p.account)
	for _, s := range sites {
		if !p.sees(s.ID) {
			continue
		}
		if t := a.quietTracked(r.Context(), s.ID, a.Now()); t != nil {
			quiet[s.ID] = *t
		}
	}
	// The time each site's check was paused in the window, out of its uptime share.
	paused := map[string]int64{}
	now := a.Now().Unix()
	for _, s := range sites {
		if !p.sees(s.ID) {
			continue
		}
		if n, err := a.Ctl.PausedSeconds(r.Context(), s.ID, max(from, s.WatchedSince), now); err == nil && n > 0 {
			paused[s.ID] = n
		}
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, map[string]any{"incidents": out, "quiet_tracked": quiet, "paused": paused})
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

// probes is GET /api/v1/sites/{site}/probes: the last few looks at the site's
// homepage by the uptime probe, newest first, for the status panel.
func (a *API) probes(w http.ResponseWriter, r *http.Request) {
	list, err := a.Ctl.ProbeLog(r.Context(), r.PathValue("site"), 5)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"probes": list})
}
