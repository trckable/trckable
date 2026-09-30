// Package web serves trckable's embedded static assets: the browser script
// (one prebuilt variant per module combination) and the dashboard. Everything
// is compiled into the binary, so a deploy is always one file.
package web

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed assets/t.js assets/t-*.js assets/sizes.json
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

// scriptFor loads a variant, falling back to the full script.
func scriptFor(features []string) script {
	name := variantFor(features)
	scriptsMu.RLock()
	s, ok := scripts[name]
	scriptsMu.RUnlock()
	if ok {
		return s
	}
	body, err := assets.ReadFile("assets/t-" + name + ".js")
	if err != nil {
		if body, err = assets.ReadFile("assets/t.js"); err != nil {
			panic(err) // build error: the tracker was not embedded
		}
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

// Variants lists the built script variants, smallest first (for the docs).
func Variants() []string {
	out := make([]string, 0, len(TrackerSizes().Variants))
	for k := range TrackerSizes().Variants {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// Dashboard serves the single-page app: real files when they exist (hashed
// assets cached forever), index.html for every other route.
// Dashboard serves the dashboard with no page ever framed by another site.
func Dashboard() http.Handler { return DashboardFramed(nil) }

// encoding is one way the build stores a file next to the plain one
// (dashboard/scripts/precompress.mjs): app.js.br, app.js.gz.
type encoding struct{ token, ext string }

// encodings are in the order they are preferred: brotli is the smaller.
var encodings = []encoding{{"br", ".br"}, {"gzip", ".gz"}}

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

// twins lists the stored encodings of a file that a browser's header allows.
func twins(fsys fs.FS, name, accept string) (all bool, ok []encoding) {
	for _, e := range encodings {
		if _, err := fs.Stat(fsys, name+e.ext); err != nil {
			continue
		}
		all = true
		if Accepts(accept, e.token) {
			ok = append(ok, e)
		}
	}
	return all, ok
}

// serveEncoded answers with a file's precompressed twin when the browser
// accepts one. Any file that has a twin varies by Accept-Encoding, whichever
// way it is answered. It reports whether it answered.
func serveEncoded(w http.ResponseWriter, r *http.Request, fsys fs.FS, name string) bool {
	has, ok := twins(fsys, name, r.Header.Get("Accept-Encoding"))
	if has {
		w.Header().Add("Vary", "Accept-Encoding")
	}
	kind := mime.TypeByExtension(path.Ext(name))
	// A range is over the plain bytes: it is answered from the plain file.
	if len(ok) == 0 || kind == "" || r.Header.Get("Range") != "" {
		return false
	}
	f, err := fsys.Open(name + ok[0].ext)
	if err != nil {
		return false
	}
	defer f.Close()
	body, isSeeker := f.(io.ReadSeeker)
	info, err := f.Stat()
	if !isSeeker || err != nil {
		return false
	}
	w.Header().Set("Content-Type", kind)
	w.Header().Set("Content-Encoding", ok[0].token)
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10)) // ServeContent leaves it out of an encoded answer
	http.ServeContent(w, r, name, time.Time{}, body)
	return true
}

// DashboardFramed is Dashboard, with one exception: frame returns the sites
// allowed to frame this page (space-separated origins), or "" for none. Only
// an embeddable share link answers anything.
func DashboardFramed(frame func(*http.Request) string) http.Handler {
	sub, _ := fs.Sub(dist, "dist")
	files := http.FileServerFS(sub)
	index, _ := fs.ReadFile(sub, "index.html")
	// The page is the one file every route answers with: its stored encodings
	// are read once, here.
	indexTwin := map[string][]byte{}
	for _, e := range encodings {
		if b, err := fs.ReadFile(sub, "index.html"+e.ext); err == nil {
			indexTwin[e.token] = b
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p != "" && p != "index.html" {
			if f, err := sub.Open(p); err == nil {
				f.Close()
				if strings.HasPrefix(p, "assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				if serveEncoded(w, r, sub, p) {
					return
				}
				files.ServeHTTP(w, r)
				return
			}
		}
		h := w.Header()
		h.Set("Content-Type", "text/html; charset=utf-8")
		h.Set("Cache-Control", "no-cache")
		// Nothing loads from anywhere but this server: no fonts, no CDN, no
		// third party. German courts have fined sites for embedding Google
		// Fonts, and trckable never asks a browser to talk to anyone else.
		// Frames too: only this origin's own pages, never another site's.
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
		h.Set("Referrer-Policy", "same-origin")
		body := index
		for _, e := range encodings {
			if b, ok := indexTwin[e.token]; ok && Accepts(r.Header.Get("Accept-Encoding"), e.token) {
				h.Set("Content-Encoding", e.token)
				body = b
				break
			}
		}
		if len(indexTwin) > 0 {
			h.Add("Vary", "Accept-Encoding")
		}
		_, _ = w.Write(body)
	})
}
