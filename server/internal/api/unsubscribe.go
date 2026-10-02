package api

import (
	"context"
	"errors"
	"html/template"
	"log/slog"
	"net/http"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/auth"
)

// The alerts of a new site, and the page an email's stop link opens.

// defaultAlerts gives a new site its weekly report and "tracking stopped"
// (see sqlite.DefaultAlerts). It never fails the request that made the site:
// the dashboard offers the same switches if this could not.
func (a *API) defaultAlerts(ctx context.Context, account, site string) {
	if _, err := a.Ctl.DefaultAlerts(ctx, account, site, alerts.Mail != nil); err != nil {
		slog.Warn("default alerts not set", "err", err)
	}
}

func (a *API) defaultAlertsForAccount(ctx context.Context, account string) {
	if err := a.Ctl.DefaultAlertsForAccount(ctx, account, alerts.Mail != nil); err != nil {
		slog.Warn("default alerts not set", "err", err)
	}
}

// whatItIs names an alert the way the page says it.
var whatItIs = map[string]string{
	"weekly": "The weekly email", "stopped": "The tracking-stopped email", "spike": "The busy-day email",
	"customer": "The payment email", "disk": "The disk email", "milestone": "The milestone email",
}

type stopView struct {
	What, Domain string
	On           bool
}

var stopPage = template.Must(template.New("stop").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>{{.What}}</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#14161a;--mu:#5b616b;--line:#dfe2e7;--ac:#14161a;--on:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0f1114;--fg:#eceef1;--mu:#9aa1ab;--line:#2a2e35;--ac:#eceef1;--on:#0f1114}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{width:min(360px,100% - 32px);padding:24px;border:1px solid var(--line);border-radius:14px}
h1{margin:0 0 4px;font-size:18px}p{margin:0 0 20px;color:var(--mu)}
button{width:100%;padding:11px 14px;border:0;border-radius:10px;background:var(--ac);color:var(--on);font:inherit;font-weight:600;cursor:pointer}
button:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
</style></head><body><main>
<h1>{{.What}}</h1><p>{{.Domain}} · {{if .On}}on{{else}}off{{end}}</p>
<form method="post"><button name="action" value="{{if .On}}off{{else}}on{{end}}">{{if .On}}Stop it{{else}}Turn it back on{{end}}</button></form>
</main></body></html>`))

func (a *API) stopID(r *http.Request) (string, bool) {
	if a.Box == nil {
		return "", false
	}
	return alerts.UnsubscribeAlert(a.Box.Derive(alerts.KeyLabel), r.PathValue("token"))
}

func stopHeaders(w http.ResponseWriter) {
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Robots-Tag", "noindex")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
}

func notActive(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusNotFound)
	_, _ = w.Write([]byte("This link is not active.\n"))
}

// stopShow is what the link opens: the alert's state and one button. A link
// that only changed things when opened would be switched by every mail
// scanner that follows links, so the change is the button's POST.
func (a *API) stopShow(w http.ResponseWriter, r *http.Request) {
	stopHeaders(w)
	id, ok := a.stopID(r)
	if !ok {
		notActive(w)
		return
	}
	al, domain, err := a.Ctl.AlertByID(r.Context(), id)
	if err != nil {
		notActive(w)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = stopPage.Execute(w, stopView{What: whatItIs[al.Kind], Domain: domain, On: al.Enabled})
}

// stopDo turns that one alert off, or back on with action=on. A mail client's
// one-click unsubscribe (RFC 8058) posts "List-Unsubscribe=One-Click" here
// and means off.
func (a *API) stopDo(w http.ResponseWriter, r *http.Request) {
	stopHeaders(w)
	id, ok := a.stopID(r)
	if !ok {
		notActive(w)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<10)
	if r.ParseForm() != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	err := a.Ctl.SetAlertEnabled(r.Context(), id, r.PostForm.Get("action") == "on")
	switch {
	case errors.Is(err, auth.ErrNotFound):
		notActive(w)
		return
	case err != nil:
		http.Error(w, "try again", http.StatusInternalServerError)
		return
	}
	if r.PostForm.Get("action") == "" && r.PostForm.Get("List-Unsubscribe") == "One-Click" {
		w.WriteHeader(http.StatusOK)
		return
	}
	a.stopShow(w, r)
}
