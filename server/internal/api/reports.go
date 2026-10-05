package api

import (
	"errors"
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/reports"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Scheduled reports for a site's clients (Settings → Alerts): who gets what,
// how often, in which language. Owners manage them; each email carries its
// recipient's own link to leave.

// reportsPerDay is how often one person may have a test report sent to them.
const reportsPerDay = 3

func (a *API) reportSchedules(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	list, err := a.Ctl.ReportSchedules(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	ready := a.ReportsReady != nil && a.ReportsReady()
	writeJSON(w, http.StatusOK, map[string]any{"schedules": list, "ready": ready, "mail": alerts.Mail != nil, "langs": sqlite.ReportLangs, "max_recipients": sqlite.MaxRecipients})
}

type scheduleIn struct {
	Name       string   `json:"name"`
	Cadence    string   `json:"cadence"`
	Lang       string   `json:"lang"`
	PDF        bool     `json:"pdf"`
	Recipients []string `json:"recipients"`
	Enabled    *bool    `json:"enabled"`
}

// saveSchedule keeps a schedule and answers with it, or says in words why not.
func (a *API) saveSchedule(w http.ResponseWriter, r *http.Request, id string) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	var in scheduleIn
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	on := in.Enabled == nil || *in.Enabled
	sc, err := a.Ctl.SaveReportSchedule(r.Context(), sqlite.ReportSchedule{ID: id, SiteID: r.PathValue("site"), Name: in.Name, Cadence: in.Cadence,
		Lang: in.Lang, PDF: in.PDF, Recipients: in.Recipients, Enabled: on})
	var bad sqlite.ErrSchedule
	switch {
	case errors.As(err, &bad):
		fail(w, http.StatusBadRequest, bad.Why)
	case errors.Is(err, auth.ErrNotFound):
		fail(w, http.StatusNotFound, "no such schedule")
	case err != nil:
		fail(w, http.StatusInternalServerError, err.Error())
	default:
		writeJSON(w, http.StatusOK, sc)
	}
}

func (a *API) createReportSchedule(w http.ResponseWriter, r *http.Request) { a.saveSchedule(w, r, "") }
func (a *API) updateReportSchedule(w http.ResponseWriter, r *http.Request) {
	a.saveSchedule(w, r, r.PathValue("id"))
}

func (a *API) deleteReportSchedule(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	err := a.Ctl.DeleteReportSchedule(r.Context(), r.PathValue("site"), r.PathValue("id"))
	switch {
	case errors.Is(err, auth.ErrNotFound):
		fail(w, http.StatusNotFound, "no such schedule")
	case err != nil:
		fail(w, http.StatusInternalServerError, err.Error())
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// testReportSchedule sends a schedule's last period to the person who asked,
// three times a day at most.
func (a *API) testReportSchedule(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	u := principalOf(r).user
	if u == nil {
		fail(w, http.StatusForbidden, "only a signed-in person can have the report sent to them")
		return
	}
	if a.SendReport == nil || a.ReportsReady == nil || !a.ReportsReady() {
		fail(w, http.StatusConflict, "reports need email set up on this server")
		return
	}
	sc, err := a.Ctl.ReportScheduleByID(r.Context(), r.PathValue("id"))
	if err != nil || sc.SiteID != r.PathValue("site") {
		fail(w, http.StatusNotFound, "no such schedule")
		return
	}
	if !a.loginRate.allow("report-test:"+u.ID+":"+sc.ID, a.Now(), reportsPerDay, 24*time.Hour) {
		fail(w, http.StatusTooManyRequests, "that is enough for today: the report can be sent to you three times a day")
		return
	}
	if err := a.SendReport(r.Context(), sc, u.Email); err != nil {
		slog.Warn("test report not delivered", "err", err)
		fail(w, http.StatusBadGateway, "the report could not be sent: check the mail settings in the server's log")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sent_to": u.Email})
}

// ---- the page a report's link opens ----------------------------------------

type reportStopView struct {
	Lang, Title, Body, Button, Done string
	Stopped                         bool
}

var reportStopPage = template.Must(template.New("rstop").Parse(`<!doctype html>
<html lang="{{.Lang}}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>{{.Title}}</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#14161a;--mu:#5b616b;--line:#dfe2e7;--ac:#14161a;--on:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0f1114;--fg:#eceef1;--mu:#9aa1ab;--line:#2a2e35;--ac:#eceef1;--on:#0f1114}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{width:min(380px,100% - 32px);padding:24px;border:1px solid var(--line);border-radius:14px}
h1{margin:0 0 8px;font-size:18px}p{margin:0 0 20px;color:var(--mu);overflow-wrap:anywhere}
button{width:100%;padding:11px 14px;border:0;border-radius:10px;background:var(--ac);color:var(--on);font:inherit;font-weight:600;cursor:pointer}
button:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
</style></head><body><main>
<h1>{{.Title}}</h1>{{if .Stopped}}<p>{{.Done}}</p>{{else}}<p>{{.Body}}</p>
<form method="post"><button>{{.Button}}</button></form>{{end}}
</main></body></html>`))

// reportLink reads a report's link: whose address, on which schedule.
func (a *API) reportLink(r *http.Request) (sc sqlite.ReportSchedule, email string, ok bool) {
	if a.Box == nil {
		return sc, "", false
	}
	id, email, ok := alerts.ReportUnsubscribe(a.Box.Derive(alerts.ReportKeyLabel), r.PathValue("token"))
	if !ok {
		return sc, "", false
	}
	sc, err := a.Ctl.ReportScheduleByID(r.Context(), id)
	return sc, email, err == nil
}

func (a *API) reportStopPage(w http.ResponseWriter, sc sqlite.ReportSchedule, email string, stopped bool) {
	words := reports.For(sc.Lang)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = reportStopPage.Execute(w, reportStopView{Lang: sc.Lang, Title: words.StopTitle, Body: fmt.Sprintf(words.StopBody, email),
		Button: words.StopButton, Done: fmt.Sprintf(words.Stopped, email), Stopped: stopped})
}

// reportStopShow asks before it does anything: a link that changed things
// when opened would be pressed by every mail scanner that follows links.
func (a *API) reportStopShow(w http.ResponseWriter, r *http.Request) {
	stopHeaders(w)
	sc, email, ok := a.reportLink(r)
	if !ok {
		notActive(w)
		return
	}
	a.reportStopPage(w, sc, email, false)
}

// reportStopDo takes the address off the schedule. A mail client's one-click
// unsubscribe (RFC 8058) posts here too.
func (a *API) reportStopDo(w http.ResponseWriter, r *http.Request) {
	stopHeaders(w)
	sc, email, ok := a.reportLink(r)
	if !ok {
		notActive(w)
		return
	}
	if err := a.Ctl.RemoveReportRecipient(r.Context(), sc.ID, email); err != nil {
		http.Error(w, "try again", http.StatusInternalServerError)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<10)
	if r.ParseForm() == nil && r.PostForm.Get("List-Unsubscribe") == "One-Click" {
		w.WriteHeader(http.StatusOK)
		return
	}
	a.reportStopPage(w, sc, email, true)
}
