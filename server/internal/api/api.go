// Package api is trckable's HTTP API (/api/v1): setup, login, sites, API
// keys, reports, recent events and the live stream. It is the single contract
// shared by the dashboard, the MCP server and anyone automating trckable.
//
// Auth: a session cookie (dashboard) or "Authorization: Bearer <key>" (API
// keys, TRCKABLE_API_TOKEN). Cookie-authenticated requests that change state
// must send "X-Trckable-Request: 1": browsers cannot add custom headers to
// cross-site requests, so this blocks CSRF (together with SameSite=Lax).
package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/realtime"
	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/secrets"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

const sessionCookie = "trckable_session"

// API serves /api/v1.
type API struct {
	widgetCache widgetCache // each site's widget numbers, for a minute
	Ctl         *sqlite.Store
	Query       func() *query.Q // nil while the analytics store warms up
	Hub         *realtime.Hub
	Token       string // TRCKABLE_API_TOKEN (automation, optional)
	SetupEnv    string // TRCKABLE_SETUP_TOKEN (optional; otherwise generated)
	ClientIP    func(*http.Request) string
	Now         func() time.Time
	Revenue     *revenue.Service // nil = payments disabled
	// UpdateCheck lets owners' dashboards look for a newer release. Off with
	// TRCKABLE_UPDATE_CHECK=off.
	UpdateCheck bool
	// HealthOf answers "is this thing still fine?" for Settings → Health.
	HealthOf HealthSource
	// PurgeAnalytics removes a site's rows from the analytics store. It runs on
	// the writer's connection (the only one allowed to write DuckDB); nil while
	// the store is still warming up, and deleting a site then is refused.
	PurgeAnalytics func(ctx context.Context, site string) (events, sessions int64, err error)
	// ErasePerson removes one visitor's rows, for a data request. Same writer,
	// same reason; nil until the store is ready, and an erasure then is
	// refused rather than half-done.
	ErasePerson func(ctx context.Context, site string, visitor uint64) (events, sessions int64, err error)
	// SendWeekly sends a site's last weekly report to one address now (Settings →
	// Alerts). Set by the server, which owns the report's words.
	SendWeekly func(ctx context.Context, site, email string) error
	BaseURL    string // public https address (TRCKABLE_BASE_URL), for webhook URLs
	Version    string // this build's version, shown in the dashboard's footer
	// Box seals the keys trckable stores for other services (Search Console).
	Box *secrets.Box
	// GSCHTTP replaces the HTTP client used to reach Google; tests only.
	GSCHTTP    *http.Client
	cache      *reportCache
	nowCache   nowCache  // Live mode's answers, two seconds each
	refIcons   *refIcons // the icons of referring sites, fetched and kept here
	search     *searchState
	searchOnce sync.Once
	loginRate  *attempts
	once       sync.Once
	stopping   chan struct{} // closed by Stop: live streams end so a restart need not wait for them
	patterns   []string      // every route Routes registered
	stopOnce   sync.Once
	shareHosts atomic.Pointer[map[string]string] // verified share domain -> site, kept in memory
	shareTried atomic.Int64                      // when the list was last tried and failed (unix nanoseconds)
	// ReservedHosts are names that can never be a share domain, besides the
	// dashboard's own address (TRCKABLE_RESERVED_HOSTS).
	ReservedHosts []string
	// ShareDomainSkipVerify serves a share domain as soon as it is set, for an
	// instance whose one owner controls every name (TRCKABLE_SHARE_DOMAIN_SKIP_VERIFY).
	ShareDomainSkipVerify bool
	// ShareDomainAskOpen lets any caller, not only a proxy on this machine,
	// ask which domains are served (TRCKABLE_SHARE_DOMAIN_ASK_OPEN).
	ShareDomainAskOpen bool
	// LookupTXT reads a name's TXT records: the system's resolver, except in tests.
	LookupTXT func(ctx context.Context, name string) ([]string, error)
}

// Stop ends every live stream. The server calls it when it starts shutting
// down; browsers reconnect to the next process on their own.
func (a *API) Stop() {
	a.init()
	a.stopOnce.Do(func() { close(a.stopping) })
}

func (a *API) init() {
	a.once.Do(func() {
		a.cache = newReportCache(256)
		a.refIcons = newRefIcons()
		a.loginRate = &attempts{m: map[string][]time.Time{}}
		a.stopping = make(chan struct{})
		if a.Now == nil {
			a.Now = time.Now
		}
	})
}

// Routes registers every endpoint on mux.
func (a *API) Routes(mux *http.ServeMux) {
	a.init()
	// Every route is recorded, so the isolation test can try each one from
	// another account: a route added later is tested without being listed.
	handle := func(pattern string, h http.Handler) {
		a.patterns = append(a.patterns, pattern)
		if plainAnswers[pattern] { // what the list names carries secrets next to free text: not compressed
			mux.Handle(pattern, withTiming(h))
			return
		}
		mux.Handle(pattern, withGzip(withTiming(h)))
	}
	handleFunc := func(pattern string, f http.HandlerFunc) { handle(pattern, f) }
	handleFunc("GET /api/v1/setup", a.setupStatus)
	handleFunc("POST /api/v1/setup", a.setup)
	handle("POST /api/v1/payments/start-over", a.authed(a.startOverKeys))
	handleFunc("POST /api/v1/login", a.login)
	handleFunc("POST /api/v1/logout", a.logout)
	handle("GET /api/v1/me", a.authed(a.me))
	handle("PUT /api/v1/me/keys", a.authed(a.setKeys))
	handle("GET /api/v1/sites", a.authed(a.sites))
	handle("GET /api/v1/site-layout", a.authed(a.siteLayout))
	handle("PUT /api/v1/site-layout", a.authed(a.setSiteLayout))
	handle("GET /api/v1/overview", a.authed(a.overview))
	handle("POST /api/v1/sites", a.authed(a.createSite))
	handle("GET /api/v1/sites/{site}", a.authed(a.site))
	handle("PATCH /api/v1/sites/{site}", a.authed(a.updateSite))
	handle("GET /api/v1/sites/{site}/icon", a.authed(a.siteIcon))
	handle("PUT /api/v1/sites/{site}/icon", a.authed(a.setSiteIcon))
	handle("DELETE /api/v1/sites/{site}/icon", a.authed(a.clearSiteIcon))
	handle("POST /api/v1/sites/{site}/icon/favicon", a.authed(a.fetchFavicon))
	handle("PUT /api/v1/sites/{site}/color", a.authed(a.setSiteColor))
	handle("GET /api/v1/sites/{site}/widgets", a.authed(a.widgetsList))
	handle("POST /api/v1/sites/{site}/widgets", a.authed(a.createWidget))
	handle("GET /api/v1/sites/{site}/widgets/preview", a.authed(a.widgetPreview))
	handle("PUT /api/v1/sites/{site}/widgets/{id}", a.authed(a.updateWidget))
	handle("DELETE /api/v1/sites/{site}/widgets/{id}", a.authed(a.deleteWidget))
	handleFunc("GET /w/{id}", a.widgetPage)
	handle("POST /api/v1/sites/{site}/install/check", a.authed(a.checkInstall))
	handle("DELETE /api/v1/sites/{site}", a.authed(a.deleteSite))
	handle("GET /api/v1/sites/{site}/delete-preview", a.authed(a.deletePreview))
	handle("GET /api/v1/sites/{site}/milestones", a.authed(a.milestones))
	handle("PUT /api/v1/sites/{site}/milestones", a.authed(a.setMilestonesOn))
	handle("POST /api/v1/sites/{site}/milestones/seen", a.authed(a.closeMilestones))
	handle("GET /api/v1/sites/{site}/milestones/{kind}/{step}/card", a.authed(a.milestoneCard))
	handle("POST /api/v1/sites/{site}/milestones/{kind}/{step}/share", a.authed(a.shareMilestone))
	handle("DELETE /api/v1/sites/{site}/milestones/{kind}/{step}/share", a.authed(a.revokeMilestoneShare))
	handleFunc("GET /m/{token}", a.milestoneLink)
	handleFunc("GET /u/{token}", a.stopShow)
	handleFunc("POST /u/{token}", a.stopDo)
	handle("GET /api/v1/sites/{site}/config", a.authed(a.siteConfig))
	handle("PUT /api/v1/sites/{site}/config", a.authed(a.setSiteConfig))
	handle("POST /api/v1/account/password", a.authed(a.changePassword))
	handle("GET /api/v1/account", a.authed(a.profile))
	handle("PATCH /api/v1/account", a.authed(a.setProfile))
	handle("GET /api/v1/account/avatar", a.authed(a.getAvatar))
	handle("PUT /api/v1/account/avatar", a.authed(a.putAvatar))
	handle("DELETE /api/v1/account/avatar", a.authed(a.deleteAvatar))
	handle("GET /api/v1/account/2fa", a.authed(a.twoStep))
	handle("POST /api/v1/account/2fa/start", a.authed(a.startTwoStep))
	handle("POST /api/v1/account/2fa/enable", a.authed(a.enableTwoStep))
	handle("POST /api/v1/account/2fa/disable", a.authed(a.disableTwoStep))
	handle("GET /api/v1/people", a.authed(a.people))
	handle("GET /api/v1/people/{id}/avatar", a.authed(a.getPersonAvatar))
	handle("POST /api/v1/people", a.authed(a.addPerson))
	handle("PATCH /api/v1/people/{id}", a.authed(a.setPersonRole))
	handle("DELETE /api/v1/people/{id}", a.authed(a.removePerson))
	handle("POST /api/v1/people/{id}/password", a.authed(a.resetPersonPassword))
	handle("POST /api/v1/people/{id}/two-step/off", a.authed(a.turnOffTwoStep))
	handle("GET /api/v1/site-access", a.authed(a.mySiteAccess))
	handle("PUT /api/v1/site-access/{subject}", a.authed(a.setMySiteAccess))
	handle("GET /api/v1/sites/{site}/privacy/person", a.authed(a.person))
	handle("GET /api/v1/sites/{site}/privacy/export", a.authed(a.exportPerson))
	handle("DELETE /api/v1/sites/{site}/privacy/person", a.authed(a.erasePerson))
	handle("GET /api/v1/sites/{site}/shares", a.authed(a.shares))
	handle("POST /api/v1/sites/{site}/shares", a.authed(a.createShare))
	handle("PATCH /api/v1/sites/{site}/shares/{id}", a.authed(a.updateShare))
	handle("DELETE /api/v1/sites/{site}/shares/{id}", a.authed(a.deleteShare))
	handle("POST /api/v1/sites/{site}/shares/{id}/address", a.authed(a.newShareAddress))
	handle("GET /api/v1/sites/{site}/share-look", a.authed(a.shareLook))
	handle("PUT /api/v1/sites/{site}/share-look", a.authed(a.setShareLook))
	handle("POST /api/v1/sites/{site}/share-look/verify", a.authed(a.verifyShareDomain))
	handle("GET /api/v1/sites/{site}/share-logo", a.authed(a.shareLogoOwner))
	handle("PUT /api/v1/sites/{site}/share-logo", a.authed(a.setShareLogo))
	handle("DELETE /api/v1/sites/{site}/share-logo", a.authed(a.clearShareLogo))
	handleFunc("GET /api/v1/share-domain/ask", a.shareDomainAsk)
	// The public side: no session, no account, one site, read-only.
	handleFunc("POST /api/v1/share/open", a.openShare)
	handleFunc("GET /api/v1/share/me", a.shareMe)
	handleFunc("GET /api/v1/share/report", a.shareReport)
	handleFunc("GET /api/v1/share/annotations", a.shareAnnotations)
	handleFunc("GET /api/v1/share/icon", a.shareIcon)
	handleFunc("GET /api/v1/share/logo", a.shareLogo)
	handle("GET /api/v1/sites/{site}/report", a.authed(a.report))
	handle("GET /api/v1/sites/{site}/card", a.authed(a.shareCard))
	handle("GET /api/v1/sites/{site}/moments", a.authed(a.moments))
	handle("GET /api/v1/sites/{site}/insights", a.authed(a.insights))
	handle("GET /api/v1/sites/{site}/markers", a.authed(a.markers))
	handle("GET /api/v1/sites/{site}/sparks", a.authed(a.sparks))
	handle("GET /api/v1/referrer-icons", a.authed(a.referrerIcons))
	handle("GET /api/v1/referrer-icons/{host}", a.authed(a.referrerIcon))
	handle("GET /api/v1/sites/{site}/usual", a.authed(a.usual))
	handle("GET /api/v1/sites/{site}/buyers", a.authed(a.buyers))
	handle("GET /api/v1/sites/{site}/export.csv", a.authed(a.export))
	handle("GET /api/v1/sites/{site}/events", a.authed(a.recent))
	handle("GET /api/v1/sites/{site}/live", a.authed(a.live))
	handle("GET /api/v1/sites/{site}/now", a.authed(a.liveNow))
	handle("GET /api/v1/health", a.authed(a.health))
	handle("GET /api/v1/keys", a.authed(a.keys))
	handle("POST /api/v1/keys", a.authed(a.createKey))
	handle("DELETE /api/v1/keys/{id}", a.authed(a.revokeKey))
	handle("GET /api/v1/sites/{site}/modules", a.authed(a.listModules))
	handle("PUT /api/v1/sites/{site}/modules/{module}", a.authed(a.setModule))
	handle("GET /api/v1/sites/{site}/report/heatmap", a.authed(a.heatmap))
	handle("GET /api/v1/sites/{site}/report/charts", a.authed(a.charts))
	handle("GET /api/v1/sites/{site}/report/pages-sell", a.authed(a.pagesSell))
	handle("GET /api/v1/sites/{site}/report/crawlers", a.authed(a.crawlers))
	handle("GET /api/v1/sites/{site}/report/ai-search", a.authed(a.aiSearch))
	handle("GET /api/v1/sites/{site}/report/ai-seen", a.authed(a.aiSeen))
	handle("GET /api/v1/sites/{site}/report/vitals", a.authed(a.vitals))
	handle("GET /api/v1/sites/{site}/report/retention", a.authed(a.retention))
	handle("GET /api/v1/sites/{site}/report/scroll", a.authed(a.scroll))
	handle("GET /api/v1/sites/{site}/search-console", a.authed(a.searchConsole))
	handle("PUT /api/v1/sites/{site}/search-console", a.authed(a.setSearchConsole))
	handle("DELETE /api/v1/sites/{site}/search-console", a.authed(a.deleteSearchConsole))
	handle("GET /api/v1/sites/{site}/search-console/properties", a.authed(a.searchProperties))
	handle("GET /api/v1/sites/{site}/report/search", a.authed(a.searchReport))
	handle("GET /api/v1/sites/{site}/alerts", a.authed(a.alertList))
	handle("PUT /api/v1/sites/{site}/alerts", a.authed(a.saveAlert))
	handle("POST /api/v1/sites/{site}/alerts/test", a.authed(a.testAlert))
	handle("POST /api/v1/sites/{site}/alerts/weekly/send", a.authed(a.sendWeeklyNow))
	handle("DELETE /api/v1/sites/{site}/alerts/{id}", a.authed(a.deleteAlert))
	handle("GET /api/v1/sites/{site}/segments", a.authed(a.segments))
	handle("POST /api/v1/sites/{site}/segments", a.authed(a.saveSegment))
	handle("PATCH /api/v1/sites/{site}/segments/{id}", a.authed(a.renameSegment))
	handle("DELETE /api/v1/sites/{site}/segments/{id}", a.authed(a.deleteSegment))
	handle("GET /api/v1/sites/{site}/annotations", a.authed(a.gated("GET /api/v1/sites/{site}/annotations", a.annotations)))
	handle("POST /api/v1/sites/{site}/annotations", a.authed(a.gated("POST /api/v1/sites/{site}/annotations", a.addAnnotation)))
	handle("PATCH /api/v1/sites/{site}/annotations/{id}", a.authed(a.gated("PATCH /api/v1/sites/{site}/annotations/{id}", a.updateAnnotation)))
	handle("DELETE /api/v1/sites/{site}/annotations/{id}", a.authed(a.gated("DELETE /api/v1/sites/{site}/annotations/{id}", a.deleteAnnotation)))
	handle("GET /api/v1/sites/{site}/report/funnel", a.authed(a.funnel))
	handle("GET /api/v1/sites/{site}/report/goal-props", a.authed(a.goalProps))
	handle("GET /api/v1/sites/{site}/journey/{visitor}", a.authed(a.journey))
	handle("GET /api/v1/sites/{site}/payments", a.authed(a.payConnections))
	handle("POST /api/v1/sites/{site}/payments", a.authed(a.payConnect))
	handle("DELETE /api/v1/sites/{site}/payments/{id}", a.authed(a.payDisconnect))
	handle("PATCH /api/v1/sites/{site}/payments/{id}", a.authed(a.gated("PATCH /api/v1/sites/{site}/payments/{id}", a.paySetSecret)))
	handle("POST /api/v1/sites/{site}/payments/{id}/sync", a.authed(a.gated("POST /api/v1/sites/{site}/payments/{id}/sync", a.paySync)))
	handle("GET /api/v1/sites/{site}/payments/{id}/secret", a.authed(a.paySecret))
	handle("POST /api/v1/sites/{site}/payments/reprocess", a.authed(a.gated("POST /api/v1/sites/{site}/payments/reprocess", a.payReprocess)))
}

// ---- helpers ----

type apiError struct {
	Error string `json:"error"`
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v) // the client may have gone; nothing to do then
}

// busy answers a password check that waited too long for a hashing slot
// (auth.ErrBusy): 503 and a moment to wait, never "wrong password".
func busy(w http.ResponseWriter, err error) bool {
	if !errors.Is(err, auth.ErrBusy) {
		return false
	}
	w.Header().Set("Retry-After", "5")
	fail(w, http.StatusServiceUnavailable, err.Error())
	return true
}

// fail answers with a message the person can act on. A 500 is not one: what
// the store or the runtime said is for the log, not for whoever asked.
func fail(w http.ResponseWriter, code int, msg string) {
	if code == http.StatusInternalServerError {
		slog.Error("request failed", "status", code, "err", msg)
		msg = internalError
	}
	writeJSON(w, code, apiError{msg})
}

// internalError is all a client is told about a 500; the detail is logged.
const internalError = "internal error: the details are in the server's log"

// serverError is fail(500) for the handlers that answer in plain text.
func serverError(w http.ResponseWriter, err error) {
	slog.Error("request failed", "status", http.StatusInternalServerError, "err", err)
	http.Error(w, internalError, http.StatusInternalServerError)
}

// jsonOnly refuses a request a plain HTML form on another site could send:
// login, setup and opening a share link must come as JSON or with the
// dashboard's own header (login CSRF signs a victim into someone else's
// account).
func jsonOnly(r *http.Request) bool {
	ct := r.Header.Get("Content-Type")
	return strings.HasPrefix(ct, "application/json") || r.Header.Get("X-Trckable-Request") == "1"
}

func decode(r *http.Request, v any) error {
	return json.NewDecoder(http.MaxBytesReader(nil, r.Body, 64<<10)).Decode(v)
}

type principal struct {
	user   *sqlite.User // nil for API keys
	cookie bool
	// sites, when not nil, is every site of the account this request may
	// see: a viewer limited to some (store/sqlite/siteaccess.go). Every other
	// site of the account does not exist for it, exactly like another
	// account's. nil: every site of the account.
	sites map[string]bool
	// account is whose data this request may touch: the signed-in person's
	// account, the API key's, or the installation's own for the automation
	// token. Every site, person and key outside it does not exist for this
	// request.
	account string
}

// operator says whether the request speaks for the installation itself: its
// own default account, which is the only one. It sees installation-wide
// things (health, disk).
func (p principal) operator() bool { return p.account == sqlite.DefaultAccount }

// sees says whether this request may see site, one of its account's.
func (p principal) sees(site string) bool { return p.sites == nil || p.sites[site] }

// visible keeps the sites of a list this request may see.
func visible(p principal, rows []sqlite.SiteRow) []sqlite.SiteRow {
	if p.sites == nil {
		return rows
	}
	out := make([]sqlite.SiteRow, 0, len(rows))
	for _, s := range rows {
		if p.sites[s.ID] {
			out = append(out, s)
		}
	}
	return out
}

type ctxKey struct{}

// principalOf is who this request is, as authed established it.
func principalOf(r *http.Request) principal {
	p, _ := r.Context().Value(ctxKey{}).(principal)
	return p
}

// authed requires a session cookie or an API key.
func (a *API) authed(h http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var p principal
		if bearer := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "); bearer != "" && bearer != r.Header.Get("Authorization") {
			switch {
			case a.Token != "" && auth.Equal(bearer, a.Token):
				// The automation token acts for the installation's own
				// account, never across accounts.
				p.account = sqlite.DefaultAccount
			case strings.HasPrefix(bearer, "tkb_live_"):
				account, err := a.Ctl.APIKeyAccount(r.Context(), bearer)
				if err != nil {
					fail(w, http.StatusUnauthorized, "invalid API key")
					return
				}
				p.account = account
				// API keys go to scripts and AI assistants: read-only, so a
				// leaked or prompt-injected key can never change anything.
				if r.Method != http.MethodGet && r.Method != http.MethodHead {
					fail(w, http.StatusForbidden, "API keys are read-only")
					return
				}
			default:
				fail(w, http.StatusUnauthorized, "invalid API key")
				return
			}
		} else if c, err := r.Cookie(sessionCookie); err == nil {
			u, err := a.Ctl.SessionUser(r.Context(), c.Value)
			if err != nil {
				fail(w, http.StatusUnauthorized, "please sign in")
				return
			}
			p = principal{user: &u, cookie: true, account: u.AccountID}
			if u.Role != sqlite.RoleOwner {
				sites, err := a.Ctl.ViewerSites(r.Context(), u.AccountID, u.ID)
				if err != nil {
					// Unreadable limits show nothing, never everything.
					fail(w, http.StatusServiceUnavailable, "please try again")
					return
				}
				p.sites = sites
			}
			if r.Method != http.MethodGet && r.Header.Get("X-Trckable-Request") != "1" {
				fail(w, http.StatusForbidden, "missing X-Trckable-Request header")
				return
			}
			// A viewer reads the reports and nothing else — except their own
			// account, which is theirs to look after.
			if u.Role == sqlite.RoleViewer && r.Method != http.MethodGet && !ownAccount(r.URL.Path) {
				fail(w, http.StatusForbidden, "your account can read this instance, not change it")
				return
			}
			// A password someone else chose (a new person's, or one an owner
			// reset) opens only the way to choose your own: whoever saw the
			// one-time password must not keep the account.
			if !mustChangeAllowed(r) && a.Ctl.MustChange(r.Context(), u.ID) {
				fail(w, http.StatusForbidden, "choose your own password first")
				return
			}
		} else {
			w.Header().Set("WWW-Authenticate", `Bearer realm="trckable"`)
			fail(w, http.StatusUnauthorized, "please sign in")
			return
		}
		if p.account == "" {
			fail(w, http.StatusUnauthorized, "please sign in")
			return
		}
		// The one guard every site route passes: a site in another account
		// does not exist for this request. "Not found", not "forbidden", so a
		// guessed id says nothing about whether it is real.
		if site := r.PathValue("site"); site != "" {
			owner, err := a.Ctl.SiteAccount(r.Context(), site)
			if err != nil || owner != p.account || !p.sees(site) {
				fail(w, http.StatusNotFound, "site not found")
				return
			}
		}
		h.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, p)))
	})
}

// stillSees asks again whether a long request (the live stream) may still
// see site: the person still here, in the same account, the site still
// theirs and still within their limits.
func (a *API) stillSees(r *http.Request, site string) bool {
	p := principalOf(r)
	if owner, err := a.Ctl.SiteAccount(r.Context(), site); err != nil || owner != p.account {
		return false
	}
	if p.user == nil {
		return true
	}
	sites, err := a.Ctl.ViewerSites(r.Context(), p.account, p.user.ID)
	if err != nil {
		return false
	}
	return sites == nil || sites[site]
}

// mustChangeAllowed is what a person may do before choosing their own
// password: say who they are, choose it, or sign out.
func mustChangeAllowed(r *http.Request) bool {
	switch r.Method + " " + r.URL.Path {
	case "GET /api/v1/me", "POST /api/v1/account/password", "POST /api/v1/logout":
		return true
	}
	return false
}

// ownAccount is the part of the API that belongs to the signed-in person
// rather than to the instance: their password, name, picture, second step
// and keyboard shortcuts.
func ownAccount(path string) bool {
	return strings.HasPrefix(path, "/api/v1/account/") || path == "/api/v1/account" || path == "/api/v1/logout" || path == "/api/v1/me/keys" || closingMilestones(path)
}

// closingMilestones is a person closing a milestone's moment: their own
// view of it, so a viewer may too (the site guard still applies).
func closingMilestones(path string) bool {
	return strings.HasPrefix(path, "/api/v1/sites/") && strings.HasSuffix(path, "/milestones/seen") && strings.Count(path, "/") == 6
}

func (a *API) setCookie(w http.ResponseWriter, r *http.Request, value string, maxAge int) {
	//nolint:gosec // Secure whenever the request came over https; plain http is for localhost and private networks, where a Secure cookie would never be sent
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: value, Path: "/", MaxAge: maxAge, HttpOnly: true,
		Secure: r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https", SameSite: http.SameSiteLaxMode,
	})
}

// full says whether key has max attempts inside the window, without adding
// one: for counting only failures (record), cleared by a success (clear).
func (l *attempts) full(key string, now time.Time, max int, window time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	n := 0
	for _, t := range l.m[key] {
		if now.Sub(t) < window {
			n++
		}
	}
	return n >= max
}

func (l *attempts) record(key string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	recent := l.m[key][:0]
	for _, t := range l.m[key] {
		if now.Sub(t) <= time.Hour { // the longest window in use
			recent = append(recent, t)
		}
	}
	l.m[key] = append(recent, now)
	if len(l.m) > 10_000 { // bound memory: keys can come from the request (an email), not only from people who exist
		for k, ts := range l.m {
			if len(ts) == 0 || now.Sub(ts[len(ts)-1]) > time.Hour { // the longest window in use
				delete(l.m, k)
			}
		}
	}
}

// limit is one counter a sign-in attempt is held against.
type limit struct {
	key    string
	max    int
	window time.Duration
}

// reserve takes a slot on every limit, or on none: an attempt that finds any
// of them full is refused. The slot is taken before the password is hashed,
// under the lock, so a burst of requests that arrive together cannot all
// pass a look-then-count check while the hashing queue drains. A slot stays
// taken (a wrong password) unless release gives it back.
func (l *attempts) reserve(now time.Time, lims ...limit) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, lim := range lims {
		n := 0
		for _, t := range l.m[lim.key] {
			if now.Sub(t) < lim.window {
				n++
			}
		}
		if n >= lim.max {
			return false
		}
	}
	for _, lim := range lims {
		recent := l.m[lim.key][:0]
		for _, t := range l.m[lim.key] {
			if now.Sub(t) < lim.window {
				recent = append(recent, t)
			}
		}
		l.m[lim.key] = append(recent, now)
	}
	if len(l.m) > 10_000 { // bound memory: keys come from the request (an email, an address)
		for k, ts := range l.m {
			if len(ts) == 0 || now.Sub(ts[len(ts)-1]) > time.Hour { // the longest window in use
				delete(l.m, k)
			}
		}
	}
	return true
}

// release gives back the slot reserve took at now on each limit: the password
// was right, so it was not a guess.
func (l *attempts) release(now time.Time, lims ...limit) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, lim := range lims {
		ts := l.m[lim.key]
		for i, t := range ts {
			if t.Equal(now) {
				l.m[lim.key] = append(ts[:i], ts[i+1:]...)
				break
			}
		}
	}
}

// clearPrefix forgets every counter whose key starts with prefix.
func (l *attempts) clearPrefix(prefix string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for k := range l.m {
		if strings.HasPrefix(k, prefix) {
			delete(l.m, k)
		}
	}
}

func (l *attempts) clear(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.m, key)
}

// attempts is a small sliding-window limiter for login and setup.
type attempts struct {
	mu sync.Mutex
	m  map[string][]time.Time
}

func (l *attempts) allow(key string, now time.Time, max int, window time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	recent := l.m[key][:0]
	for _, t := range l.m[key] {
		if now.Sub(t) < window {
			recent = append(recent, t)
		}
	}
	if len(recent) >= max {
		l.m[key] = recent
		return false
	}
	l.m[key] = append(recent, now)
	if len(l.m) > 10_000 { // bound memory
		for k, ts := range l.m {
			if len(ts) == 0 || now.Sub(ts[len(ts)-1]) > window {
				delete(l.m, k)
			}
		}
	}
	return true
}

// ip is the address the per-address limits count against. An IPv6 host is
// usually given a whole /64, so every address in one /64 counts as one:
// otherwise a single machine could take fresh addresses without end.
func (a *API) ip(r *http.Request) string {
	var h string
	if a.ClientIP != nil {
		h = a.ClientIP(r)
	} else {
		h, _, _ = net.SplitHostPort(r.RemoteAddr)
	}
	return limitKey(h)
}

func limitKey(addr string) string {
	ip := net.ParseIP(addr)
	if ip == nil || ip.To4() != nil {
		return addr
	}
	return ip.Mask(net.CIDRMask(64, 128)).String() + "/64"
}

// ---- setup & login ----

func (a *API) setupStatus(w http.ResponseWriter, r *http.Request) {
	has, err := a.Ctl.HasUsers(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"needs_setup": !has})
}

func (a *API) setup(w http.ResponseWriter, r *http.Request) {
	if !jsonOnly(r) {
		fail(w, http.StatusUnsupportedMediaType, "send JSON")
		return
	}
	a.init()
	if !a.loginRate.allow("setup:"+a.ip(r), a.Now(), a.ipMax(r, 10), 10*time.Minute) {
		fail(w, http.StatusTooManyRequests, "too many attempts, try again in a few minutes")
		return
	}
	var in struct{ Token, Email, Password, Domain string }
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	want, err := a.Ctl.SetupToken(r.Context(), a.SetupEnv)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if has, _ := a.Ctl.HasUsers(r.Context()); has {
		fail(w, http.StatusConflict, auth.ErrSetupDone.Error())
		return
	}
	if !auth.Equal(in.Token, want) {
		fail(w, http.StatusForbidden, auth.ErrSetupToken.Error())
		return
	}
	u, err := a.Ctl.CompleteSetup(r.Context(), in.Email, in.Password)
	if busy(w, err) {
		return
	}
	switch {
	case errors.Is(err, auth.ErrSetupDone):
		fail(w, http.StatusConflict, err.Error())
		return
	case err != nil:
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	var site *sqlite.SiteInfo
	if strings.TrimSpace(in.Domain) != "" {
		if id, _, err := a.Ctl.EnsureSite(r.Context(), u.AccountID, in.Domain); err == nil {
			if si, err := a.Ctl.SiteInfo(r.Context(), id); err == nil {
				site = &si
			}
		}
	}
	// Sites the server was started with have waited for an owner to tell.
	a.defaultAlertsForAccount(r.Context(), u.AccountID)
	tok, err := a.Ctl.CreateSession(r.Context(), u.ID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.setCookie(w, r, tok, int(sqlite.SessionTTL.Seconds()))
	slog.Info("setup completed", "email", u.Email)
	writeJSON(w, http.StatusCreated, map[string]any{"user": map[string]string{"email": u.Email}, "site": site})
}

func (a *API) login(w http.ResponseWriter, r *http.Request) {
	if !jsonOnly(r) {
		fail(w, http.StatusUnsupportedMediaType, "send JSON")
		return
	}
	a.init()
	var in struct{ Email, Password, Code string }
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	// Every guess is held against the address, the account on that address,
	// and the account everywhere (see loginLimits); the slot is taken before
	// the password is checked.
	lims := a.loginLimits(r, in.Email)
	now := a.Now()
	if !a.loginRate.reserve(now, lims...) {
		fail(w, http.StatusTooManyRequests, "too many attempts, try again in a few minutes")
		return
	}
	u, err := a.Ctl.Login(r.Context(), in.Email, in.Password)
	if err != nil {
		if busy(w, err) {
			a.loginRate.release(now, lims...) // not a guess
			return
		}
		if !errors.Is(err, auth.ErrBadLogin) {
			a.loginRate.release(now, lims...)
		}
		fail(w, http.StatusUnauthorized, auth.ErrBadLogin.Error())
		return
	}
	// The password was right: it was no guess. If this account has two-step
	// sign-in, ask for the code — as a separate answer, so the dashboard can
	// show that step instead of repeating "wrong email or password".
	a.loginRate.release(now, lims...)
	// Wrong codes are counted per person too, not only per address (codeTries),
	// and a code is held against the same limits as a password.
	if in.Code != "" {
		if !a.codeTries(w, &u) {
			return
		}
		if !a.loginRate.reserve(now, lims...) {
			fail(w, http.StatusTooManyRequests, "too many attempts, try again in a few minutes")
			return
		}
	}
	err = a.Ctl.CheckSecondStep(r.Context(), u.ID, cleanCode(in.Code), a.unix)
	a.codeResult(&u, in.Code, err)
	if in.Code != "" && !errors.Is(err, auth.ErrBadLogin) {
		a.loginRate.release(now, lims...)
	}
	switch {
	case errors.Is(err, sqlite.ErrNeedsCode):
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"error":      "enter the six-digit code from your authenticator app",
			"needs_code": true,
		})
		return
	case errors.Is(err, auth.ErrBadLogin):
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"error":      "that code is not right — check your phone's clock, or use a recovery code",
			"needs_code": true,
		})
		return
	case err != nil:
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	tok, err := a.Ctl.CreateSession(r.Context(), u.ID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.setCookie(w, r, tok, int(sqlite.SessionTTL.Seconds()))
	a.rememberDevice(w, r, u.ID, in.Email)
	writeJSON(w, http.StatusOK, map[string]any{"user": map[string]string{"email": u.Email}})
}

func (a *API) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		if err := a.Ctl.DeleteSession(r.Context(), c.Value); err != nil {
			slog.Warn("logout: could not delete the session", "err", err)
		}
	}
	a.setCookie(w, r, "", -1)
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) me(w http.ResponseWriter, r *http.Request) {
	p := r.Context().Value(ctxKey{}).(principal)
	if p.user == nil {
		writeJSON(w, http.StatusOK, map[string]string{"kind": "api_key"})
		return
	}
	// The version is for the dashboard's footer; every response carries it in
	// X-Trckable-Version anyway.
	keys, _ := a.Ctl.UserKeymap(r.Context(), p.user.ID)
	writeJSON(w, http.StatusOK, map[string]any{"kind": "user", "email": p.user.Email, "role": p.user.Role, "version": a.Version, "keys": keys, "must_change": a.Ctl.MustChange(r.Context(), p.user.ID),
		// Only owners upgrade, so only their dashboards look.
		"update_check": a.UpdateCheck && p.user.Role == sqlite.RoleOwner,
		// The instance's own health (every event, the disk, backups) is for
		// the installation's own account.
		"operator": p.operator()})
}

// setKeys keeps the shortcuts a person changed, so they follow them to any
// browser. Anyone signed in may change their own; they touch nothing else.
func (a *API) setKeys(w http.ResponseWriter, r *http.Request) {
	p := r.Context().Value(ctxKey{}).(principal)
	if p.user == nil {
		fail(w, http.StatusForbidden, "shortcuts belong to a person, not an API key")
		return
	}
	var in struct {
		Keys sqlite.Keymap `json:"keys"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if err := a.Ctl.SetUserKeymap(r.Context(), p.user.ID, in.Keys); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": in.Keys})
}

// ---- sites ----

func (a *API) sites(w http.ResponseWriter, r *http.Request) {
	rows, err := a.Ctl.ListSites(r.Context(), principalOf(r).account)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	rows = visible(principalOf(r), rows)
	brands, _ := a.Ctl.Brands(r.Context(), principalOf(r).account)
	checks, _ := a.Ctl.Checks(r.Context(), principalOf(r).account)
	out := []sqlite.SiteInfo{}
	for _, s := range rows {
		b := brands[s.ID]
		week, cookieless := 1, false
		if c, err := a.Ctl.SiteConfig(r.Context(), s.ID); err == nil {
			week, cookieless = c.WeekStart, c.ConsentFree
		}
		out = append(out, sqlite.SiteInfo{ID: s.ID, Domain: s.Domain, Name: s.Name, Timezone: s.Timezone, Currency: s.Currency, ProxyKey: a.proxyKeyFor(r, s.ProxyKey), LastEventAt: s.LastEventAt, CreatedAt: s.CreatedAt,
			Color: b.Color, IconURL: iconURL(s.ID, b), WeekStart: week, Cookieless: cookieless})
		if c, ok := checks[s.ID]; ok {
			out[len(out)-1].Check = &c
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"sites": out})
}

// proxyKeyFor hides a site's proxy key from anyone who only reads: it is a
// credential — it lets a server say where a visit came from — and reading the
// reports never needs it.
func (a *API) proxyKeyFor(r *http.Request, key string) string {
	u := r.Context().Value(ctxKey{}).(principal).user
	if u == nil || u.Role != sqlite.RoleOwner {
		return ""
	}
	return key
}

func (a *API) site(w http.ResponseWriter, r *http.Request) {
	si, err := a.Ctl.SiteInfo(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	si.ProxyKey = a.proxyKeyFor(r, si.ProxyKey)
	writeJSON(w, http.StatusOK, si)
}

func (a *API) createSite(w http.ResponseWriter, r *http.Request) {
	var in struct{ Domain string }
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	id, err := a.Ctl.CreateSite(r.Context(), principalOf(r).account, in.Domain, "")
	if errors.Is(err, sqlite.ErrExists) {
		fail(w, http.StatusConflict, "that site already exists")
		return
	}
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.defaultAlerts(r.Context(), principalOf(r).account, id)
	si, _ := a.Ctl.SiteInfo(r.Context(), id)
	writeJSON(w, http.StatusCreated, si)
}

func (a *API) updateSite(w http.ResponseWriter, r *http.Request) {
	var in struct{ Name, Timezone, Currency string }
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if err := a.Ctl.UpdateSite(r.Context(), r.PathValue("site"), in.Name, in.Timezone, in.Currency); err != nil {
		code := http.StatusBadRequest
		if errors.Is(err, auth.ErrNotFound) {
			code = http.StatusNotFound
		}
		fail(w, code, err.Error())
		return
	}
	a.cache.purgeSite(r.PathValue("site"))
	si, _ := a.Ctl.SiteInfo(r.Context(), r.PathValue("site"))
	writeJSON(w, http.StatusOK, si)
}

// ---- API keys ----

func (a *API) keys(w http.ResponseWriter, r *http.Request) {
	// The list of keys is for whoever makes and revokes them: owners.
	if u := r.Context().Value(ctxKey{}).(principal).user; u == nil || u.Role != sqlite.RoleOwner {
		fail(w, http.StatusForbidden, "only an owner can see this instance's API keys")
		return
	}
	ks, err := a.Ctl.ListAPIKeys(r.Context(), principalOf(r).account)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": ks})
}

func (a *API) createKey(w http.ResponseWriter, r *http.Request) {
	var in struct{ Name string }
	// The name is optional, so an empty body is fine; broken JSON is not.
	if err := decode(r, &in); err != nil && !errors.Is(err, io.EOF) {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	secret, k, err := a.Ctl.CreateAPIKey(r.Context(), principalOf(r).account, in.Name)
	if errors.Is(err, sqlite.ErrTooManyKeys) {
		fail(w, http.StatusConflict, err.Error())
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"key": k, "secret": secret})
}

func (a *API) revokeKey(w http.ResponseWriter, r *http.Request) {
	if err := a.Ctl.RevokeAPIKey(r.Context(), principalOf(r).account, r.PathValue("id")); err != nil {
		fail(w, http.StatusNotFound, "key not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- recent events & live ----

func (a *API) recent(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	Recent(q.DB)(w, r)
}

// liveHeartbeat is how often a live stream says it is alive, and asks again
// whether its reader may still see the site. A variable for the tests.
var liveHeartbeat = 10 * time.Second

func (a *API) live(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	if _, ok := a.Ctl.Site(site); !ok {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	rc := http.NewResponseController(w)
	// A stream outlives the server's write timeout. A writer that cannot lift
	// it ends the stream at the timeout, and the browser reconnects.
	_ = rc.SetWriteDeadline(time.Time{})
	w.Header().Set("Content-Type", "text/event-stream")
	// no-transform: a proxy (Cloudflare) must neither compress nor buffer the
	// stream; X-Accel-Buffering does the same for nginx-style proxies.
	w.Header().Set("Cache-Control", "no-store, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Content-Encoding", "identity")
	w.WriteHeader(http.StatusOK)
	// A reconnect hint, and 2 KB of comment so a proxy that holds the first
	// bytes of a response lets the stream through at once.
	if _, err := w.Write([]byte("retry: 3000\n:" + strings.Repeat(" ", 2048) + "\n\n")); err != nil || rc.Flush() != nil {
		return
	}

	ch, cancel := a.Hub.Subscribe(site)
	defer cancel()
	// The visitor id is only useful for opening a journey, so it only travels
	// when that module is on: off means off, here too.
	withVisitor := a.moduleOn(r, site, "journeys")
	send := func(ev string, v any) bool {
		b, _ := json.Marshal(v)
		if _, err := w.Write([]byte("event: " + ev + "\ndata: " + string(b) + "\n\n")); err != nil {
			return false
		}
		return rc.Flush() == nil
	}
	online := func() bool {
		var n int64
		if q := a.Query(); q != nil {
			n, _ = q.Online(r.Context(), site, a.Now())
		}
		return send("online", map[string]int64{"online": n})
	}
	if !online() {
		return
	}
	moneyOn := a.moduleOn(r, site, "revenue")
	heartbeat := time.NewTicker(liveHeartbeat) // proxies see traffic; the dashboard's watchdog sees the stream alive
	onlineTick := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	defer onlineTick.Stop()
	// A visit is committed before it is published, so the count right after it
	// includes it. A burst of visits costs one count, a moment later.
	recount := time.NewTimer(time.Hour)
	recount.Stop()
	defer recount.Stop()
	counting := false
	a.init()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-a.stopping:
			return
		case l := <-ch:
			if l.Kind == "sale" {
				// Money follows the revenue module, live as everywhere else.
				if !moneyOn {
					continue
				}
				if !send("sale", l) {
					return
				}
				continue
			}
			if !withVisitor {
				l.Visitor = ""
			}
			if !send("visit", l) {
				return
			}
			if !counting {
				counting = true
				recount.Reset(250 * time.Millisecond)
			}
		case <-recount.C:
			counting = false
			if !online() {
				return
			}
		case <-heartbeat.C:
			// Access can be taken away while a stream is open: the stream
			// ends within a heartbeat, and the reconnect meets the guard.
			if !a.stillSees(r, site) {
				return
			}
			// An event, not a comment: EventSource hides comments from the page,
			// and the dashboard's watchdog needs to hear the stream is alive.
			if _, err := w.Write([]byte("event: ping\ndata: {}\n\n")); err != nil || rc.Flush() != nil {
				return
			}
		case <-onlineTick.C:
			if !online() {
				return
			}
		}
	}
}
