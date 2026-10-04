// Package ingest is trckable's public event endpoint (POST /api/e).
//
// The tracker sends only raw signals; everything else is derived here. The
// IP address is used for geo and the cookieless hash, then dropped: it never
// enters the event, the WAL, or the database.
package ingest

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/ipfilter"
	"github.com/trckable/trckable/server/internal/wal"

	"github.com/trckable/trckable/server/internal/auth"
)

const (
	maxBody   = 8 << 10
	maxAgeMs  = int64(event.MaxAge / time.Millisecond) // the tracker's queue lifetime, 24 h, and an hour of margin
	maxProps  = 10
	maxPropKV = 255
)

// Site is what ingest needs to know about a site.
type Site struct {
	ID       string
	Domain   string   // root domain; subdomains are allowed automatically
	Allowed  []string // extra allowed hostnames (cross-domain)
	HashMode bool
	ProxyKey string // secret sent by same-origin proxies (X-Trckable-Proxy-Key)

	// Per-site choices (Settings → General and Privacy). Defaults keep every
	// analytics signal: a site only gives something up when its owner says so.
	ExcludePaths []string // globs that are never recorded, e.g. /admin/*
	HonorDNT     bool     // drop visits from browsers sending DNT or GPC
	NoCity       bool     // keep the country, drop region and city
	BotStrict    bool     // drop visits from data centres and clients that name no browser
	// ConsentFree keeps nothing in the browser and no city, so the site can
	// run analytics without a consent banner. Enforced here, not trusted to
	// the tracker: a stale script cannot opt back in.
	ConsentFree bool
	// ExcludeIPs are the owner's own addresses and ranges. A visit from one is
	// dropped before the address is hashed or looked up, so it is never counted,
	// billed or stored. Only this list is kept, never who matched it.
	ExcludeIPs []netip.Prefix
}

// Skip reports whether a path is excluded for this site. A trailing * matches
// a prefix; everything else is an exact match, so a rule can never surprise.
func (s Site) Skip(path string) bool {
	for _, p := range s.ExcludePaths {
		if strings.HasSuffix(p, "*") {
			if strings.HasPrefix(path, strings.TrimSuffix(p, "*")) {
				return true
			}
		} else if path == p {
			return true
		}
	}
	return false
}

// SkipIP reports whether a visitor address is one the owner left out.
func (s Site) SkipIP(ip string) bool { return ipfilter.Match(s.ExcludeIPs, ip) }

// Geo resolves a client IP to a location (the IP is not kept).
type Geo func(ip string) (country, region, city string)

// Seen records that a site is alive. Optional: without it the dashboard just
// cannot say "live" next to a site's name.
type Seen interface {
	SeenSite(ctx context.Context, site string, at int64)
}

// Sites resolves site ids (cached in memory by the caller).
type Sites interface {
	Site(id string) (Site, bool)
}

// IPResolver extracts the client IP according to the deployment's trust model.
type IPResolver func(r *http.Request) string

// Stats are cheap counters exposed on /metrics and the health panel.
type Stats struct {
	Accepted, Bots, Rejected atomic.Uint64
}

// Handler serves POST /api/e.
type Handler struct {
	Log      *wal.Log
	Sites    Sites
	Salts    *Salts
	ClientIP IPResolver
	// Hosting reports whether an address belongs to a network that only hosts
	// servers. Used by stricter bot filtering; nil means unknown.
	Hosting func(ip string) bool
	Geo     Geo // optional
	Now     func() time.Time
	Stats   Stats
	Seen    Seen // optional: records that a site is alive
	// Module reports whether a site has a module on; nil means every module
	// is on. Only endpoints that exist for one module ask (the crawler one).
	Module func(site, id string) bool

	// Bots counts what was turned away, per site and day, for the Visitors
	// tile. The server writes it out once a minute (botcount.go).
	Bots BotCounts

	// Heats counts what the heatmaps script reported, per element and day
	// (heat.go). Written out with the bot counts.
	Heats                      HeatCounts
	heatOnce                   sync.Once
	heatLimitIP, heatLimitSite *limiter

	limitOnce sync.Once
	limit     *limiter
	limitIP   *limiter
	seenMu    sync.Mutex
	seenAt    map[string]int64
}

// markSeen notes that a site is sending events, at most once a minute so the
// control plane is never in the hot path.
func (h *Handler) markSeen(site string, now time.Time) {
	if h.Seen == nil {
		return
	}
	unix := now.Unix()
	h.seenMu.Lock()
	if h.seenAt == nil {
		h.seenAt = map[string]int64{}
	}
	last := h.seenAt[site]
	if unix-last < 60 {
		h.seenMu.Unlock()
		return
	}
	h.seenAt[site] = unix
	h.seenMu.Unlock()
	go h.Seen.SeenSite(context.Background(), site, unix)
}

const (
	proxyKeyHeader = "X-Trckable-Proxy-Key"
	proxyIPHeader  = "X-Trckable-Client-IP"
	visitorCookie  = "trckable_vid"
	cookieMaxAge   = 400 * 24 * 60 * 60 // the maximum browsers honour
)

// payload is the tracker's wire format (short keys keep the script tiny).
type payload struct {
	Site       string            `json:"s"`
	Kind       string            `json:"k"` // "pv" | "g" | "e"
	URL        string            `json:"u"`
	Referrer   string            `json:"r"`
	Width      int               `json:"w"`
	Lang       string            `json:"l"`
	ID         string            `json:"id"` // event id, base36
	Age        int64             `json:"a"`  // ms since the event happened (queued retries)
	PV         string            `json:"pv"` // pageview id, base36
	Visitor    string            `json:"v"`  // trckable_vid value, when the tracker manages it
	Goal       string            `json:"n"`
	Props      map[string]string `json:"p"`
	Engaged    uint32            `json:"en"` // running total of visible ms for this pageview
	Scroll     uint8             `json:"sc"`
	LCP        uint32            `json:"lcp"` // Core Web Vitals, with that module on
	CLS        uint32            `json:"cls"` // thousandths
	INP        uint32            `json:"inp"`
	Dev        int               `json:"dev"` // localhost allowed (tracker data-dev)
	Cookieless int               `json:"c"`   // visitor is in cookieless mode: never set a cookie
}

var (
	errBadPayload = errors.New("bad payload")
	errUnknown    = errors.New("unknown site")
	errHost       = errors.New("hostname not allowed")
	errRate       = errors.New("rate limited")
)

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
	if err != nil || len(body) > maxBody {
		h.reject(w, http.StatusRequestEntityTooLarge, errBadPayload)
		return
	}
	var p payload
	if err := json.Unmarshal(body, &p); err != nil {
		h.reject(w, http.StatusBadRequest, errBadPayload)
		return
	}
	ev, drop, cookie, err := h.build(r, &p)
	if err == nil && drop == "" && ev != nil {
		h.markSeen(ev.Site, h.Now())
	}
	if err == errRate {
		w.Header().Set("Retry-After", "10")
		h.reject(w, http.StatusTooManyRequests, err)
		return
	}
	if err != nil {
		h.reject(w, http.StatusBadRequest, err)
		return
	}
	if drop != "" {
		h.Stats.Bots.Add(1)
		if drop != dropOwner {
			h.Bots.Add(p.Site, h.Now(), drop) // only for a site build found: it knew the id
		}
		w.WriteHeader(http.StatusAccepted) // don't tell bots anything
		return
	}
	b, err := ev.Marshal()
	if err != nil {
		h.reject(w, http.StatusInternalServerError, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if _, err := h.Log.Append(ctx, b); err != nil {
		// WAL unavailable (shutting down, disk full): 503 makes the tracker
		// keep the event in its queue and retry.
		slog.Warn("ingest: wal append failed", "err", err)
		w.Header().Set("Retry-After", "5")
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	h.Stats.Accepted.Add(1)
	if cookie != nil {
		http.SetCookie(w, cookie)
	}
	w.WriteHeader(http.StatusAccepted)
}

func (h *Handler) reject(w http.ResponseWriter, code int, err error) {
	h.Stats.Rejected.Add(1)
	msg := err.Error()
	if code >= http.StatusInternalServerError { // the reason is for the log
		slog.Error("ingest: event not accepted", "status", code, "err", err)
		msg = "internal error"
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(code)
	_, _ = io.WriteString(w, msg) // if this fails the client has gone
}

// dropOwner marks a visit the site's owner chose to leave out (an excluded
// path, Do Not Track): dropped like a bot, but never counted as one.
const dropOwner = "owner"

// build makes the event for a payload. drop is empty for a visit that is kept;
// otherwise the visit is dropped, as one of the Bot kinds or dropOwner.
func (h *Handler) build(r *http.Request, p *payload) (*event.Event, string, *http.Cookie, error) {
	site, ok := h.Sites.Site(p.Site)
	if !ok {
		return nil, "", nil, errUnknown
	}
	u, ok := parsePageURL(p.URL, site.HashMode)
	if !ok {
		return nil, "", nil, errBadPayload
	}
	if !hostAllowed(u.Host, site, p.Dev == 1) {
		return nil, "", nil, errHost
	}
	// A browser always says which site it is on. When it does, that site must
	// be the page the event claims: a script on one site cannot post events
	// as another. Server-side senders carry no Origin, and a sandboxed frame
	// sends "null"; neither is refused here.
	if o := r.Header.Get("Origin"); o != "" && o != "null" {
		if ou, err := url.Parse(o); err == nil && (ou.Scheme == "http" || ou.Scheme == "https") && strings.TrimPrefix(strings.ToLower(ou.Hostname()), "www.") != u.Host {
			return nil, "", nil, errHost
		}
	}
	// Paths the owner excluded, and browsers they promised to respect, are
	// dropped before anything is parsed or stored. (A browser the owner asked
	// to leave out, ?trckable=ignore, never sends: the tracker keeps that flag
	// itself, so it works behind a proxy as well.)
	if site.Skip(u.Path) {
		return nil, dropOwner, nil, nil
	}
	if site.HonorDNT && (r.Header.Get("DNT") == "1" || r.Header.Get("Sec-GPC") == "1") {
		return nil, dropOwner, nil, nil
	}
	ua := parseUA(r.UserAgent(), p.Width)
	// Dev mode lets developers test their own site with automated browsers,
	// but only on localhost: a dev flag on a real hostname changes nothing.
	if ua.Bot && (p.Dev != 1 || !isLocalHost(u.Host)) {
		return nil, ua.BotKind, nil, nil
	}
	// Strict mode also drops clients that name no browser at all: quieter
	// numbers, at the cost of missing a few odd but real visitors.
	if site.BotStrict && (ua.Browser == "" || ua.Browser == "Other") {
		return nil, BotOther, nil, nil
	}

	// A same-origin proxy proves itself with the site's secret; only then do
	// we trust the visitor IP it forwards and set the cookie server-side.
	proxied := site.ProxyKey != "" && auth.Equal(r.Header.Get(proxyKeyHeader), site.ProxyKey)
	ip := h.ClientIP(r)
	if proxied {
		// Our own header first; X-Real-IP too, because that is what a stock
		// Nginx recipe sets, and our own docs once said so. Either counts
		// only with the proxy key: without it a visitor could name any IP.
		fwd := strings.TrimSpace(r.Header.Get(proxyIPHeader))
		if fwd == "" {
			fwd = strings.TrimSpace(r.Header.Get("X-Real-IP"))
		}
		if fwd != "" {
			ip = fwd
		}
	}
	// The owner's own addresses are left out first: before the data-centre
	// lookup, the rate limit and the hash, so nothing about them is used.
	if site.SkipIP(ip) {
		return nil, dropOwner, nil, nil // the owner's choice: not counted as a bot either
	}
	// Stricter filtering also drops visits from rented servers: a browser
	// running in a data centre is a script, not a reader.
	if site.BotStrict && h.Hosting != nil && h.Hosting(ip) {
		return nil, BotHosting, nil, nil
	}
	h.limitOnce.Do(func() {
		h.limit = newLimiter(10, 60)
		h.limitIP = newLimiter(perIPRate, perIPBurst)
	})
	// Per visitor, and per address for the site as a whole: the visitor id
	// comes from the client, so a script that invents a new one per request
	// would otherwise never be limited.
	if !h.limit.allow(ip+"|"+p.Visitor, h.Now()) || !h.limitIP.allow(site.ID+"|"+ip, h.Now()) {
		return nil, "", nil, errRate
	}

	now := h.Now()
	// An event made after a long outage says how old it is. A negative age is a
	// clock that runs fast: it is today's. One older than the tracker ever keeps
	// is not a late visit but a wrong clock (or someone choosing a date), and a
	// day it was never on is worse than a missing event: it is refused, and the
	// tracker, which treats a 4xx as final, drops it.
	age := p.Age
	if age < 0 {
		age = 0
	} else if age > maxAgeMs {
		return nil, "", nil, errBadPayload
	}
	e := &event.Event{
		Site:     site.ID,
		TS:       now.UnixMilli() - age,
		EventID:  parseID(p.ID),
		Late:     age > int64(event.LateAfter/time.Millisecond),
		Pageview: parseID(p.PV),
		Hostname: u.Host,
		Path:     clip(u.Path, 512),
		Browser:  ua.Browser,
		OS:       ua.OS,
		Device:   ua.Device,
		Language: normLang(p.Lang),
	}
	if p.Width > 0 && p.Width < 20000 {
		e.Screen = uint16(p.Width)
	}
	e.BrowserVersion = ua.Version

	switch p.Kind {
	case "pv", "":
		e.Kind = event.KindPageview
		e.RefHost, e.RefURL = parseReferrer(p.Referrer, u.Host)
		// Referrer spam is never a visit, whatever the site's settings.
		if isSpam(e.RefHost) {
			return nil, BotOther, nil, nil
		}
		e.Channel = classify(u, e.RefHost, e.RefURL)
		e.UTMSource, e.UTMMedium, e.UTMCampaign, e.UTMTerm, e.UTMContent =
			u.UTMSource, u.UTMMedium, u.UTMCampaign, u.UTMTerm, u.UTMCont
		if e.RefHost == "" && u.Ref != "" {
			e.RefHost = strings.ToLower(u.Ref)
		}
	case "g":
		e.Kind = event.KindGoal
		e.Goal = normGoal(p.Goal)
		if e.Goal == "" {
			return nil, "", nil, errBadPayload
		}
		e.Props = cleanProps(p.Props)
	case "e":
		e.Kind = event.KindEngagement
		e.EngagedMs = p.Engaged
		if p.Scroll <= 100 {
			e.ScrollPct = p.Scroll
		}
		// A page open for a week would report an LCP of a week. These caps are
		// far past anything real, so a wild number is dropped rather than
		// dragging a percentile with it.
		if p.LCP < 6e5 {
			e.LCPms = p.LCP
		}
		if p.CLS < 1e5 {
			e.CLS1k = p.CLS
		}
		if p.INP < 6e5 {
			e.INPms = p.INP
		}
	default:
		return nil, "", nil, errBadPayload
	}

	if h.Geo != nil {
		e.Country, e.Region, e.City = h.Geo(ip)
		if site.NoCity { // "the country is always recorded; region and city are yours"
			e.Region, e.City = "", ""
		}
	}
	if e.Country == "" && !proxied { // trusted edge header (Cloudflare) as a fallback
		if cc := r.Header.Get("CF-IPCountry"); len(cc) == 2 && cc != "XX" {
			e.Country = strings.ToUpper(cc)
		}
	}

	var cookie *http.Cookie
	// Consent-free: whatever the browser sent, the visitor is a daily salted
	// hash and no cookie goes back. A cached script from before the switch
	// cannot keep identifying people.
	if site.ConsentFree {
		e.Visitor = h.Salts.Cookieless(now, site.ID, ip, r.UserAgent())
		e.FirstSeen = 0
		return e, "", forget(proxied, u, site), nil
	}
	if id, fs, ok := parseVisitor(p.Visitor); ok {
		e.Visitor, e.FirstSeen = id, fs
		if proxied {
			cookie = visitorCookieFor(p.Visitor, u, site) // refresh: keeps Safari's 400 days rolling
		}
	} else if proxied && p.Visitor == "" && p.Cookieless == 0 {
		// First visit through the proxy: mint the id server-side.
		v, id, fs := NewVisitor(now)
		e.Visitor, e.FirstSeen = id, fs
		cookie = visitorCookieFor(v, u, site)
	} else {
		e.Visitor = h.Salts.Cookieless(now, site.ID, ip, r.UserAgent())
		if p.Cookieless == 1 {
			cookie = forget(proxied, u, site) // consent withdrawn: the cookie we set goes too
		}
	}
	return e, "", cookie, nil
}

// forget expires the visitor cookie this server set, with the same domain and
// path, for a visitor who is now counted without one. The script cannot delete
// it reliably itself: it does not know which domain the server chose.
func forget(proxied bool, page parsedURL, s Site) *http.Cookie {
	if !proxied {
		return nil
	}
	c := visitorCookieFor("", page, s) //nolint:gosec // the same cookie as below, expired
	c.MaxAge = -1
	return c
}

// visitorCookieFor builds the server-set visitor cookie. It is readable by the
// tracker (not HttpOnly) so it can be attached to checkout metadata; scoped to
// the site's root domain when the page is on it, so subdomains share it.
func visitorCookieFor(value string, page parsedURL, s Site) *http.Cookie {
	c := &http.Cookie{ //nolint:gosec // the tracker must read it (not HttpOnly); Secure follows the page so local http dev works
		Name:     visitorCookie,
		Value:    value,
		Path:     "/",
		MaxAge:   cookieMaxAge,
		Secure:   page.Secure, // Safari drops Secure cookies on http:// (local dev)
		SameSite: http.SameSiteLaxMode,
	}
	if page.Host == s.Domain || strings.HasSuffix(page.Host, "."+s.Domain) {
		c.Domain = s.Domain
	}
	return c
}

func isLocalHost(host string) bool {
	return host == "localhost" || host == "127.0.0.1" || host == "0.0.0.0" || host == "[::1]" || host == "::1"
}

func hostAllowed(host string, s Site, dev bool) bool {
	if isLocalHost(host) {
		return dev // the tracker opts in with data-dev
	}
	if host == s.Domain || strings.HasSuffix(host, "."+s.Domain) {
		return true
	}
	for _, a := range s.Allowed {
		if host == a || strings.HasSuffix(host, "."+a) {
			return true
		}
	}
	return false
}

func parseID(s string) uint64 {
	if s == "" || len(s) > 13 {
		return 0
	}
	v, err := strconv.ParseUint(s, 36, 64)
	if err != nil {
		return 0
	}
	return v
}

func normLang(s string) string {
	if s == "" || len(s) > 35 {
		return ""
	}
	if i := strings.IndexAny(s, "-_"); i > 0 {
		s = s[:i]
	}
	return strings.ToLower(s)
}

// Goal names: lowercase letters, digits, _ - : and at most 64 chars.
func normGoal(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" || len(s) > 64 {
		return ""
	}
	for _, c := range s {
		if (c < 'a' || c > 'z') && (c < '0' || c > '9') && c != '_' && c != '-' && c != ':' {
			return ""
		}
	}
	return s
}

func cleanProps(in map[string]string) map[string]string {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]string, min(len(in), maxProps))
	for k, v := range in {
		if len(out) == maxProps {
			break
		}
		k = normGoal(strings.ReplaceAll(k, "-", "_"))
		if k == "" {
			continue
		}
		out[k] = clip(v, maxPropKV)
	}
	return out
}

// RemoteIP returns the TCP peer address (no proxy trusted).
func RemoteIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// RightmostForwardedIP trusts exactly one proxy in front of trckable: the last
// X-Forwarded-For entry is the address that proxy saw. Never the leftmost
// entry, which the client controls. (Not for Railway: there the rightmost hop
// is a CDN edge node; trckable uses Railway's X-Real-IP instead.)
func RightmostForwardedIP(r *http.Request) string {
	xff := r.Header.Values("X-Forwarded-For")
	if len(xff) == 0 {
		return RemoteIP(r)
	}
	parts := strings.Split(xff[len(xff)-1], ",")
	if ip := strings.TrimSpace(parts[len(parts)-1]); ip != "" {
		return ip
	}
	return RemoteIP(r)
}

// HeaderIP trusts a single named header set by a trusted edge (e.g. CF-Connecting-IP).
func HeaderIP(name string) IPResolver {
	return func(r *http.Request) string {
		if v := strings.TrimSpace(r.Header.Get(name)); v != "" {
			return v
		}
		return RemoteIP(r)
	}
}
