package ingest

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// Heat takes what the heatmaps script reports: where on a page people click,
// which clicks do nothing, and which form field a form was left at.
//
//	POST /api/h
//	{"s":"tkb_…","u":"https://site/page","w":1440,"h":5200,"i":[["v"],["c","main>button.buy",2,5,69,50,69,40],["fr","signup>email"]]}
//
// Nothing about a person is in it, and nothing about a person is kept: the
// items are added to counters (heatCounts) per site, day, page, window width,
// element and place in the element, and the batch is forgotten. There is no
// visitor id, no session, no order of events and no typed text. A field is
// only ever its name.
//
// It answers 202 for a site with the module off, so a script cached from
// before the switch is quiet rather than noisy.
func (h *Handler) Heat(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, heatMaxBody+1))
	if err != nil || len(body) > heatMaxBody {
		h.reject(w, http.StatusRequestEntityTooLarge, errBadPayload)
		return
	}
	var p struct {
		Site   string  `json:"s"`
		URL    string  `json:"u"`
		Width  int     `json:"w"`
		Height int     `json:"h"`
		Dev    int     `json:"dev"`
		Items  [][]any `json:"i"`
	}
	if err := json.Unmarshal(body, &p); err != nil || len(p.Items) == 0 || len(p.Items) > heatMaxItems || p.Width < 200 || p.Width > 10000 {
		h.reject(w, http.StatusBadRequest, errBadPayload)
		return
	}
	site, ok := h.Sites.Site(p.Site)
	if !ok {
		h.reject(w, http.StatusNotFound, errUnknown)
		return
	}
	if h.Module != nil && !h.Module(site.ID, "heatmaps") {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	u, ok := parsePageURL(p.URL, false)
	if !ok || !hostAllowed(u.Host, site, p.Dev == 1) {
		h.reject(w, http.StatusBadRequest, errHost)
		return
	}
	// A script on one site cannot report as another: the browser names the page
	// it is on (a sandboxed frame says "null", a server says nothing).
	if o := r.Header.Get("Origin"); o != "" && o != "null" {
		if ou, err := url.Parse(o); err == nil && (ou.Scheme == "http" || ou.Scheme == "https") && strings.TrimPrefix(strings.ToLower(ou.Hostname()), "www.") != u.Host {
			h.reject(w, http.StatusBadRequest, errHost)
			return
		}
	}
	// What the owner left out stays out: paths, browsers that ask not to be
	// measured, their own addresses, and robots.
	if site.Skip(u.Path) || (site.HonorDNT && (r.Header.Get("DNT") == "1" || r.Header.Get("Sec-GPC") == "1")) {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	if ua := parseUA(r.UserAgent(), p.Width); ua.Bot && (p.Dev != 1 || !isLocalHost(u.Host)) {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	ip := h.heatIP(r, site)
	if site.SkipIP(ip) {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	h.heatOnce.Do(func() {
		h.heatLimitIP = newLimiter(heatPerIPRate, heatPerIPBurst)
		h.heatLimitSite = newLimiter(heatPerSiteRate, heatPerSiteBurst)
	})
	now := h.Now()
	if !h.heatLimitIP.allow(site.ID+"|"+ip, now) || !h.heatLimitSite.allow(site.ID, now) {
		w.Header().Set("Retry-After", "30")
		h.reject(w, http.StatusTooManyRequests, errRate)
		return
	}

	base := heatKey{Site: site.ID, Day: now.UTC().Format(time.DateOnly), Path: clip(u.Path, 512), Width: heatBucket(p.Width)}
	if p.Height < 0 || p.Height > heatMaxPx {
		p.Height = 0
	}
	// A batch is all or nothing: one item that makes no sense means the sender
	// is not our script, and none of it is counted.
	type add struct {
		k heatKey
		s heatSum
	}
	adds := make([]add, 0, len(p.Items))
	for _, it := range p.Items {
		k, s, ok := heatItem(base, it, p.Width, p.Height)
		if !ok {
			h.reject(w, http.StatusBadRequest, errBadPayload)
			return
		}
		adds = append(adds, add{k, s})
	}
	for _, a := range adds {
		h.Heats.add(a.k, a.s)
	}
	h.markSeen(site.ID, now)
	w.WriteHeader(http.StatusAccepted)
}

// heatIP is the address the rate limit counts, by the same rules as events:
// behind a proxy that proves itself with the site's key, the address it forwards.
func (h *Handler) heatIP(r *http.Request, site Site) string {
	ip := h.ClientIP(r)
	if site.ProxyKey != "" && auth.Equal(r.Header.Get(proxyKeyHeader), site.ProxyKey) {
		fwd := strings.TrimSpace(r.Header.Get(proxyIPHeader))
		if fwd == "" {
			fwd = strings.TrimSpace(r.Header.Get("X-Real-IP"))
		}
		if fwd != "" {
			ip = fwd
		}
	}
	return ip
}

const (
	heatMaxBody  = 16 << 10
	heatMaxItems = 80 // the script sends at most 61 (a page and 60 reports)
	heatMaxPx    = 200_000

	// One address may send this much to one site, and one site may receive this
	// much from everyone: a batch is a page view's worth, so these are far above
	// what real visitors do and below what could fill the store.
	heatPerIPRate    = 2
	heatPerIPBurst   = 60
	heatPerSiteRate  = 300
	heatPerSiteBurst = 3000

	// What is held in memory between two writes, in distinct counters. More is
	// dropped: a flood of made-up elements cannot grow the server.
	heatMaxKeys = 50_000
)

// The widths a page is looked at in. A visit is filed under the one it is
// closest to; the overlay shows the page at that width.
const (
	HeatPhone   = 390
	HeatTablet  = 768
	HeatDesktop = 1280
)

func heatBucket(w int) uint16 {
	switch {
	case w < 640:
		return HeatPhone
	case w < 1024:
		return HeatTablet
	}
	return HeatDesktop
}

// An element is its tag, id and class names, and where it sits among its
// siblings; a field is "form>field". Letters, digits and a few signs: nothing
// that could carry a sentence.
var heatEl = regexp.MustCompile(`^[\w#.:>\[\]-]{1,120}$`)

// Kinds of report. A page is counted ("v"), a click lands ("c"), a click that
// looks clickable changes nothing ("d"), three clicks on one element in a
// second ("r"), a form field is reached ("fr") and a form is left at a field
// ("fd").
const (
	HeatView  = "v"
	HeatClick = "c"
	HeatDead  = "d"
	HeatRage  = "r"
	HeatField = "fr"
	HeatLeft  = "fd"
)

type heatKey struct {
	Site, Day, Path string
	Width           uint16
	Kind, El        string
	CX, CY          uint8 // the tenth of the element's width and height a click landed in
}

// heatSum is what is added to a counter: how many, and the sums the place and
// size of the element are averaged from. For a page view, W is the window's
// width and H the page's height, summed, so the page can be drawn as it was.
type heatSum struct{ N, X, Y, W, H uint64 }

// num reads a whole number in [0, max] out of a decoded JSON value.
func num(v any, max float64) (uint64, bool) {
	f, ok := v.(float64)
	if !ok || f < 0 || f > max || f != float64(uint64(f)) {
		return 0, false
	}
	return uint64(f), true
}

// heatItem checks one reported item and says what it adds.
func heatItem(base heatKey, it []any, width, height int) (heatKey, heatSum, bool) {
	if len(it) == 0 {
		return base, heatSum{}, false
	}
	kind, ok := it[0].(string)
	if !ok {
		return base, heatSum{}, false
	}
	k := base
	k.Kind = kind
	switch kind {
	case HeatView:
		if len(it) != 1 {
			return base, heatSum{}, false
		}
		return k, heatSum{N: 1, W: uint64(width), H: uint64(height)}, true //nolint:gosec // width and height were range-checked above
	case HeatClick, HeatDead, HeatRage:
		if len(it) != 8 {
			return base, heatSum{}, false
		}
		el, ok := it[1].(string)
		if !ok || !heatEl.MatchString(el) {
			return base, heatSum{}, false
		}
		k.El = el
		var v [6]uint64
		for i, max := range [6]float64{9, 9, 5000, heatMaxPx, 5000, heatMaxPx} {
			if v[i], ok = num(it[i+2], max); !ok {
				return base, heatSum{}, false
			}
		}
		k.CX, k.CY = uint8(v[0]), uint8(v[1]) //nolint:gosec // at most 9
		return k, heatSum{N: 1, X: v[2], Y: v[3], W: v[4], H: v[5]}, true
	case HeatField, HeatLeft:
		if len(it) != 2 {
			return base, heatSum{}, false
		}
		el, ok := it[1].(string)
		if !ok || !heatEl.MatchString(el) || strings.Count(el, ">") != 1 {
			return base, heatSum{}, false
		}
		k.El = el
		return k, heatSum{N: 1}, true
	}
	return base, heatSum{}, false
}

// HeatRow is one counter, ready to be written.
type HeatRow struct {
	Site, Day, Path string
	Width           uint16
	Kind, El        string
	CX, CY          uint8
	N, X, Y, W, H   uint64
}

// HeatCounts holds what the heatmaps script reported since it was last drained.
// The zero value is ready. Like the bot counts, it lives in memory and is
// written out once a minute (and at shutdown): a crash loses at most that
// minute of counts nobody is billed or charged by.
type HeatCounts struct {
	mu sync.Mutex
	m  map[heatKey]heatSum
}

func (c *HeatCounts) add(k heatKey, s heatSum) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil {
		c.m = map[heatKey]heatSum{}
	}
	cur, seen := c.m[k]
	if !seen && len(c.m) >= heatMaxKeys {
		return
	}
	cur.N += s.N
	cur.X += s.X
	cur.Y += s.Y
	cur.W += s.W
	cur.H += s.H
	c.m[k] = cur
}

// Drain returns everything counted so far and starts again from nothing, so
// each report is handed over exactly once. A write that fails gives its rows
// back with Restore.
func (c *HeatCounts) Drain() []HeatRow {
	c.mu.Lock()
	m := c.m
	c.m = nil
	c.mu.Unlock()
	out := make([]HeatRow, 0, len(m))
	for k, s := range m {
		out = append(out, HeatRow{k.Site, k.Day, k.Path, k.Width, k.Kind, k.El, k.CX, k.CY, s.N, s.X, s.Y, s.W, s.H})
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		for _, d := range []int{strings.Compare(a.Site, b.Site), strings.Compare(a.Day, b.Day), strings.Compare(a.Path, b.Path), int(a.Width) - int(b.Width), strings.Compare(a.Kind, b.Kind), strings.Compare(a.El, b.El), int(a.CX) - int(b.CX), int(a.CY) - int(b.CY)} {
			if d != 0 {
				return d < 0
			}
		}
		return false
	})
	return out
}

// Restore puts drained counts back after a write that did not happen.
func (c *HeatCounts) Restore(rows []HeatRow) {
	for _, r := range rows {
		c.add(heatKey{r.Site, r.Day, r.Path, r.Width, r.Kind, r.El, r.CX, r.CY}, heatSum{r.N, r.X, r.Y, r.W, r.H})
	}
}
