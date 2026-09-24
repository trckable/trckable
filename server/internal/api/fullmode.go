package api

import (
	"errors"
	"net/http"
	"slices"
	"strconv"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/modules"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Full-mode endpoints. Each belongs to a module: with the module off the
// route answers 404 and nothing runs.

// params parses the shared report selectors (range, timezone, filters) the
// way /report does, so every module sees the same period the dashboard shows.
func (a *API) params(w http.ResponseWriter, r *http.Request) (*query.Q, query.Params, bool) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return nil, query.Params{}, false
	}
	site := r.PathValue("site")
	si, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return nil, query.Params{}, false
	}
	v := r.URL.Query()
	tz := si.Timezone
	if t := v.Get("tz"); t != "" {
		tz = t
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		fail(w, http.StatusBadRequest, "unknown timezone")
		return nil, query.Params{}, false
	}
	from, to, err := dateRange(v.Get("from"), v.Get("to"), a.Now().In(loc))
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return nil, query.Params{}, false
	}
	filters, err := parseFilters(v["f"])
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return nil, query.Params{}, false
	}
	limit, _ := strconv.Atoi(v.Get("limit"))
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	return q, query.Params{
		Site: site, From: startOfDay(from, loc).UTC(), To: startOfDay(to, loc).UTC(),
		TZ: tz, Filters: filters, Limit: limit, Currency: si.Currency,
	}, true
}

func (a *API) heatmap(w http.ResponseWriter, r *http.Request) {
	if !a.needs(w, r, "rhythm") {
		return
	}
	q, p, ok := a.params(w, r)
	if !ok {
		return
	}
	h, err := q.Heatmap(r.Context(), p)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, h)
}

func (a *API) funnel(w http.ResponseWriter, r *http.Request) {
	if !a.needs(w, r, "funnels") {
		return
	}
	var in struct {
		Steps []query.Step `json:"steps"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	for i, s := range in.Steps {
		if s.Kind != "page" && s.Kind != "goal" {
			fail(w, http.StatusBadRequest, "step "+strconv.Itoa(i+1)+": kind must be page or goal")
			return
		}
		if s.Value == "" {
			fail(w, http.StatusBadRequest, "step "+strconv.Itoa(i+1)+" is empty")
			return
		}
	}
	q, p, ok := a.params(w, r)
	if !ok {
		return
	}
	steps, err := q.Funnel(r.Context(), p, in.Steps)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"steps": steps})
}

func (a *API) goalProps(w http.ResponseWriter, r *http.Request) {
	if !a.needs(w, r, "goals") {
		return
	}
	goal := r.URL.Query().Get("goal")
	if goal == "" {
		fail(w, http.StatusBadRequest, "goal is required")
		return
	}
	q, p, ok := a.params(w, r)
	if !ok {
		return
	}
	rows, err := q.GoalProps(r.Context(), p, goal)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"goal": goal, "properties": rows})
}

func (a *API) journey(w http.ResponseWriter, r *http.Request) {
	if !a.needs(w, r, "journeys") {
		return
	}
	// Visitor ids travel as base 36, the same short form /events and the live
	// stream use.
	visitor, err := strconv.ParseUint(r.PathValue("visitor"), 36, 64)
	if err != nil {
		fail(w, http.StatusBadRequest, "bad visitor id")
		return
	}
	q, p, ok := a.params(w, r)
	if !ok {
		return
	}
	j, err := q.Journey(r.Context(), p.Site, visitor, p.To)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	out := map[string]any{"journey": j}
	// What this visitor paid, when the revenue module is on.
	if a.Revenue != nil && a.modulesOf(r, p.Site).Has("revenue") {
		if facts, err := a.Revenue.Facts(r.Context(), p.Site, p.Currency, time.Unix(0, 0), p.To, false); err == nil {
			type pay struct {
				At       time.Time `json:"at"`
				Amount   int64     `json:"amount"`
				Refunded int64     `json:"refunded,omitempty"`
				Kind     string    `json:"kind"`
				Provider string    `json:"provider"`
			}
			paid := []pay{}
			for _, f := range facts {
				if f.Visitor == visitor {
					paid = append(paid, pay{At: f.PaidAt, Amount: f.Amount, Refunded: f.Refunded, Kind: f.Kind, Provider: f.Provider})
				}
			}
			out["payments"] = paid
			out["currency"] = p.Currency
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// moduleOff reports whether a module is off for a site (used by /report to
// leave revenue out entirely).
func (a *API) moduleOn(r *http.Request, site, id string) bool {
	set, _ := modules.Store{DB: a.Ctl.DB}.Of(r.Context(), site) // defaults on error
	return set.Has(id)
}

// retention is the cohort grid: who came back, week by week.
func (a *API) retention(w http.ResponseWriter, r *http.Request) {
	if !a.needs(w, r, "retention") {
		return
	}
	q, p, ok := a.params(w, r)
	if !ok {
		return
	}
	c, err := q.Retention(r.Context(), p)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, c)
}

// vitals reports how fast the site feels to the browsers that visit it.
func (a *API) vitals(w http.ResponseWriter, r *http.Request) {
	if !a.needs(w, r, "vitals") {
		return
	}
	q, p, ok := a.params(w, r)
	if !ok {
		return
	}
	v, err := q.VitalsFor(r.Context(), p)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// crawlers reports who crawled the site: AI answers, indexing and training.
func (a *API) crawlers(w http.ResponseWriter, r *http.Request) {
	if !a.needs(w, r, "crawlers") {
		return
	}
	q, p, ok := a.params(w, r)
	if !ok {
		return
	}
	rep, err := q.Crawlers(r.Context(), p)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rep)
}

// ---- annotations -----------------------------------------------------------

// annotations are notes on the chart: a launch, a post, an outage. They are
// part of the report, not a module — a spike with no explanation is the most
// common reason to open analytics six months later.
func (a *API) annotations(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	if !a.siteExists(w, r) {
		return
	}
	v := r.URL.Query()
	from, to := v.Get("from"), v.Get("to")
	if from == "" || to == "" {
		fail(w, http.StatusBadRequest, "from and to are required")
		return
	}
	list, err := a.Ctl.Annotations(r.Context(), site, from, to)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"annotations": list})
}

func (a *API) addAnnotation(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	if !a.siteExists(w, r) {
		return
	}
	var in struct {
		Day  string `json:"day"`
		Text string `json:"text"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if len(in.Day) != 10 {
		fail(w, http.StatusBadRequest, "day must be YYYY-MM-DD")
		return
	}
	note, err := a.Ctl.AddAnnotation(r.Context(), site, in.Day, in.Text)
	if err != nil {
		fail(w, http.StatusBadRequest, "a note needs some words")
		return
	}
	writeJSON(w, http.StatusCreated, note)
}

func (a *API) deleteAnnotation(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	if err := a.Ctl.DeleteAnnotation(r.Context(), r.PathValue("site"), r.PathValue("id")); err != nil {
		fail(w, http.StatusNotFound, "note not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- segments --------------------------------------------------------------

// segments are saved views: the filters and period you keep coming back to.
func (a *API) segments(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	list, err := a.Ctl.Segments(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"segments": list})
}

func (a *API) saveSegment(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	var in struct {
		Name  string `json:"name"`
		Query string `json:"query"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if len(in.Query) > 2000 {
		fail(w, http.StatusBadRequest, "that view is too complicated to save")
		return
	}
	g, err := a.Ctl.SaveSegment(r.Context(), r.PathValue("site"), in.Name, in.Query)
	if errors.Is(err, sqlite.ErrTooManySegments) {
		fail(w, http.StatusConflict, err.Error())
		return
	}
	if err != nil {
		fail(w, http.StatusBadRequest, "a saved view needs a name")
		return
	}
	writeJSON(w, http.StatusCreated, g)
}

func (a *API) deleteSegment(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	if err := a.Ctl.DeleteSegment(r.Context(), r.PathValue("site"), r.PathValue("id")); err != nil {
		fail(w, http.StatusNotFound, "saved view not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- alerts ----------------------------------------------------------------

// alerts are the four things worth being told about (tracking stopped, a busy
// day, a payment, a disk filling up) and the weekly report. Each one goes to a
// webhook, or to an email address when this server can send email.
func (a *API) alertList(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	list, err := a.Ctl.Alerts(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	// mail says whether an email address can be a destination here.
	writeJSON(w, http.StatusOK, map[string]any{"alerts": list, "kinds": alertKinds(principalOf(r)), "mail": alerts.Mail != nil})
}

func (a *API) saveAlert(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	var in sqlite.Alert
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	in.SiteID = r.PathValue("site")
	if !slices.Contains(alertKinds(principalOf(r)), in.Kind) {
		fail(w, http.StatusBadRequest, "that alert needs a kind and a webhook URL")
		return
	}
	// The destination is checked before it is stored, so a bad URL is a
	// message now rather than a silent failure at three in the morning.
	if err := alerts.CheckTarget(in.Target); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	saved, err := a.Ctl.SaveAlert(r.Context(), in)
	if err != nil {
		fail(w, http.StatusBadRequest, "that alert needs a kind and a webhook URL")
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (a *API) deleteAlert(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	if err := a.Ctl.DeleteAlert(r.Context(), r.PathValue("site"), r.PathValue("id")); err != nil {
		fail(w, http.StatusNotFound, "alert not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// testAlert sends one example event, so the webhook can be proven before it
// is needed.
func (a *API) testAlert(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	if !a.siteExists(w, r) {
		return
	}
	// A test goes to whatever address is typed, through the installation's
	// mail server: a few an hour per account, so it is never a spam relay.
	if !a.loginRate.allow("alert-test:"+principalOf(r).account, a.Now(), 10, time.Hour) {
		fail(w, http.StatusTooManyRequests, "that is enough tests for now; try again in an hour")
		return
	}
	var in struct {
		Target string `json:"target"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	info, _ := a.Ctl.SiteInfo(r.Context(), site)
	err := alerts.Send(r.Context(), in.Target, alerts.Event{
		Kind: "test", Site: site, Domain: info.Domain, At: a.Now(),
		Title: "trckable is connected", Message: "This is what an alert looks like.",
	})
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// scroll is reading depth: how far down each page people got. It needs no
// module, because every engagement ping already carries it.
func (a *API) scroll(w http.ResponseWriter, r *http.Request) {
	q, p, ok := a.params(w, r)
	if !ok {
		return
	}
	s, err := q.ScrollFor(r.Context(), p)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, s)
}

// alertKinds are the alerts this caller may set: the disk is the
// installation's, so only its operator is told about it.
func alertKinds(p principal) []string {
	var out []string
	for _, k := range sqlite.AlertKinds {
		if k == "disk" && !p.operator() {
			continue
		}
		out = append(out, k)
	}
	return out
}
