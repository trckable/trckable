package api

import (
	"context"
	"fmt"
	"html"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
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

// A path the frame may be asked for: the path as the Pages list names it, in
// hash mode with its #/route. Nothing that could carry a second address.
var heatFramePath = regexp.MustCompile(`^/[A-Za-z0-9\-._~%!$&'()*+,;=:@/#]{0,500}$`)

// A frame domain is a host name and nothing else: it goes into a header.
var heatFrameHost = regexp.MustCompile(`^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$`)

// A page that does something just by being opened. The frame never loads one,
// and the overlay does not offer it.
var heatFrameRisky = regexp.MustCompile(`(?i)^/(log|sign)[-_]?(out|off)\b|^/unsubscribe\b`)

const heatFrameCSP = "default-src 'none'; style-src 'unsafe-inline'; frame-src https://%[1]s https://*.%[1]s; frame-ancestors 'self'"

// heatFrame is the page the heatmap overlay frames: a page of this server that
// holds one frame of the owner's own site, sandboxed with no permissions at all
// (no scripts, no forms, no same-origin), under a policy that lets it frame
// that site and nothing else, and that only the dashboard may frame. So the
// dashboard itself never frames another site.
//
//	GET /api/v1/sites/{site}/heat-frame?path=/pricing
//
// It answers with a plain page that says so, and no frame, for a page the site
// refuses to have framed (X-Frame-Options, or a frame-ancestors that leaves
// this server out), one that cannot be read, and one that does something by
// being opened (a sign-out). The check is one plain GET of the site's own
// domain through the guard alerts use, never to an address the request chose.
func (a *API) heatFrame(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	si, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	path := r.URL.Query().Get("path")
	host := strings.ToLower(si.Domain)
	if !heatFramePath.MatchString(path) || strings.HasPrefix(path, "//") || !heatFrameHost.MatchString(host) {
		fail(w, http.StatusBadRequest, "path must be a page of the site, starting with /")
		return
	}
	if !a.loginRate.allow("heatframe:"+site, a.Now(), 30, 10*time.Minute) {
		fail(w, http.StatusTooManyRequests, "that is enough frames for now: try again in a few minutes")
		return
	}
	src := ""
	switch {
	case heatFrameRisky.MatchString(path):
	case framable(r, host, path):
		src = "https://" + host + path
	}
	h := w.Header()
	h.Set("Content-Type", "text/html; charset=utf-8")
	h.Set("Content-Security-Policy", fmt.Sprintf(heatFrameCSP, host))
	h.Set("X-Frame-Options", "SAMEORIGIN")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("Cache-Control", "no-store")
	body := `<p class="x">` + heatFrameHint + `</p>`
	if src != "" {
		body = `<iframe sandbox="" referrerpolicy="no-referrer" title="` + html.EscapeString(path) + `" src="` + html.EscapeString(src) + `"></iframe>`
	}
	_, _ = io.WriteString(w, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>html,body{margin:0;height:100%;background:#fff}iframe{border:0;width:100%;height:100%;display:block}.x{margin:0;padding:16px;font:13px system-ui,sans-serif;color:#667}</style>`+body)
}

// heatFrameHint is all the page says when there is nothing to show.
const heatFrameHint = "This page cannot be shown here."

// framable reports whether the site's page would let this server's page frame
// it. A page that cannot be read at all is not shown either.
func framable(r *http.Request, host, path string) bool {
	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://"+host+path, nil) //nolint:gosec // the host is the site's own domain, checked by heatFrameHost, and the path by heatFramePath; every connection goes through the guard alerts use (SafeClient)
	if err != nil {
		return false
	}
	req.Header.Set("User-Agent", "trckable (heatmap frame check)")
	res, err := checkClient().Do(req) //nolint:gosec // the same request, through the same guard
	if err != nil {
		return false
	}
	_ = res.Body.Close()
	origin := "https://" + r.Host
	if r.TLS == nil {
		origin = "http://" + r.Host
	}
	return !refusesFraming(res.Header, origin)
}

// refusesFraming reads X-Frame-Options and a CSP's frame-ancestors the way a
// browser would for a framer at origin: any X-Frame-Options value shuts it
// out, and frame-ancestors lets it in only through *, a scheme it is on, or its
// own origin.
func refusesFraming(h http.Header, origin string) bool {
	if h.Get("X-Frame-Options") != "" {
		return true
	}
	for _, policy := range h.Values("Content-Security-Policy") {
		for _, dir := range strings.Split(policy, ";") {
			f := strings.Fields(dir)
			if len(f) == 0 || !strings.EqualFold(f[0], "frame-ancestors") {
				continue
			}
			allowed := false
			for _, src := range f[1:] {
				if src == "*" || strings.EqualFold(src, origin) || strings.EqualFold(src, strings.SplitN(origin, ":", 2)[0]+":") {
					allowed = true
				}
			}
			if !allowed {
				return true
			}
		}
	}
	return false
}
