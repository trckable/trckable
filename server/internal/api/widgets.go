package api

import (
	"bytes"
	"database/sql"
	"errors"
	"fmt"
	"html/template"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/importer"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Public widgets: a small card a site shows on its own pages. The page is
// HTML and CSS only — no script, no cookie, no request back to anyone — and
// refreshes itself once a minute. It shows only the numbers its design shows,
// read at most once a minute per site, and it is never counted as a visit.
//
//	GET    /api/v1/sites/{site}/widgets              the site's widgets
//	POST   /api/v1/sites/{site}/widgets              {kind, theme, accent, radius, brand}
//	PUT    /api/v1/sites/{site}/widgets/{id}         the same, plus on
//	DELETE /api/v1/sites/{site}/widgets/{id}
//	GET    /api/v1/sites/{site}/widgets/preview?kind=…   the page, for the settings preview
//	GET    /w/{id}                                    the public page

func (a *API) widgetsList(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	list, err := a.Ctl.Widgets(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"widgets": list})
}

func (a *API) createWidget(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	var in sqlite.Widget
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	in.SiteID = r.PathValue("site")
	out, err := a.Ctl.CreateWidget(r.Context(), in)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (a *API) updateWidget(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	var in sqlite.Widget
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	in.ID, in.SiteID = r.PathValue("id"), r.PathValue("site")
	out, err := a.Ctl.UpdateWidget(r.Context(), in)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		fail(w, http.StatusNotFound, "no such widget")
		return
	case err != nil:
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.widgetCache.forget(out.SiteID)
	writeJSON(w, http.StatusOK, out)
}

func (a *API) deleteWidget(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	if err := a.Ctl.DeleteWidget(r.Context(), r.PathValue("site"), r.PathValue("id")); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// widgetPreview draws a design with the site's real numbers before it is
// made public, for the picker in Settings → Sharing.
func (a *API) widgetPreview(w http.ResponseWriter, r *http.Request) {
	si, err := a.Ctl.SiteInfo(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	v := r.URL.Query()
	wd := sqlite.Widget{SiteID: si.ID, Kind: v.Get("kind"), Theme: v.Get("theme"), Accent: v.Get("accent"), Brand: v.Get("brand") != "0"}
	fmt.Sscan(v.Get("radius"), &wd.Radius)
	if wd.Radius == 0 && v.Get("radius") == "" {
		wd.Radius = 16
	}
	if !sqlite.WidgetKinds[wd.Kind] {
		fail(w, http.StatusBadRequest, "unknown widget kind")
		return
	}
	a.renderWidget(w, r, wd, si, false)
}

// widgetPage is the public card. An unknown id and a widget that is off
// look the same from outside: not found.
func (a *API) widgetPage(w http.ResponseWriter, r *http.Request) {
	wd, err := a.Ctl.WidgetByID(r.Context(), r.PathValue("id"))
	if err != nil || !wd.On {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	si, err := a.Ctl.SiteInfo(r.Context(), wd.SiteID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	a.renderWidget(w, r, wd, si, true)
}

// widgetCache keeps each site's numbers for a minute, however many pages
// show its widgets.
type widgetCache struct {
	mu sync.Mutex
	m  map[string]cachedNumbers
}

type cachedNumbers struct {
	n   query.WidgetNumbers
	exp time.Time
}

func (c *widgetCache) get(key string, now time.Time) (query.WidgetNumbers, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	return e.n, ok && now.Before(e.exp)
}

func (c *widgetCache) put(key string, n query.WidgetNumbers, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil || len(c.m) > 10000 {
		c.m = map[string]cachedNumbers{}
	}
	c.m[key] = cachedNumbers{n: n, exp: now.Add(time.Minute)}
}

func (c *widgetCache) forget(site string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.m, site+"|w")
	delete(c.m, site+"|n")
}

func (a *API) renderWidget(w http.ResponseWriter, r *http.Request, wd sqlite.Widget, si sqlite.SiteInfo, public bool) {
	h := w.Header()
	h.Set("Content-Type", "text/html; charset=utf-8")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "no-referrer")
	// Styles only: nothing can run, load or send from this page.
	h.Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'; form-action 'none'")
	if public {
		h.Set("Cache-Control", "public, max-age=60")
	} else {
		h.Set("Cache-Control", "no-store")
	}
	q := a.Query
	if q == nil || q() == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		fmt.Fprint(w, `<!doctype html><meta http-equiv="refresh" content="20"><title>…</title>`)
		return
	}
	week := wd.Kind == "badge"
	key := si.ID + map[bool]string{true: "|w", false: "|n"}[week]
	now := a.Now()
	nums, ok := a.widgetCache.get(key, now)
	if !ok {
		var err error
		nums, err = q().Widget(r.Context(), si.ID, now, week)
		if err != nil {
			http.Error(w, "the numbers could not be read", http.StatusInternalServerError)
			return
		}
		a.widgetCache.put(key, nums, now)
	}
	var buf bytes.Buffer
	if err := widgetTmpl.Execute(&buf, widgetView(wd, si, nums, now)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Write(buf.Bytes())
}

type widgetData struct {
	Kind, Theme     string
	AccentDark      template.CSS
	AccentLight     template.CSS
	Radius          int
	Brand           bool
	Now, Week       string
	NowN            int64
	Bars            []int // heights in %, oldest first
	From, Mid, Till string
	Countries       []widgetCountry
	Domain          string
}

type widgetCountry struct {
	Flag, Name, N string
}

func widgetView(wd sqlite.Widget, si sqlite.SiteInfo, n query.WidgetNumbers, now time.Time) widgetData {
	loc, err := time.LoadLocation(si.Timezone)
	if err != nil {
		loc = time.UTC
	}
	d := widgetData{Kind: wd.Kind, Theme: wd.Theme, Radius: wd.Radius, Brand: wd.Brand, Now: number(n.Now), NowN: n.Now, Week: number(n.Week), Domain: si.Domain}
	d.AccentDark, d.AccentLight = "#b8ff3c", "#3f6212"
	if wd.Accent != "" {
		d.AccentDark, d.AccentLight = template.CSS(wd.Accent), template.CSS(wd.Accent)
	}
	var top int64 = 1
	for _, v := range n.Minutes {
		top = max(top, v)
	}
	for _, v := range n.Minutes {
		h := int(v * 100 / top)
		if v > 0 {
			h = max(h, 6)
		}
		d.Bars = append(d.Bars, h)
	}
	end := now.In(loc).Truncate(time.Minute)
	d.From, d.Mid, d.Till = end.Add(-29*time.Minute).Format("15:04"), end.Add(-15*time.Minute).Format("15:04"), end.Format("15:04")
	for _, c := range n.Countries {
		d.Countries = append(d.Countries, widgetCountry{Flag: flag(c.Code), Name: importer.CountryName(c.Code), N: number(c.Visitors)})
	}
	return d
}

// flag is a country's flag as the two regional-indicator letters of its code.
func flag(code string) string {
	code = strings.ToUpper(code)
	if len(code) != 2 || code[0] < 'A' || code[0] > 'Z' || code[1] < 'A' || code[1] > 'Z' {
		return ""
	}
	return string([]rune{rune(code[0]) - 'A' + 0x1F1E6, rune(code[1]) - 'A' + 0x1F1E6})
}

func number(n int64) string {
	s := fmt.Sprint(n)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}

var widgetTmpl = template.Must(template.New("w").Parse(`<!doctype html>
<html lang="en" data-theme="{{.Theme}}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60">
<meta name="robots" content="noindex">
<title>{{.Domain}}</title>
<style>
:root{--bg:#141619;--fg:#f3f4f6;--mute:#8b929c;--line:#26292e;--acc:{{.AccentDark}};color-scheme:dark}
@media (prefers-color-scheme:light){:root:not([data-theme=dark]){--bg:#fff;--fg:#15161a;--mute:#6b7280;--line:#e7e7ea;--acc:{{.AccentLight}};color-scheme:light}}
:root[data-theme=light]{--bg:#fff;--fg:#15161a;--mute:#6b7280;--line:#e7e7ea;--acc:{{.AccentLight}};color-scheme:light}
*{box-sizing:border-box;margin:0}
html,body{background:transparent;font:14px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fg)}
.card{background:var(--bg);border:1px solid var(--line);border-radius:{{.Radius}}px;padding:18px 20px}
.lab{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--mute)}
.big{display:flex;align-items:center;gap:10px;font-size:34px;font-weight:700;letter-spacing:-.02em;margin:6px 0 14px;font-variant-numeric:tabular-nums}
.dot{width:9px;height:9px;border-radius:50%;background:var(--acc);box-shadow:0 0 0 0 var(--acc);animation:p 2s infinite}
@keyframes p{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--acc) 60%,transparent)}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion:reduce){.dot{animation:none}}
.bars{display:flex;align-items:flex-end;gap:2px;height:76px}
.bars i{flex:1;background:var(--acc);border-radius:2px 2px 0 0;min-height:1px;opacity:.9}
.bars i.z{background:var(--line)}
.ax{display:flex;justify-content:space-between;margin-top:6px;font-size:10.5px;color:var(--mute);font-variant-numeric:tabular-nums}
ul{list-style:none;padding:0;margin-top:14px;display:grid;gap:6px}
li{display:flex;align-items:center;gap:8px}
li span:nth-child(2){flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
li b{font-weight:500;font-variant-numeric:tabular-nums}
.by{display:block;margin-top:8px;font-size:11px;color:var(--mute);text-decoration:none;text-align:center}
.badge{display:flex;align-items:center;gap:12px;padding:12px 16px}
.badge b{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
.pill{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:{{.Radius}}px;font-weight:600;font-variant-numeric:tabular-nums}
</style></head><body>
{{if eq .Kind "live"}}<div class="card">
<div class="lab">Visitors in the last 30 minutes</div>
<div class="big">{{.Now}}<span class="dot"></span></div>
<div class="bars">{{range .Bars}}<i{{if eq . 0}} class="z"{{end}} style="height:{{.}}%"></i>{{end}}</div>
<div class="ax"><span>{{.From}}</span><span>{{.Mid}}</span><span>{{.Till}}</span></div>
{{if .Countries}}<ul>{{range .Countries}}<li><span>{{.Flag}}</span><span>{{.Name}}</span><b>{{.N}}</b></li>{{end}}</ul>{{end}}
</div>
{{else if eq .Kind "badge"}}<div class="card badge"><span class="dot"></span><span><b>{{.Week}}</b><br><span class="lab">visitors this week</span></span></div>
{{else}}<div class="card pill"><span class="dot"></span>{{.Now}} here now</div>{{end}}
{{if .Brand}}<a class="by" href="https://trckable.com" target="_blank" rel="noopener">Counted by trckable</a>{{end}}
</body></html>`))
