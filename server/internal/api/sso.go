package api

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/sso"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Signing in with an identity provider. The browser is sent to the provider
// (start) and comes back with a code (callback); everything that must hold
// between the two travels in one short-lived sealed cookie.
//
// What the flow guarantees:
//   - state is checked, so only a sign-in this browser began can finish here
//     (login CSRF); the nonce ties the ID token to it; the PKCE verifier never
//     leaves the cookie and the server;
//   - the ID token is checked by go-oidc (signature, issuer, audience,
//     expiry) and by sso (nonce, the claims that vouch for an address);
//   - the address must belong to someone here already (an owner adds people
//     in Settings), or to someone a provider's allowed domain may create when
//     OIDC_ALLOW_SIGNUP is on. Never linked by an unverified address;
//   - the way back is a fixed address (TRCKABLE_BASE_URL), never the request's
//     Host, and the page after sign-in is a path on this site only.

const (
	ssoCookie     = "trckable_sso"   // the flow in progress
	ssoCookiePath = "/api/v1/oidc/"  // sent to the callback and the code step only
	ssoPending    = "trckable_sso2"  // signed in at the provider, waiting for the authenticator code
	ssoFlowTTL    = 10 * time.Minute // from start to callback
	ssoCodeTTL    = 5 * time.Minute  // from callback to the code
	ssoStateCtx   = "sso state v1"   // what the sealed values are bound to
	ssoPendingCtx = "sso second step v1"
)

// SSOChoice is one provider as the sign-in screen lists it.
type SSOChoice struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// ssoChoices lists the providers, only when signing in with one can work
// (an address of our own to come back to, and a key to seal the flow with) and
// first-run setup has made an owner: until then the setup token is what
// guards the instance, and a provider must not be a second way in.
func (a *API) ssoChoices(hasOwner bool) []SSOChoice {
	out := []SSOChoice{}
	if !a.ssoReady() || !hasOwner {
		return out
	}
	for _, p := range a.SSO.List() {
		out = append(out, SSOChoice{ID: p.Cfg.Name, Label: p.Cfg.Label})
	}
	return out
}

func (a *API) ssoReady() bool { return a.BaseURL != "" && a.Box != nil }

// ssoOpen is ssoReady, and setup is done.
func (a *API) ssoOpen(r *http.Request) bool {
	if !a.ssoReady() {
		return false
	}
	has, err := a.Ctl.HasUsers(r.Context())
	return err == nil && has
}

// ssoLabel is what to call a session's provider; the name if it is gone.
func (a *API) ssoLabel(name string) string {
	if name == "" {
		return ""
	}
	if p := a.SSO.Get(name); p != nil {
		return p.Cfg.Label
	}
	return name
}

type ssoState struct {
	Provider string `json:"p"`
	State    string `json:"s"`
	Nonce    string `json:"n"`
	Verifier string `json:"v"`
	Return   string `json:"r"`
	Exp      int64  `json:"e"`
}

type ssoWait struct {
	Provider string `json:"p"`
	User     string `json:"u"`
	Return   string `json:"r"`
	Exp      int64  `json:"e"`
}

func (a *API) ssoRedirectURL(p *sso.Provider) string {
	return strings.TrimSuffix(a.BaseURL, "/") + "/api/v1/oidc/" + p.Cfg.Name + "/callback"
}

// setSSOCookie writes one of the two short-lived cookies: sealed, so it
// cannot be read or made up; HttpOnly; Lax, so it comes back with the
// provider's redirect and with nothing a third-party site starts.
func (a *API) setSSOCookie(w http.ResponseWriter, r *http.Request, name, value string, ttl time.Duration) {
	maxAge := int(ttl.Seconds())
	if value == "" {
		maxAge = -1
	}
	//nolint:gosec // Secure whenever the address is https or the request came over it; plain http is for localhost and private networks, where a Secure cookie would never be sent
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: value, Path: ssoCookiePath, MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Secure: strings.HasPrefix(a.BaseURL, "https://") || r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
	})
}

func (a *API) sealSSO(v any, context string) (string, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return a.Box.SealFor(string(raw), context)
}

// openSSO reads and opens one of the cookies; false for anything missing,
// altered, from another purpose, or past its time.
func (a *API) openSSO(r *http.Request, name, context string, v any, exp func() int64) bool {
	c, err := r.Cookie(name)
	if err != nil || c.Value == "" {
		return false
	}
	plain, err := a.Box.OpenFor(c.Value, context)
	if err != nil || json.Unmarshal([]byte(plain), v) != nil {
		return false
	}
	return a.Now().Before(time.Unix(exp(), 0))
}

// ssoFail sends the browser back to the sign-in screen with a short code the
// screen turns into words. Never the provider's own text: it is not ours to
// put in a page.
func (a *API) ssoFail(w http.ResponseWriter, code string) {
	ssoRedirect(w, "/login?sso_error="+url.QueryEscape(code))
}

func ssoRedirect(w http.ResponseWriter, to string) {
	h := w.Header()
	h.Set("Cache-Control", "no-store")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("Location", to)
	w.WriteHeader(http.StatusSeeOther)
}

// safeReturn is the page to open after signing in: a path on this site and
// nothing else. Anything that a browser could read as another address is
// replaced by the home page: a second slash or a backslash after the first
// (//evil.com, /\evil.com), a scheme, control characters (tabs and line
// breaks are dropped by browsers inside an address), or no leading slash.
func safeReturn(s string) string {
	if s == "" || len(s) > 512 || s[0] != '/' {
		return "/"
	}
	if len(s) > 1 && (s[1] == '/' || s[1] == '\\') {
		return "/"
	}
	for _, r := range s {
		if r < 0x20 || r == 0x7f || r == '\\' {
			return "/"
		}
	}
	u, err := url.Parse(s)
	if err != nil || u.Scheme != "" || u.Host != "" || u.User != nil || u.Opaque != "" {
		return "/"
	}
	return s
}

// Starting a sign-in costs us a redirect and nothing else: a generous limit
// per address. Only a callback that fails is counted, so people who sign in
// right never use up the tries of the ones guessing.
const (
	ssoStartTries  = 120
	ssoFailedTries = 20
	ssoWindow      = 10 * time.Minute
)

func (a *API) ssoStartLimit(r *http.Request) bool {
	return a.loginRate.allow("ssostart:"+a.ip(r), a.Now(), a.ipMax(r, ssoStartTries), ssoWindow)
}

func (a *API) ssoCallbackFull(r *http.Request) bool {
	return a.loginRate.full("ssocb:"+a.ip(r), a.Now(), a.ipMax(r, ssoFailedTries), ssoWindow)
}

// ssoRefuse counts a failed callback against its address and sends the
// browser back to sign-in with the reason.
func (a *API) ssoRefuse(w http.ResponseWriter, r *http.Request, code string) {
	a.loginRate.record("ssocb:"+a.ip(r), a.Now())
	a.ssoFail(w, code)
}

// ssoStart sends the browser to the provider.
func (a *API) ssoStart(w http.ResponseWriter, r *http.Request) {
	a.init()
	p := a.SSO.Get(r.PathValue("provider"))
	if p == nil || !a.ssoOpen(r) {
		fail(w, http.StatusNotFound, "no such provider")
		return
	}
	if !a.ssoStartLimit(r) {
		a.ssoFail(w, "slow")
		return
	}
	st := ssoState{
		Provider: p.Cfg.Name, State: auth.Token("", 24), Nonce: auth.Token("", 24), Verifier: oauth2.GenerateVerifier(),
		Return: safeReturn(r.URL.Query().Get("return_to")), Exp: a.Now().Add(ssoFlowTTL).Unix(),
	}
	to, err := p.AuthURL(a.ssoRedirectURL(p), st.State, st.Nonce, st.Verifier)
	if err != nil {
		slog.Warn("sign-in with a provider: could not start", "provider", p.Cfg.Name, "err", ssoErr(err))
		a.ssoFail(w, "failed")
		return
	}
	sealed, err := a.sealSSO(st, ssoStateCtx)
	if err != nil {
		slog.Error("sign-in with a provider: could not seal the flow", "err", err)
		a.ssoFail(w, "failed")
		return
	}
	a.setSSOCookie(w, r, ssoCookie, sealed, ssoFlowTTL)
	ssoRedirect(w, to)
}

// ssoCallback finishes the sign-in the provider sent the browser back from.
func (a *API) ssoCallback(w http.ResponseWriter, r *http.Request) {
	a.init()
	name := r.PathValue("provider")
	p := a.SSO.Get(name)
	if p == nil || !a.ssoReady() {
		fail(w, http.StatusNotFound, "no such provider")
		return
	}
	var st ssoState
	opened := a.openSSO(r, ssoCookie, ssoStateCtx, &st, func() int64 { return st.Exp })
	// One try per flow, whatever happens next: a replayed callback finds no
	// cookie.
	a.setSSOCookie(w, r, ssoCookie, "", 0)
	if a.ssoCallbackFull(r) {
		a.ssoFail(w, "slow")
		return
	}
	if !a.ssoOpen(r) { // no owner yet: the setup token guards the instance, not a provider
		a.ssoRefuse(w, r, "failed")
		return
	}
	q := r.URL.Query()
	switch {
	case !opened || st.Provider != name || st.State == "" || st.Nonce == "" || st.Verifier == "":
		a.ssoRefuse(w, r, "failed")
		return
	case subtle.ConstantTimeCompare([]byte(q.Get("state")), []byte(st.State)) != 1:
		slog.Warn("sign-in with a provider: the state did not match", "provider", name)
		a.ssoRefuse(w, r, "failed")
		return
	case q.Get("error") != "":
		a.ssoRefuse(w, r, "denied") // the person said no, or the provider did
		return
	case q.Has("iss") && !p.Cfg.MultiTenant() && q.Get("iss") != p.Issuer():
		slog.Warn("sign-in with a provider: the answer came from another issuer", "provider", name)
		a.ssoRefuse(w, r, "failed")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	id, err := p.Exchange(ctx, a.ssoRedirectURL(p), q.Get("code"), st.Verifier, st.Nonce)
	if errors.Is(err, sso.ErrUnverified) {
		slog.Warn("sign-in with a provider: no verified address", "provider", name)
		a.ssoRefuse(w, r, "unverified")
		return
	}
	if err != nil {
		slog.Warn("sign-in with a provider failed", "provider", name, "err", ssoErr(err))
		a.ssoRefuse(w, r, "failed")
		return
	}
	u, created, ok := a.ssoPerson(ctx, p, id)
	if !ok {
		// The domain, never the address: a refusal's log is not a list of who tried.
		slog.Warn("sign-in with a provider: nobody here has that address", "provider", name, "domain", emailDomain(id.Email))
		a.ssoRefuse(w, r, "no_account")
		return
	}
	if err := a.Ctl.LinkSSO(ctx, u.ID, id.Issuer, id.Subject); err != nil {
		if errors.Is(err, sqlite.ErrNotTheSamePerson) {
			slog.Warn("sign-in with a provider: the provider's id for this person is not the one linked", "provider", name, "user", u.ID)
		} else {
			slog.Error("sign-in with a provider: could not link", "user", u.ID, "err", err)
		}
		a.ssoRefuse(w, r, "failed")
		return
	}
	// The authenticator code is asked of every owner who has one, whatever the
	// setting: an address at a provider is only as good as the provider's
	// word for it, and an owner's account is the one worth the second check.
	// For everyone else it is asked unless OIDC_REQUIRE_TOTP is off.
	two, err := a.Ctl.TwoStepOf(ctx, u.ID)
	if err != nil {
		a.ssoRefuse(w, r, "failed")
		return
	}
	if two.Enabled && (a.SSORequireTOTP || u.Role == sqlite.RoleOwner) {
		wait, err := a.sealSSO(ssoWait{Provider: name, User: u.ID, Return: st.Return, Exp: a.Now().Add(ssoCodeTTL).Unix()}, ssoPendingCtx)
		if err != nil {
			a.ssoRefuse(w, r, "failed")
			return
		}
		a.setSSOCookie(w, r, ssoPending, wait, ssoCodeTTL)
		ssoRedirect(w, "/login?sso=code")
		return
	}
	if !a.ssoSession(w, r, u, name, created) {
		a.ssoRefuse(w, r, "failed")
		return
	}
	ssoRedirect(w, safeReturn(st.Return))
}

// emailDomain is what follows the @.
func emailDomain(email string) string {
	_, d, _ := strings.Cut(email, "@")
	return d
}

// ssoPerson is who the verified address is here. Someone who has it already;
// else, when the instance lets people from a provider's allowed domain make
// their own account (OIDC_ALLOW_SIGNUP), a new viewer. created says which.
// No password is ever usable for a new person: theirs is a random one nobody
// holds, until an owner sets another.
func (a *API) ssoPerson(ctx context.Context, p *sso.Provider, id sso.Identity) (u sqlite.User, created, ok bool) {
	u, err := a.Ctl.UserByEmail(ctx, id.Email)
	if err == nil {
		return u, false, true
	}
	if !errors.Is(err, auth.ErrNotFound) {
		slog.Warn("sign-in with a provider: could not look the person up", "provider", p.Cfg.Name, "err", err)
		return sqlite.User{}, false, false
	}
	if !a.SSOSignup || !p.DomainAllowed(id.Email) {
		return sqlite.User{}, false, false
	}
	_, err = a.Ctl.AddUser(ctx, sqlite.DefaultAccount, id.Email, auth.Token("", 24), sqlite.RoleViewer)
	switch {
	case err == nil:
		created = true
	case errors.Is(err, auth.ErrExists): // made a moment ago, by the same person's other tab
	default:
		slog.Warn("sign-in with a provider: could not add the person", "provider", p.Cfg.Name, "err", err)
		return sqlite.User{}, false, false
	}
	u, err = a.Ctl.UserByEmail(ctx, id.Email)
	return u, created, err == nil
}

// ssoSession opens the session, the same one a password sign-in opens, and
// records it: the log line says who and with what; the session keeps the
// provider's name for the account to show.
func (a *API) ssoSession(w http.ResponseWriter, r *http.Request, u sqlite.User, provider string, created bool) bool {
	// A password an owner chose for this person, not yet replaced, ends here.
	if a.Ctl.MustChange(r.Context(), u.ID) {
		if err := a.Ctl.RetirePassword(r.Context(), u.ID, auth.Token("", 24)); err != nil {
			slog.Warn("sign-in with a provider: could not retire the one-time password", "err", err)
			return false
		}
	}
	tok, err := a.Ctl.CreateSessionVia(r.Context(), u.ID, provider)
	if err != nil {
		slog.Error("sign-in with a provider: could not open a session", "err", err)
		return false
	}
	a.setCookie(w, r, tok, int(sqlite.SessionTTL.Seconds()))
	a.rememberDevice(w, r, u.ID, u.Email) // as a password sign-in does
	slog.Info("signed in with "+provider, "provider", provider, "user", u.ID, "new", created)
	return true
}

// ssoCode is the authenticator code for someone the provider signed in while
// OIDC_REQUIRE_TOTP is on and their account has two-step. The provider did
// the first step; this is the second, held to the same limits as at sign-in.
func (a *API) ssoCode(w http.ResponseWriter, r *http.Request) {
	if !jsonOnly(r) {
		fail(w, http.StatusUnsupportedMediaType, "send JSON")
		return
	}
	a.init()
	if !a.ssoOpen(r) {
		fail(w, http.StatusNotFound, "no such provider")
		return
	}
	if !a.loginRate.allow("ssocode:"+a.ip(r), a.Now(), a.ipMax(r, 10), 10*time.Minute) {
		fail(w, http.StatusTooManyRequests, "too many attempts, try again in a few minutes")
		return
	}
	var wait ssoWait
	if !a.openSSO(r, ssoPending, ssoPendingCtx, &wait, func() int64 { return wait.Exp }) || a.SSO.Get(wait.Provider) == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "sign in again", "restart": true})
		return
	}
	u, err := a.Ctl.UserByID(r.Context(), wait.User)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "sign in again", "restart": true})
		return
	}
	var in struct{ Code string }
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if !a.codeTries(w, &u) {
		return
	}
	err = a.Ctl.CheckSecondStep(r.Context(), u.ID, cleanCode(in.Code), a.unix)
	a.codeResult(&u, in.Code, err)
	switch {
	case errors.Is(err, sqlite.ErrNeedsCode), errors.Is(err, auth.ErrBadLogin):
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "that code is not right: check your phone's clock, or use a recovery code", "needs_code": true})
		return
	case err != nil:
		slog.Error("sign-in with a provider: the second step failed", "user", u.ID, "err", err)
		fail(w, http.StatusInternalServerError, "could not sign in")
		return
	}
	if !a.ssoSession(w, r, u, wait.Provider, false) {
		fail(w, http.StatusInternalServerError, "could not sign in")
		return
	}
	a.setSSOCookie(w, r, ssoPending, "", 0)
	writeJSON(w, http.StatusOK, map[string]string{"return_to": safeReturn(wait.Return)})
}

// ssoErr is an error from the flow as it may be logged. A failed token
// exchange carries the provider's whole answer, which can echo what was sent
// (the code, the client secret): only its error code is kept.
func ssoErr(err error) string {
	var re *oauth2.RetrieveError
	if errors.As(err, &re) {
		return "the token endpoint refused: " + re.ErrorCode
	}
	return err.Error()
}
