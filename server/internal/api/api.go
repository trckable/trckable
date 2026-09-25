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
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
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
	// TRCKABLE_UPDATE_CHECK=off, and on a managed instance (the host updates).
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
	BaseURL     string // public https address (TRCKABLE_BASE_URL), for webhook URLs
	Operator    string // TRCKABLE_OPERATOR_TOKEN: one-time sign-in links for a hosting provider
	Managed     string // TRCKABLE_MANAGED: the hosting provider's sign-in page; see unmanaged
	Version     string // this build's version, shown in the dashboard's footer
	// Box seals the keys trckable stores for other services (Search Console).
	Box *secrets.Box
	// GSCHTTP replaces the HTTP client used to reach Google; tests only.
	GSCHTTP    *http.Client
	cache      *reportCache
	search     *searchState
	searchOnce sync.Once
	loginRate  *attempts
	once       sync.Once
	stopping   chan struct{} // closed by Stop: live streams end so a restart need not wait for them
	patterns   []string      // every route Routes registered
	stopOnce   sync.Once
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
		mux.Handle(pattern, h)
	}
	handleFunc := func(pattern string, f http.HandlerFunc) { handle(pattern, f) }
	handleFunc("GET /api/v1/setup", a.setupStatus)
	handleFunc("POST /api/v1/setup", a.unmanaged(a.setup))
	handleFunc("POST /_trckable/signin", a.signinLink)
	handleFunc("GET /_trckable/signin", a.useSigninLink)
	handleFunc("POST /_trckable/accounts", a.createAccount)
	handleFunc("GET /_trckable/accounts", a.listAccounts)
	handleFunc("GET /_trckable/health", a.operatorHealth)
	handle("POST /api/v1/payments/start-over", a.authed(a.startOverKeys))
	handleFunc("GET /_trckable/accounts/{id}", a.getAccount)
	handleFunc("PUT /_trckable/accounts/{id}/limits", a.setAccountLimits)
	handleFunc("PUT /_trckable/accounts/{id}/state", a.setAccountState)
	handleFunc("DELETE /_trckable/accounts/{id}", a.deleteAccount)
	handleFunc("POST /api/v1/login", a.unmanaged(a.login))
	handleFunc("POST /api/v1/logout", a.logout)
	handle("GET /api/v1/me", a.authed(a.me))
	handle("PUT /api/v1/me/keys", a.authed(a.setKeys))
	handle("GET /api/v1/sites", a.authed(a.sites))
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
	handle("GET /api/v1/sites/{site}/config", a.authed(a.siteConfig))
	handle("PUT /api/v1/sites/{site}/config", a.authed(a.setSiteConfig))
	handle("POST /api/v1/account/password", a.authed(a.unmanaged(a.changePassword)))
	handle("GET /api/v1/account", a.authed(a.profile))
	handle("PATCH /api/v1/account", a.authed(a.setProfile))
	handle("GET /api/v1/account/avatar", a.authed(a.getAvatar))
	handle("PUT /api/v1/account/avatar", a.authed(a.putAvatar))
	handle("DELETE /api/v1/account/avatar", a.authed(a.deleteAvatar))
	handle("GET /api/v1/account/2fa", a.authed(a.twoStep))
	handle("POST /api/v1/account/2fa/start", a.authed(a.unmanaged(a.startTwoStep)))
	handle("POST /api/v1/account/2fa/enable", a.authed(a.unmanaged(a.enableTwoStep)))
	handle("POST /api/v1/account/2fa/disable", a.authed(a.disableTwoStep))
	handle("GET /api/v1/people", a.authed(a.people))
	handle("POST /api/v1/people", a.authed(a.addPerson))
	handle("PATCH /api/v1/people/{id}", a.authed(a.setPersonRole))
	handle("DELETE /api/v1/people/{id}", a.authed(a.removePerson))
	handle("POST /api/v1/people/{id}/password", a.authed(a.unmanaged(a.resetPersonPassword)))
	handle("GET /api/v1/sites/{site}/privacy/person", a.authed(a.person))
	handle("GET /api/v1/sites/{site}/privacy/export", a.authed(a.exportPerson))
	handle("DELETE /api/v1/sites/{site}/privacy/person", a.authed(a.erasePerson))
	handle("GET /api/v1/sites/{site}/shares", a.authed(a.shares))
	handle("POST /api/v1/sites/{site}/shares", a.authed(a.createShare))
	handle("DELETE /api/v1/sites/{site}/shares/{id}", a.authed(a.deleteShare))
	// The public side: no session, no account, one site, read-only.
	handleFunc("POST /api/v1/share/open", a.openShare)
	handleFunc("GET /api/v1/share/me", a.shareMe)
	handleFunc("GET /api/v1/share/report", a.shareReport)
	handleFunc("GET /api/v1/share/annotations", a.shareAnnotations)
	handle("GET /api/v1/sites/{site}/report", a.authed(a.report))
	handle("GET /api/v1/sites/{site}/export.csv", a.authed(a.export))
	handle("GET /api/v1/sites/{site}/events", a.authed(a.recent))
	handle("GET /api/v1/sites/{site}/live", a.authed(a.live))
	handle("GET /api/v1/health", a.authed(a.health))
	handle("GET /api/v1/keys", a.authed(a.keys))
	handle("POST /api/v1/keys", a.authed(a.createKey))
	handle("DELETE /api/v1/keys/{id}", a.authed(a.revokeKey))
	handle("GET /api/v1/sites/{site}/modules", a.authed(a.listModules))
	handle("PUT /api/v1/sites/{site}/modules/{module}", a.authed(a.setModule))
	handle("GET /api/v1/sites/{site}/report/heatmap", a.authed(a.heatmap))
	handle("GET /api/v1/sites/{site}/report/crawlers", a.authed(a.crawlers))
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
	handle("DELETE /api/v1/sites/{site}/alerts/{id}", a.authed(a.deleteAlert))
	handle("GET /api/v1/sites/{site}/segments", a.authed(a.segments))
	handle("POST /api/v1/sites/{site}/segments", a.authed(a.saveSegment))
	handle("PATCH /api/v1/sites/{site}/segments/{id}", a.authed(a.renameSegment))
	handle("DELETE /api/v1/sites/{site}/segments/{id}", a.authed(a.deleteSegment))
	handle("GET /api/v1/sites/{site}/annotations", a.authed(a.annotations))
	handle("POST /api/v1/sites/{site}/annotations", a.authed(a.addAnnotation))
	handle("DELETE /api/v1/sites/{site}/annotations/{id}", a.authed(a.deleteAnnotation))
	handle("POST /api/v1/sites/{site}/report/funnel", a.authed(a.funnel))
	handle("GET /api/v1/sites/{site}/report/goal-props", a.authed(a.goalProps))
	handle("GET /api/v1/sites/{site}/journey/{visitor}", a.authed(a.journey))
	handle("GET /api/v1/sites/{site}/payments", a.authed(a.payConnections))
	handle("POST /api/v1/sites/{site}/payments", a.authed(a.payConnect))
	handle("DELETE /api/v1/sites/{site}/payments/{id}", a.authed(a.payDisconnect))
	handle("PATCH /api/v1/sites/{site}/payments/{id}", a.authed(a.paySetSecret))
	handle("POST /api/v1/sites/{site}/payments/{id}/sync", a.authed(a.paySync))
	handle("GET /api/v1/sites/{site}/payments/{id}/secret", a.authed(a.paySecret))
	handle("POST /api/v1/sites/{site}/payments/reprocess", a.authed(a.payReprocess))
}

// ---- helpers ----

type apiError struct {
	Error string `json:"error"`
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, code int, msg string) { writeJSON(w, code, apiError{msg}) }

func decode(r *http.Request, v any) error {
	return json.NewDecoder(http.MaxBytesReader(nil, r.Body, 64<<10)).Decode(v)
}

type principal struct {
	user   *sqlite.User // nil for API keys
	cookie bool
	// account is whose data this request may touch: the signed-in person's
	// account, the API key's, or the installation's own for the automation
	// token. Every site, person and key outside it does not exist for this
	// request.
	account string
}

// operator says whether the request speaks for the installation itself: its
// own default account, which on a self-hosted instance is the only one. It
// sees installation-wide things (health, disk); customer accounts never do.
func (p principal) operator() bool { return p.account == sqlite.DefaultAccount }

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
		// A hosting provider can pause an account (operator.go): suspended
		// locks everyone out, read-only lets them look but change nothing.
		switch a.Ctl.AccountState(r.Context(), p.account) {
		case sqlite.StateSuspended:
			fail(w, http.StatusForbidden, "this account is suspended")
			return
		case sqlite.StateReadOnly:
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				fail(w, http.StatusForbidden, "this account is read-only for now: nothing can be changed")
				return
			}
		}
		// The one guard every site route passes: a site in another account
		// does not exist for this request. "Not found", not "forbidden", so a
		// guessed id says nothing about whether it is real.
		if site := r.PathValue("site"); site != "" {
			owner, err := a.Ctl.SiteAccount(r.Context(), site)
			if err != nil || owner != p.account {
				fail(w, http.StatusNotFound, "site not found")
				return
			}
		}
		h.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, p)))
	})
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
// rather than to the instance: their password, name, picture and second step.
func ownAccount(path string) bool {
	return strings.HasPrefix(path, "/api/v1/account/") || path == "/api/v1/account" || path == "/api/v1/logout"
}

func (a *API) setCookie(w http.ResponseWriter, r *http.Request, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: value, Path: "/", MaxAge: maxAge, HttpOnly: true,
		Secure: r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https", SameSite: http.SameSiteLaxMode,
	})
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

func (a *API) ip(r *http.Request) string {
	if a.ClientIP != nil {
		return a.ClientIP(r)
	}
	h, _, _ := net.SplitHostPort(r.RemoteAddr)
	return h
}

// ---- setup & login ----

func (a *API) setupStatus(w http.ResponseWriter, r *http.Request) {
	has, err := a.Ctl.HasUsers(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if a.Managed != "" {
		// A hosted account is made by the provider, never set up here.
		writeJSON(w, http.StatusOK, map[string]any{"needs_setup": false, "managed": a.Managed})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"needs_setup": !has})
}

// unmanaged is a route that does not exist on a managed instance: a hosting
// provider signs people in itself, so there is no setup, no password sign-in
// and no password or second step to set here, and nobody can get in around
// the provider (a suspended customer, say, with a password from before).
func (a *API) unmanaged(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if a.Managed != "" {
			fail(w, http.StatusNotFound, "people sign in at "+a.Managed)
			return
		}
		h(w, r)
	}
}

func (a *API) setup(w http.ResponseWriter, r *http.Request) {
	a.init()
	if !a.loginRate.allow("setup:"+a.ip(r), a.Now(), 10, 10*time.Minute) {
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
	a.init()
	if !a.loginRate.allow("login:"+a.ip(r), a.Now(), 10, 10*time.Minute) {
		fail(w, http.StatusTooManyRequests, "too many attempts, try again in a few minutes")
		return
	}
	var in struct{ Email, Password, Code string }
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	u, err := a.Ctl.Login(r.Context(), in.Email, in.Password)
	if err != nil {
		fail(w, http.StatusUnauthorized, auth.ErrBadLogin.Error())
		return
	}
	// The password was right. If this account has two-step sign-in, ask for
	// the code — as a separate answer, so the dashboard can show that step
	// instead of repeating "wrong email or password".
	switch err := a.Ctl.CheckSecondStep(r.Context(), u.ID, cleanCode(in.Code), a.unix); {
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
	writeJSON(w, http.StatusOK, map[string]any{"user": map[string]string{"email": u.Email}})
}

func (a *API) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		a.Ctl.DeleteSession(r.Context(), c.Value)
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
		// The instance's own health (every event, the disk, backups) is the
		// operator's: a hosted account never sees it.
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
	brands, _ := a.Ctl.Brands(r.Context(), principalOf(r).account)
	checks, _ := a.Ctl.Checks(r.Context(), principalOf(r).account)
	out := []sqlite.SiteInfo{}
	for _, s := range rows {
		b := brands[s.ID]
		week := 1
		if c, err := a.Ctl.SiteConfig(r.Context(), s.ID); err == nil {
			week = c.WeekStart
		}
		out = append(out, sqlite.SiteInfo{ID: s.ID, Domain: s.Domain, Name: s.Name, Timezone: s.Timezone, Currency: s.Currency, ProxyKey: a.proxyKeyFor(r, s.ProxyKey), LastEventAt: s.LastEventAt,
			Color: b.Color, IconURL: iconURL(s.ID, b), WeekStart: week})
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
	decode(r, &in)
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

func (a *API) live(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	if _, ok := a.Ctl.Site(site); !ok {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	rc := http.NewResponseController(w)
	rc.SetWriteDeadline(time.Time{}) // a stream outlives the server's write timeout
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

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
	heartbeat := time.NewTicker(20 * time.Second) // proxies (Railway: 15 min cap) see traffic
	onlineTick := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	defer onlineTick.Stop()
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
		case <-heartbeat.C:
			if _, err := w.Write([]byte(": ping\n\n")); err != nil || rc.Flush() != nil {
				return
			}
		case <-onlineTick.C:
			if !online() {
				return
			}
		}
	}
}
