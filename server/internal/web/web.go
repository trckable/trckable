// Package web serves trckable's embedded static assets: the browser script
// (one prebuilt variant per module combination) and the dashboard. Everything
// is compiled into the binary, so a deploy is always one file.
package web

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed assets/t.js assets/t-*.js assets/heat.js assets/sizes.json assets/online.js
var assets embed.FS

// dist is the built dashboard (dashboard/ → vite build → internal/web/dist).
//
//go:embed all:dist
var dist embed.FS

// Sizes are the measured gzip sizes of the script variants (written by
// tracker/build.mjs), so the dashboard can show what a module costs.
type Sizes struct {
	Core     int            `json:"core"`
	Full     int            `json:"full"`
	Feature  map[string]int `json:"feature"`
	Variants map[string]int `json:"variants"`
}

var (
	sizesOnce sync.Once
	sizes     Sizes
)

// TrackerSizes returns the measured script sizes.
func TrackerSizes() Sizes {
	sizesOnce.Do(func() {
		b, err := assets.ReadFile("assets/sizes.json")
		if err != nil {
			return
		}
		// A broken file shows no sizes rather than half of them.
		if err := json.Unmarshal(b, &sizes); err != nil {
			sizes = Sizes{}
		}
	})
	return sizes
}

// featureCode maps a tracker feature to its one-letter variant code, in the
// same order tracker/build.mjs names files.
var featureCode = []struct{ feature, code string }{
	{"goals", "g"},
	{"outbound", "o"},
	{"checkout", "c"},
	{"vitals", "v"},
	{"consent", "n"},
	{"banner", "b"},
	{"forms", "f"},
}

// VariantName is variantFor, for callers that only need the name.
func VariantName(features []string) string { return variantFor(features) }

// variantFor names the script variant for a set of features ("core", "g",
// "gc", "goc"…).
func variantFor(features []string) string {
	has := map[string]bool{}
	for _, f := range features {
		has[f] = true
	}
	out := ""
	for _, fc := range featureCode {
		if has[fc.feature] {
			out += fc.code
		}
	}
	if out == "" {
		return "core"
	}
	return out
}

type script struct {
	body []byte
	etag string
}

var (
	scriptsMu sync.RWMutex
	scripts   = map[string]script{}
)

// scriptFor loads a variant, falling back to the full script. With the
// heatmaps module among the features, the module's own file follows it: the
// base script is the same bytes with or without it, and the two run one after
// the other as the same <script> element, which is how the module reads the
// tag's settings. The semicolon keeps the base script's last statement from
// running into the module's first.
func scriptFor(features []string) script {
	name := variantFor(features)
	for _, f := range features {
		if f == "heat" { // modules.TrackHeat
			name += "+heat"
		}
	}
	scriptsMu.RLock()
	s, ok := scripts[name]
	scriptsMu.RUnlock()
	if ok {
		return s
	}
	base := strings.TrimSuffix(name, "+heat")
	body, err := assets.ReadFile("assets/t-" + base + ".js")
	if err != nil {
		if body, err = assets.ReadFile("assets/t.js"); err != nil {
			panic(err) // build error: the tracker was not embedded
		}
	}
	if base != name {
		heat, err := assets.ReadFile("assets/heat.js")
		if err != nil {
			panic(err) // build error: the heatmaps module was not embedded
		}
		body = append(append(append([]byte{}, body...), ';'), heat...)
	}
	sum := sha256.Sum256(body)
	s = script{body: body, etag: `"` + hex.EncodeToString(sum[:8]) + `"`}
	scriptsMu.Lock()
	scripts[name] = s
	scriptsMu.Unlock()
	return s
}

// SiteFeatures returns the browser features a site's modules need.
type SiteFeatures func(site string) []string

// SiteScript is everything about one site that changes the script it is
// served: whether it runs cookieless, and what its cookie bar says.
type SiteScript func(site string) ScriptOpts

// ScriptOpts are those settings. Empty is the plain script.
type ScriptOpts struct {
	ConsentFree                                           bool
	BannerText, BannerAccept, BannerDecline, BannerPolicy string
	// How the bar looks. Empty colours keep trckable's dark default; the
	// site's own CSS is added last, so it wins.
	BannerBg, BannerFg, BannerButton, BannerButtonFg string
	BannerPosition                                   string
	BannerRadius                                     int
	BannerCSS                                        string
}

// Where the bar sits, as the inset the tracker's --tkb-at expects.
var barAt = map[string]string{
	"bl":   "auto auto 12px 12px",
	"wide": "auto 12px 12px 12px",
}

// bannerCSS turns a site's picks into the custom properties the bar's own
// stylesheet already reads, then appends whatever CSS the site wrote. No
// rules are invented here: every value lands in one declaration.
func bannerCSS(o ScriptOpts) string {
	var vars []string
	add := func(name, val string) {
		if val != "" {
			vars = append(vars, "--tkb-"+name+":"+val)
		}
	}
	add("bg", o.BannerBg)
	add("fg", o.BannerFg)
	add("button", o.BannerButton)
	add("button-fg", o.BannerButtonFg)
	add("at", barAt[o.BannerPosition])
	if o.BannerPosition == "wide" {
		add("width", "none")
	}
	if o.BannerRadius > 0 {
		add("round", strconv.Itoa(o.BannerRadius)+"px")
	}
	out := ""
	if len(vars) > 0 {
		out = ":host{" + strings.Join(vars, ";") + "}"
	}
	return out + o.BannerCSS
}

// prelude carries a site's settings into its script without spending a byte
// of the tracker's budget: it sets the same data attributes the snippet
// reads, on the very script being executed. A site's script has its own URL
// (/js/<site id>.js), so this stays cacheable.
func prelude(o ScriptOpts) string {
	var b strings.Builder
	set := func(key, val string) {
		if val == "" {
			return
		}
		q, _ := json.Marshal(val) // the wording is free text in any language
		b.WriteString("document.currentScript.dataset." + key + "=" + string(q) + ";")
	}
	if o.ConsentFree {
		b.WriteString("document.currentScript.dataset.cookieless='';")
	}
	set("bannerText", o.BannerText)
	set("bannerAccept", o.BannerAccept)
	set("bannerDecline", o.BannerDecline)
	set("bannerPolicy", o.BannerPolicy)
	set("bannerCss", bannerCSS(o))
	return b.String()
}

// Tracker serves the browser script:
//
//	/js/t.js          every feature (the classic snippet with data-site)
//	/js/<site id>.js  only what that site's modules turn on
//
// Caching is one hour with a day of stale-while-revalidate, so turning a
// module on or off reaches visitors within the hour.
func Tracker(features SiteFeatures, opts SiteScript) http.Handler {
	all := scriptFor([]string{"goals", "outbound", "checkout"})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s := all
		pre := ""
		if name := strings.TrimSuffix(path.Base(r.URL.Path), ".js"); name != "t" && features != nil {
			if !strings.HasPrefix(name, "tkb_") {
				http.NotFound(w, r)
				return
			}
			s = scriptFor(features(name))
			// The site's own script knows its site: a tag copied without
			// data-site still counts (one set on the tag wins).
			q, _ := json.Marshal(name)
			pre = "document.currentScript.dataset.site=document.currentScript.dataset.site||" + string(q) + ";"
			if opts != nil {
				pre += prelude(opts(name))
			}
		}
		if pre != "" {
			// The etag has to follow the prelude: change the wording and the
			// browser must fetch the new script, not keep the old one.
			sum := sha256.Sum256([]byte(pre))
			s = script{body: append([]byte(pre), s.body...), etag: `"` + hex.EncodeToString(sum[:6]) + strings.Trim(s.etag, `"`) + `"`}
		}
		h := w.Header()
		h.Set("Content-Type", "application/javascript; charset=utf-8")
		h.Set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("ETag", s.etag)
		if r.Header.Get("If-None-Match") == s.etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		_, _ = w.Write(s.body)
	})
}

// ETagMatch says whether an If-None-Match header holds a validator: the tag
// itself, or its weak form (a compressed answer carries the tag as W/"x").
func ETagMatch(header, etag string) bool {
	for _, t := range strings.Split(header, ",") {
		if strings.TrimPrefix(strings.TrimSpace(t), "W/") == etag {
			return true
		}
	}
	return false
}

// OnlineSuffix ends the name of a corner widget's script: /js/<widget id>.online.js.
const OnlineSuffix = ".online.js"

// OnlineLook is what the corner script needs to know about one widget.
type OnlineLook struct {
	ID    string
	W, H  int    // the frame, in px
	Theme string // auto, dark or light
	Pos   string // bl or br when Settings chose a corner; empty leaves it to the pasted tag
}

// OnlineScript serves /js/<widget id>.online.js: the small separate script
// that puts an "online" widget in a corner of the page it is pasted into
// (never part of the tracker). The widget's own settings reach it the way a
// site's settings reach the tracker, as data attributes on its own tag, so
// the file is kept by the browser but checked on every load. An unknown id, a widget that is off and one of
// another design all answer not found: nothing shows.
func OnlineScript(look func(ctx context.Context, id string) (OnlineLook, bool)) http.Handler {
	body, err := assets.ReadFile("assets/online.js")
	if err != nil {
		panic(err) // build error: the script was not embedded
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSuffix(path.Base(r.URL.Path), OnlineSuffix)
		l, ok := look(r.Context(), id)
		if !ok {
			w.Header().Set("Cache-Control", "no-store")
			http.NotFound(w, r)
			return
		}
		q := func(v any) string { b, _ := json.Marshal(v); return string(b) }
		pre := ""
		look := [][2]string{{"id", l.ID}, {"w", strconv.Itoa(l.W)}, {"h", strconv.Itoa(l.H)}, {"theme", l.Theme}}
		if l.Pos != "" {
			look = append(look, [2]string{"pos", l.Pos})
		}
		for _, kv := range look {
			pre += "document.currentScript.dataset." + kv[0] + "=" + q(kv[1]) + ";"
		}
		out := append([]byte(pre), body...)
		sum := sha256.Sum256(out)
		etag := `"` + hex.EncodeToString(sum[:8]) + `"`
		h := w.Header()
		h.Set("Content-Type", "application/javascript; charset=utf-8")
		h.Set("X-Content-Type-Options", "nosniff")
		// Checked on every load, answered with a bare 304 while nothing changed:
		// the look (size, theme, corner) is in the file, so a change in Settings
		// reaches the next page that loads it.
		h.Set("Cache-Control", "no-cache")
		h.Set("ETag", etag)
		if ETagMatch(r.Header.Get("If-None-Match"), etag) {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		_, _ = w.Write(out)
	})
}

// Dashboard serves the single-page app: real files when they exist (hashed
// assets cached forever), index.html for every other route.
// Dashboard serves the dashboard with no page ever framed by another site.
func Dashboard() http.Handler { return DashboardFramed(nil) }

// The build stores each text file of 1 KB or more once, as name.gz, and
// removes the plain file (dashboard/scripts/precompress.mjs): the image carries
// one copy. A browser that takes gzip is sent the stored bytes as they are; any
// other client, and any range request, gets the file decompressed.

// Accepts reads an Accept-Encoding header for one coding: named, or by *, and
// not given q=0. A coding the header names settles it, whatever * says.
func Accepts(header, coding string) bool {
	star := false
	for _, part := range strings.Split(header, ",") {
		name, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		name = strings.ToLower(strings.TrimSpace(name))
		if name != coding && name != "*" {
			continue
		}
		q := 1.0
		if k, v, found := strings.Cut(strings.ReplaceAll(params, " ", ""), "="); found && strings.EqualFold(k, "q") {
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				q = f
			}
		}
		if name == coding {
			return q > 0
		}
		star = q > 0
	}
	return star
}

// storedPlain reads a dashboard file in plain bytes, from the file itself or
// from its gzip.
func storedPlain(fsys fs.FS, name string) ([]byte, bool) {
	if b, err := fs.ReadFile(fsys, name); err == nil {
		return b, true
	}
	f, err := fsys.Open(name + ".gz")
	if err != nil {
		return nil, false
	}
	defer f.Close()
	zr, err := gzip.NewReader(f)
	if err != nil {
		return nil, false
	}
	b, err := io.ReadAll(zr)
	return b, err == nil
}

// serveStored answers for a file that is kept as name.gz only. It reports
// whether there is such a file. Every answer varies by Accept-Encoding.
func serveStored(w http.ResponseWriter, r *http.Request, fsys fs.FS, name string) bool {
	f, err := fsys.Open(name + ".gz")
	if err != nil {
		return false
	}
	defer f.Close()
	kind := mime.TypeByExtension(path.Ext(name))
	w.Header().Add("Vary", "Accept-Encoding")
	w.Header().Set("Content-Type", kind)
	body, seekable := f.(io.ReadSeeker)
	info, err := f.Stat()
	if seekable && err == nil && r.Header.Get("Range") == "" && Accepts(r.Header.Get("Accept-Encoding"), "gzip") {
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10)) // ServeContent leaves it out of an encoded answer
		http.ServeContent(w, r, name, time.Time{}, body)
		return true
	}
	plain, ok := storedPlain(fsys, name)
	if !ok {
		http.Error(w, "unreadable file", http.StatusInternalServerError)
		return true
	}
	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(plain))
	return true
}

// DashboardFramed is Dashboard, with one exception: frame returns the sites
// allowed to frame this page (space-separated origins), or "" for none. Only
// an embeddable share link answers anything.
func DashboardFramed(frame func(*http.Request) string) http.Handler {
	sub, _ := fs.Sub(dist, "dist")
	files := http.FileServerFS(sub)
	// The page is the one file every route answers with: read once, here, as
	// it is stored and in plain bytes.
	index, _ := storedPlain(sub, "index.html")
	indexGz, _ := fs.ReadFile(sub, "index.html.gz")
	worker := serviceWorker(sub, index)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		switch p {
		case "sw.js":
			if worker != nil {
				serveWorker(w, r, worker)
				return
			}
		case "manifest.webmanifest":
			// Go's table of types may not know this one, and a browser that is
			// sent text/plain does not read it as a manifest.
			w.Header().Set("Content-Type", "application/manifest+json")
			w.Header().Set("Cache-Control", "no-cache")
		}
		if p != "" && p != "index.html" {
			if f, err := sub.Open(p); err == nil {
				f.Close()
				if strings.HasPrefix(p, "assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				files.ServeHTTP(w, r)
				return
			}
			assetPath := strings.HasPrefix(p, "assets/")
			if assetPath {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			if serveStored(w, r, sub, p) {
				return
			}
			w.Header().Del("Cache-Control")
			// A file of a build that is gone (a tab opened before a deploy asks
			// for it) is a 404 a script loader can tell from a script, never
			// the page: the page would load as a module and fail on its type.
			if assetPath {
				w.Header().Set("Cache-Control", "no-store")
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
		}
		h := w.Header()
		h.Set("Content-Type", "text/html; charset=utf-8")
		h.Set("Cache-Control", "no-cache")
		// Nothing loads from anywhere but this server: no fonts, no CDN, no
		// third party. German courts have fined sites for embedding Google
		// Fonts, and trckable never asks a browser to talk to anyone else.
		// Frames too: only this origin's own pages, never another site's. The
		// heatmap overlay frames a page of this origin that frames the owner's own
		// site, under a policy of its own (api.heatFrame).
		ancestors := "'none'"
		if frame != nil {
			if o := frame(r); o != "" {
				ancestors = o
			}
		}
		h.Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' https://api.github.com; frame-src 'self'; frame-ancestors "+ancestors+"; base-uri 'self'; form-action 'self'; object-src 'none'")
		if ancestors == "'none'" {
			h.Set("X-Frame-Options", "DENY") // older browsers that ignore frame-ancestors
		}
		h.Set("Referrer-Policy", referrerPolicy(r.URL.Path))
		body := index
		if len(indexGz) > 0 {
			h.Add("Vary", "Accept-Encoding")
			if Accepts(r.Header.Get("Accept-Encoding"), "gzip") {
				h.Set("Content-Encoding", "gzip")
				body = indexGz
			}
		}
		_, _ = w.Write(body)
	})
}

// serviceWorker is public/sw.js with its version filled in: the hash of the
// page. A deploy that changes the dashboard changes the page's name for every
// file in it, so the worker's bytes change too, and the browser installs it
// and drops the old shell. nil when the build has no worker.
func serviceWorker(fsys fs.FS, index []byte) []byte {
	src, ok := storedPlain(fsys, "sw.js")
	if !ok {
		return nil
	}
	sum := sha256.Sum256(index)
	return bytes.ReplaceAll(src, []byte("__V__"), []byte(hex.EncodeToString(sum[:6])))
}

// serveWorker answers /sw.js. It is never kept (a stale worker is a stale app,
// whatever a proxy in between thinks) and may control the whole site, which is
// the dashboard's own scope.
func serveWorker(w http.ResponseWriter, r *http.Request, body []byte) {
	h := w.Header()
	h.Set("Content-Type", "text/javascript; charset=utf-8")
	h.Set("Cache-Control", "no-cache")
	h.Set("Service-Worker-Allowed", "/")
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(body)
}

// referrerPolicy sends nothing at all from a shared page, whose address holds
// its link's token; everywhere else the address stays inside this origin.
func referrerPolicy(p string) string {
	if p == "/s" || strings.HasPrefix(p, "/s/") {
		return "no-referrer"
	}
	return "same-origin"
}
