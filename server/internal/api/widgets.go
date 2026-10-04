package api

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"html/template"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/fx"
	"github.com/trckable/trckable/server/internal/importer"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/web"
)

// Public widgets: a small card a site shows on its own pages. The page is
// HTML and CSS, plus one fixed inline script that only tells the embedding
// page how tall the card is (a postMessage; it reads nothing and sends
// nothing anywhere). No cookie, no request back to anyone; it refreshes
// itself once a minute. It shows only the numbers its design shows,
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
	writeJSON(w, http.StatusOK, map[string]any{"widgets": list, "base": a.publicBase(r)})
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
	if _, err := fmt.Sscan(v.Get("radius"), &wd.Radius); err != nil {
		wd.Radius = 16 // none given, or not a number: the default
	}
	if !sqlite.WidgetKinds[wd.Kind] {
		fail(w, http.StatusBadRequest, "unknown widget kind")
		return
	}
	wd.Lang = v.Get("lang")
	wd.Texts = map[string]string{}
	for k := range sqlite.WidgetTexts[wd.Kind] {
		if t := v.Get("text." + k); t != "" {
			wd.Texts[k] = t
		}
	}
	wd.Shows = []string{}
	for _, p := range strings.Split(v.Get("shows"), ",") {
		if sqlite.WidgetPart(wd.Kind, p) {
			wd.Shows = append(wd.Shows, p)
		}
	}
	// The same checks as a saved widget: the colour goes into the page's
	// styles, so anything but #rrggbb could write HTML into it.
	if err := wd.Clean(); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.renderWidget(w, r, wd, si, false)
}

// widgetPage is the public card. An unknown id and a widget that is off
// look the same from outside: not found.
func (a *API) widgetPage(w http.ResponseWriter, r *http.Request) {
	// An empty page, not the words "not found": pages that still embed it
	// show a quiet space instead of an error. A suspended account's widgets
	// stop like its share links.
	gone := func() {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors *")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprint(w, `<!doctype html><title></title>`)
	}
	wd, err := a.Ctl.WidgetByID(r.Context(), r.PathValue("id"))
	if err != nil || !wd.On {
		gone()
		return
	}
	si, err := a.Ctl.SiteInfo(r.Context(), wd.SiteID)
	if err != nil {
		gone()
		return
	}
	a.renderWidget(w, r, wd, si, true)
}

// widgetCache keeps each site's numbers for a minute, however many pages
// show its widgets.
type widgetCache struct {
	mu sync.Mutex
	m  map[string]cachedNumbers
	// order is every put, oldest first, so the expired and the oldest are
	// found at its front without looking at every entry. A put whose key was
	// put again since, or forgotten, no longer matches m and is skipped.
	order []queued
}

type queued struct {
	key string
	exp time.Time
}

type cachedNumbers struct {
	n   widgetNumbers
	exp time.Time
}

// widgetNumbers is everything a widget may show, read once per minute.
type widgetNumbers struct {
	query.WidgetNumbers
	Revenue     *int64 // this month so far, minor units
	RevChannels []query.Row
}

func (c *widgetCache) get(key string, now time.Time) (widgetNumbers, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	return e.n, ok && now.Before(e.exp)
}

// widgetCacheMax bounds the cache. Keys come only from real widgets (a site,
// a kind, what it shows), so this many at once is a very busy server.
const widgetCacheMax = 10_000

// put keeps a site's numbers. What has expired is dropped as it goes, as
// the login limiter does, rather than the cache emptying itself when full
// (every widget would then read its numbers again at once). If it is full of
// fresh entries, the oldest makes room: it expires first, and the widget
// asked for now is the one people are looking at. Both come off the front of
// order, so a put never walks the whole cache under the lock.
func (c *widgetCache) put(key string, n widgetNumbers, now time.Time) {
	c.putFor(key, n, now, time.Minute)
}

// putFor is put for numbers that go stale sooner than a minute. The expiry
// sweep stops at the first entry still fresh, so a short-lived entry behind
// a longer one waits to be dropped; get never serves it past its time.
func (c *widgetCache) putFor(key string, n widgetNumbers, now time.Time, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil {
		c.m = map[string]cachedNumbers{}
	}
	for len(c.order) > 0 {
		q := c.order[0]
		e, ok := c.m[q.key]
		current := ok && e.exp.Equal(q.exp)
		if current && now.Before(q.exp) {
			break
		}
		if current {
			delete(c.m, q.key) // expired
		}
		c.order = c.order[1:]
	}
	if _, ok := c.m[key]; !ok && len(c.m) >= widgetCacheMax {
		// Every entry is fresh, and each has its latest put in order, so the
		// front is the oldest of them.
		delete(c.m, c.order[0].key)
		c.order = c.order[1:]
	}
	exp := now.Add(ttl)
	c.m[key] = cachedNumbers{n: n, exp: exp}
	c.order = append(c.order, queued{key, exp})
}

func (c *widgetCache) forget(site string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k := range c.m {
		if strings.HasPrefix(k, site+"|") {
			delete(c.m, k)
		}
	}
}

func (a *API) renderWidget(w http.ResponseWriter, r *http.Request, wd sqlite.Widget, si sqlite.SiteInfo, public bool) {
	h := w.Header()
	h.Set("Content-Type", "text/html; charset=utf-8")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "no-referrer")
	// Styles, and the one script by its hash: nothing else can run, load or
	// send from this page.
	h.Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src '"+web.WidgetPageScriptHash+"'; frame-ancestors *; base-uri 'none'; form-action 'none'")
	if public {
		// Kept, but checked on every load (an ETag answers with a bare 304):
		// a change in Settings shows on the next load, the numbers are
		// cached on the server (widgetFresh).
		h.Set("Cache-Control", "public, no-cache")
	} else {
		h.Set("Cache-Control", "no-store")
	}
	now := a.Now()
	loc, err := time.LoadLocation(si.Timezone)
	if err != nil {
		loc = time.UTC
	}
	lang := widgetLang(wd.Lang, r)
	words := newWidgetWords(lang, wd)
	h.Set("Content-Language", lang)
	if wd.Lang == "" || wd.Lang == "auto" {
		h.Add("Vary", "Accept-Language") // the same address answers in each visitor's language
	}
	view := widgetView(wd, si, now, loc, words)

	switch wd.Kind {
	case "privacy":
		// Read from the site's own settings, now: a seal that cannot say more
		// than the site does.
		c, _ := a.Ctl.SiteConfig(r.Context(), si.ID)
		view.Facts = privacyFacts(c, a.moduleOn(r, si.ID, "consent"), words)
	case "revenue":
		// Money is public only while the site records it, and only if the
		// owner made a revenue widget.
		if !a.moduleOn(r, si.ID, "revenue") {
			if public {
				w.WriteHeader(http.StatusNotFound)
				fmt.Fprint(w, `<!doctype html><title></title>`)
				return
			}
			view.Off = "Turn on the Revenue module to show this card."
			break
		}
		fallthrough
	default:
		q := a.Query
		if q == nil || q() == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprint(w, `<!doctype html><meta http-equiv="refresh" content="20"><title>…</title>`)
			return
		}
		ask := query.WidgetAsk{
			Week:     wd.Kind == "badge",
			AI:       wd.Kind == "badge" && wd.Has("ai"),
			Pages:    (wd.Kind == "live" || wd.Kind == "online") && wd.Has("pages"),
			Channels: wd.Kind == "live" && wd.Has("channels"),
			Online:   wd.Kind == "online",
		}
		key := fmt.Sprintf("%s|%s|%v", si.ID, wd.Kind, ask)
		nums, ok := a.widgetCache.get(key, now)
		if !ok {
			if wd.Kind == "revenue" {
				t := now.In(loc)
				month := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, loc)
				res, err := q().Report(r.Context(), query.Params{Site: si.ID, From: month.UTC(), To: now.UTC(), TZ: loc.String(), Bucket: "day", Limit: 3, Currency: si.Currency, Revenue: true})
				if err != nil {
					http.Error(w, "the numbers could not be read", http.StatusInternalServerError)
					return
				}
				if res.Money != nil {
					v := res.Money.Revenue
					nums.Revenue = &v
				}
				nums.RevChannels = res.RevenueDims["channel"]
			} else {
				n, err := q().Widget(r.Context(), si.ID, now, ask)
				if err != nil {
					http.Error(w, "the numbers could not be read", http.StatusInternalServerError)
					return
				}
				nums.WidgetNumbers = n
			}
			a.widgetCache.putFor(key, nums, now, widgetFresh(wd.Kind))
		}
		fill(&view, wd, si, nums, now, loc, words)
		if wd.Kind == "online" {
			fillOnline(&view, wd, nums, words)
		}
	}
	view.L = widgetLabels(words, view)

	var buf bytes.Buffer
	if err := widgetTmpl.Execute(&buf, view); err != nil {
		serverError(w, err)
		return
	}
	sum := sha256.Sum256(buf.Bytes())
	etag := `"` + hex.EncodeToString(sum[:8]) + `"`
	if public {
		h.Set("ETag", etag)
		if web.ETagMatch(r.Header.Get("If-None-Match"), etag) {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}
	_, _ = w.Write(buf.Bytes())
}

type widgetData struct {
	Lang            string
	Kind, Theme     string
	AccentDark      template.CSS
	AccentLight     template.CSS
	Radius          int
	Brand           bool
	Ghost           template.HTML
	Domain          string
	Off             string // why a design cannot show, in the preview
	Now, Week, AI   string
	Bars            []widgetBar
	From, Mid, Till string
	Countries       []widgetLine
	Pages           []widgetLine
	Channels        []widgetLine
	Revenue, Month  string
	Facts           []string
	Checked         string
	ShowBars        bool
	Refresh         int               // seconds until the page reads itself again
	Count, Mode     string            // online: the count as it may be shown, and pill, spark or card
	N               string            // the number the owner's {n} stands for
	L               map[string]string // every label, in the page's language and with the owner's own words
	Pill            bool              // online, in a pill: the brand is a mark in it, not a line under it
}

type widgetBar struct {
	H     int
	Label string
}

type widgetLine struct {
	Mark, Name, N string
}

func widgetView(wd sqlite.Widget, si sqlite.SiteInfo, now time.Time, loc *time.Location, words widgetWords) widgetData {
	d := widgetData{Lang: words.lang, Kind: wd.Kind, Theme: wd.Theme, Radius: wd.Radius, Brand: wd.Brand, Domain: si.Domain, Ghost: template.HTML(widgetGhost), ShowBars: wd.Has("bars"), Refresh: widgetRefresh(wd.Kind)} //nolint:gosec // widgetGhost is our own constant SVG, never input
	d.AccentDark, d.AccentLight = "#b8ff3c", "#3f6212"
	// Checked again here, whatever the caller did: it is written into CSS.
	if sqlite.HexColor(wd.Accent) {
		d.AccentDark, d.AccentLight = template.CSS(wd.Accent), template.CSS(wd.Accent) //nolint:gosec // only a #rrggbb colour gets here, checked on the line above
	}
	d.Checked = now.In(loc).Format("15:04")
	d.Month = words.plain("month." + strconv.Itoa(int(now.In(loc).Month())))
	return d
}

// channelName is a channel as the page says it: the one trckable names
// itself, in the page's language; the rest as the site's own data has them.
func channelName(name string, words widgetWords) string {
	if name == "AI" {
		return words.plain("ai_channel")
	}
	return name
}

// widgetLabels is every label the page has, so its template holds no words.
// The owner's {n}, {pct}, {month}, {domain} and {time} are filled in here.
func widgetLabels(words widgetWords, d widgetData) map[string]string {
	vars := []string{"n", d.N, "pct", d.AI, "month", d.Month, "domain", d.Domain, "time", d.Checked}
	out := map[string]string{"brand": words.plain("brand")}
	for _, k := range []string{"online", "online_title", "from", "reading", "came", "live_title", "week", "ai", "counter", "rev_title", "rev_channels", "seal_title", "seal_foot"} {
		out[k] = words.msg(k, vars...)
	}
	return out
}

func fill(d *widgetData, wd sqlite.Widget, si sqlite.SiteInfo, n widgetNumbers, now time.Time, loc *time.Location, words widgetWords) {
	d.Now, d.Week = number(n.Now), number(n.Week)
	d.N = d.Now
	if wd.Has("ai") && n.Week > 0 {
		d.AI = fmt.Sprintf("%.0f%%", n.AIShare*100)
	}
	var top int64 = 1
	for _, v := range n.Minutes {
		top = max(top, v)
	}
	end := now.In(loc).Truncate(time.Minute)
	for i, v := range n.Minutes {
		h := int(v * 100 / top)
		if v > 0 {
			h = max(h, 6)
		}
		at := end.Add(time.Duration(i-29) * time.Minute).Format("15:04")
		label := words.plural("bar", v, "time", at)
		d.Bars = append(d.Bars, widgetBar{H: h, Label: label})
	}
	d.From, d.Mid, d.Till = end.Add(-29*time.Minute).Format("15:04"), end.Add(-15*time.Minute).Format("15:04"), end.Format("15:04")
	if wd.Has("countries") {
		for _, c := range n.Countries {
			d.Countries = append(d.Countries, widgetLine{Mark: flag(c.Code), Name: importer.CountryName(c.Code), N: number(c.Visitors)})
		}
	}
	for _, p := range n.Pages {
		d.Pages = append(d.Pages, widgetLine{Name: p.Name, N: number(p.Visitors)})
	}
	for _, c := range n.Channels {
		d.Channels = append(d.Channels, widgetLine{Name: channelName(c.Name, words), N: number(c.Visitors)})
	}
	if wd.Kind == "revenue" {
		exp := fx.Exponent(si.Currency)
		var total int64
		if n.Revenue != nil {
			total = *n.Revenue
		}
		d.Revenue = money(total, si.Currency, exp)
		if wd.Has("channels") {
			for _, row := range n.RevChannels {
				if row.Revenue == nil || *row.Revenue <= 0 {
					continue
				}
				d.Channels = append(d.Channels, widgetLine{Name: channelName(row.Value, words), N: money(*row.Revenue, si.Currency, exp)})
			}
		}
	}
}

// privacyFacts are the seal's lines, each one a setting of this site as it
// is right now; nothing is claimed that the settings do not do.
func privacyFacts(c sqlite.SiteConfig, consent bool, words widgetWords) []string {
	out := []string{words.plain("p_noip")}
	switch {
	case c.ConsentFree:
		out = append(out, words.plain("p_nocookie"))
	case consent:
		out = append(out, words.plain("p_consent"))
	default:
		out = append(out, words.plain("p_cookie"))
	}
	if c.RecordCity && !c.ConsentFree {
		out = append(out, words.plain("p_loc_city"))
	} else {
		out = append(out, words.plain("p_loc_country"))
	}
	if c.HonorDNT || c.ConsentFree {
		out = append(out, words.plain("p_dnt"))
	}
	switch d := int64(c.RetentionDays); {
	case d <= 0:
		out = append(out, words.plain("p_ret_forever"))
	case d%365 == 0:
		out = append(out, words.plural("p_ret_years", d/365))
	case d%30 == 0:
		out = append(out, words.plural("p_ret_months", d/30))
	default:
		out = append(out, words.plural("p_ret_days", d))
	}
	return append(out, words.plain("p_never"))
}

func money(minor int64, cur string, exp int) string {
	whole := minor
	for i := 0; i < exp; i++ {
		whole /= 10
	}
	sym := map[string]string{"USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "CHF": "CHF "}[cur]
	if sym == "" {
		return number(whole) + " " + cur
	}
	return sym + number(whole)
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

var widgetTmpl = template.Must(template.New("w").Parse(strings.Replace(`<!doctype html>
<html lang="{{.Lang}}" data-theme="{{.Theme}}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="{{.Refresh}}">
<meta name="robots" content="noindex">
<title>{{.Domain}}</title>
<style>
:root{--bg:#141619;--fg:#f3f4f6;--mute:#8b929c;--line:#26292e;--tip:#23262b;--acc:{{.AccentDark}};color-scheme:dark}
@media (prefers-color-scheme:light){:root:not([data-theme=dark]){--bg:#fff;--fg:#15161a;--mute:#6b7280;--line:#e7e7ea;--tip:#15161a;--acc:{{.AccentLight}};color-scheme:light}:root:not([data-theme=dark]) .gb{stroke:#15161a;stroke-width:3.4;stroke-linejoin:round}}
:root[data-theme=light]{--bg:#fff;--fg:#15161a;--mute:#6b7280;--line:#e7e7ea;--tip:#15161a;--acc:{{.AccentLight}};color-scheme:light}
:root[data-theme=light] .gb{stroke:#15161a;stroke-width:3.4;stroke-linejoin:round}
*{box-sizing:border-box;margin:0}
body{container-type:inline-size;min-width:0}
html,body{overflow:hidden;background:transparent;overflow-wrap:anywhere;font:14px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fg)}
.card{background:var(--bg);border:1px solid var(--line);border-radius:{{.Radius}}px;padding:clamp(12px,5cqw,18px) clamp(14px,6cqw,20px);min-width:0}
body>.card:not(.pill):not(.badge){max-width:560px}
.lab{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--mute)}
.big{display:flex;align-items:center;gap:10px;font-size:clamp(26px,10cqw,34px);font-weight:700;letter-spacing:-.02em;margin:6px 0 12px;font-variant-numeric:tabular-nums}
.dot{width:9px;height:9px;border-radius:50%;background:var(--acc);flex:none;animation:p 2s infinite}
@keyframes p{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--acc) 60%,transparent)}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion:reduce){.dot{animation:none}}
.bars{position:relative;display:flex;align-items:flex-end;gap:2px;height:clamp(56px,22cqw,76px)}
.bars i{position:relative;flex:1;height:100%;display:flex;align-items:flex-end}
.bars i s{display:block;width:100%;background:var(--acc);border-radius:2px 2px 0 0;min-height:1px;opacity:.9}
.bars i s.z{background:var(--line)}
.bars i:hover s{opacity:1;filter:brightness(1.15)}
.bars i b{display:none;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);white-space:nowrap;padding:4px 8px;border-radius:6px;background:var(--tip);color:#fff;font-size:11px;font-weight:500;pointer-events:none;z-index:2}
.bars i:first-child b,.bars i:nth-child(2) b,.bars i:nth-child(3) b{left:0;transform:none}
.bars i:nth-last-child(-n+3) b{left:auto;right:0;transform:none}
.bars i:hover b{display:block}
.ax{display:flex;justify-content:space-between;margin-top:6px;font-size:10.5px;color:var(--mute);font-variant-numeric:tabular-nums}
h3{margin-top:14px;font-size:11px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;color:var(--mute)}
ul{list-style:none;padding:0;margin-top:8px;display:grid;gap:6px}
li{display:flex;align-items:center;gap:8px}
li span:nth-child(2){flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
li b{font-weight:500;font-variant-numeric:tabular-nums}
.ok{color:var(--acc);font-weight:700}
.by{display:flex;align-items:center;gap:5px;width:max-content;max-width:100%;margin:14px 0 0;font-size:11px;color:var(--mute);text-decoration:none}
.by b{font-weight:760;letter-spacing:-.04em;color:var(--fg)}.by i{font-style:normal;font-weight:360;letter-spacing:-.03em}
.by svg{flex:none}
.badge{padding:12px 16px}.badge .row{display:flex;align-items:center;gap:12px}
.badge .row b{font-size:clamp(18px,7cqw,22px);font-weight:700;font-variant-numeric:tabular-nums}
.pill{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:{{.Radius}}px;font-weight:600;font-variant-numeric:tabular-nums}.pill:not(.on){display:inline-block}.pill .row{display:flex;align-items:center;gap:8px}.pill:not(.on) .by,.badge .by{margin-top:6px}
.pill.on{padding:8px 12px 8px 14px;gap:8px;white-space:nowrap}
.pill.on .gh{display:flex;margin-left:2px}
.spark{display:flex;align-items:flex-end;gap:1px;height:18px;width:60px}
.spark i{flex:1;height:100%;display:flex;align-items:flex-end}
.spark s{display:block;width:100%;background:var(--acc);border-radius:1px 1px 0 0;min-height:1px;opacity:.9}
.spark s.z{background:var(--line)}
.foot{margin-top:12px;font-size:11px;color:var(--mute)}
.off{color:var(--mute);font-size:13px}
.facts li{align-items:flex-start}
.facts li span:nth-child(2){white-space:normal;overflow:visible}
@container (max-width:359px){.bars{gap:1px}.badge .row,.pill .row{flex-wrap:wrap}.lab{letter-spacing:.04em}.ax{font-size:10px}}
</style></head><body>
{{if .Off}}<div class="card off">{{.Off}}</div>
{{else if eq .Kind "live"}}<div class="card">
<div class="lab">{{.L.live_title}}</div>
<div class="big">{{.Now}}<span class="dot"></span></div>
{{if .ShowBars}}<div class="bars">{{range .Bars}}<i><s{{if eq .H 0}} class="z"{{end}} style="height:{{.H}}%"></s><b>{{.Label}}</b></i>{{end}}</div>
<div class="ax"><span>{{.From}}</span><span>{{.Mid}}</span><span>{{.Till}}</span></div>{{end}}
{{if .Countries}}<h3>{{.L.from}}</h3><ul>{{range .Countries}}<li><span>{{.Mark}}</span><span>{{.Name}}</span><b>{{.N}}</b></li>{{end}}</ul>{{end}}
{{if .Pages}}<h3>{{.L.reading}}</h3><ul>{{range .Pages}}<li><span></span><span>{{.Name}}</span><b>{{.N}}</b></li>{{end}}</ul>{{end}}
{{if .Channels}}<h3>{{.L.came}}</h3><ul>{{range .Channels}}<li><span></span><span>{{.Name}}</span><b>{{.N}}</b></li>{{end}}</ul>{{end}}
{{if .Brand}}{{template "by" .}}{{end}}
</div>
{{else if eq .Kind "badge"}}<div class="card badge"><div class="row"><span class="dot"></span><span><b>{{.Week}}</b><br><span class="lab">{{.L.week}}{{if .AI}} · {{.L.ai}}{{end}}</span></span></div>{{if .Brand}}{{template "by" .}}{{end}}</div>
{{else if eq .Kind "revenue"}}<div class="card">
<div class="lab">{{.L.rev_title}}</div>
<div class="big">{{.Revenue}}</div>
{{if .Channels}}<h3>{{.L.rev_channels}}</h3><ul>{{range .Channels}}<li><span></span><span>{{.Name}}</span><b>{{.N}}</b></li>{{end}}</ul>{{end}}
{{if .Brand}}{{template "by" .}}{{end}}
</div>
{{else if eq .Kind "privacy"}}<div class="card">
<div class="lab">{{.L.seal_title}}</div>
<ul class="facts">{{range .Facts}}<li><span class="ok">✓</span><span>{{.}}</span></li>{{end}}</ul>
<div class="foot">{{.L.seal_foot}}</div>
{{if .Brand}}{{template "by" .}}{{end}}
</div>
{{else if eq .Kind "online"}}{{if eq .Mode "card"}}<div class="card">
<div class="lab">{{.L.online_title}}</div>
<div class="big"><span class="dot"></span>{{.Count}}</div>
{{if .Bars}}<div class="bars">{{range .Bars}}<i><s{{if eq .H 0}} class="z"{{end}} style="height:{{.H}}%"></s><b>{{.Label}}</b></i>{{end}}</div>
<div class="ax"><span>{{.From}}</span><span>{{.Mid}}</span><span>{{.Till}}</span></div>{{end}}
{{if .Countries}}<h3>{{.L.from}}</h3><ul>{{range .Countries}}<li><span>{{.Mark}}</span><span>{{.Name}}</span><b>{{.N}}</b></li>{{end}}</ul>{{end}}
{{if .Pages}}<h3>{{.L.reading}}</h3><ul>{{range .Pages}}<li><span></span><span>{{.Name}}</span><b>{{.N}}</b></li>{{end}}</ul>{{end}}
{{if .Brand}}{{template "by" .}}{{end}}
</div>
{{else}}<div class="card pill on"><span class="dot"></span><span>{{.Count}} {{.L.online}}</span>{{if .Bars}}<span class="spark" aria-hidden="true">{{range .Bars}}<i><s{{if eq .H 0}} class="z"{{end}} style="height:{{.H}}%"></s></i>{{end}}</span>{{end}}{{if .Brand}}<a class="gh" href="https://trckable.com" target="_blank" rel="noopener" title="{{.L.brand}} trckable" aria-label="{{.L.brand}} trckable">{{.Ghost}}</a>{{end}}</div>{{end}}
{{else}}<div class="card pill"><div class="row"><span class="dot"></span>{{.L.counter}}</div>{{if .Brand}}{{template "by" .}}{{end}}</div>{{end}}
<script>@SCRIPT@</script></body></html>{{define "by"}}<a class="by" href="https://trckable.com" target="_blank" rel="noopener">{{.Ghost}}<span>{{.L.brand}} <b>trck</b><i>able</i></span></a>{{end}}`, "@SCRIPT@", web.WidgetPageScript, 1)))
