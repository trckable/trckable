package api

import (
	"crypto/subtle"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/ga"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Importing a site's history from Google Analytics with the owner's own
// Google sign-in (package ga). The browser is sent to Google (start) and
// comes back with a code (callback); what must hold between the two travels
// in one short-lived sealed cookie, as in the sign-in with a provider.
//
//   - owners only, and only for a site of their account: every route is behind
//     the site guard, and the callback checks the person and the site again
//     from the sealed state, since its address names no site;
//   - state is checked, PKCE protects the code, and the way back is a fixed
//     address (TRCKABLE_BASE_URL), never the request's Host;
//   - the access token is held in memory for this person and site and used by
//     the import: never stored, never logged, never sent to the browser.

const (
	gaCookie     = "trckable_ga"
	gaCookiePath = "/api/v1/ga/"
	gaFlowTTL    = 10 * time.Minute
	gaStateCtx   = "ga state v1"
	gaEarliest   = "2020-10-14" // GA4's first day: nothing earlier can exist
)

type gaState struct {
	Site     string `json:"s"`
	User     string `json:"u"`
	State    string `json:"t"`
	Verifier string `json:"v"`
	Exp      int64  `json:"e"`
}

// gaReady says whether importing from Google can work: an OAuth client, an
// address of our own to come back to, and a key to seal the flow with.
func (a *API) gaReady() bool {
	return a.GA != nil && a.GA.Client.Configured() && a.BaseURL != "" && a.Box != nil
}

func (a *API) gaRedirectURL() string {
	return strings.TrimSuffix(a.BaseURL, "/") + "/api/v1/ga/callback"
}

// gaOwner is the signed-in owner, or nil after answering 403: an API key, or
// a viewer, has no business connecting a Google account.
func (a *API) gaOwner(w http.ResponseWriter, r *http.Request) *sqlite.User {
	u := principalOf(r).user
	if u == nil || u.Role != sqlite.RoleOwner {
		fail(w, http.StatusForbidden, "only an owner can import from Google Analytics")
		return nil
	}
	return u
}

func (a *API) setGACookie(w http.ResponseWriter, r *http.Request, value string) {
	maxAge := int(gaFlowTTL.Seconds())
	if value == "" {
		maxAge = -1
	}
	//nolint:gosec // Secure whenever the address is https or the request came over it; plain http is for localhost and private networks, where a Secure cookie would never be sent
	http.SetCookie(w, &http.Cookie{
		Name: gaCookie, Value: value, Path: gaCookiePath, MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Secure: strings.HasPrefix(a.BaseURL, "https://") || r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
	})
}

// gaStatus is what the import dialog asks first: whether signing in with
// Google is offered, whether this owner is signed in for the site, and how
// the import is going. Never a token.
func (a *API) gaStatus(w http.ResponseWriter, r *http.Request) {
	u := a.gaOwner(w, r)
	if u == nil {
		return
	}
	out := map[string]any{"enabled": a.gaReady()}
	if a.gaReady() {
		site := r.PathValue("site")
		out["connected"] = a.GA.Connected(site, u.ID)
		if s, ok := a.GA.Status(site, u.ID); ok {
			out["job"] = s
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// gaStart sends the browser to Google.
func (a *API) gaStart(w http.ResponseWriter, r *http.Request) {
	u := a.gaOwner(w, r)
	if u == nil {
		return
	}
	if !a.gaReady() {
		fail(w, http.StatusNotFound, "importing from Google Analytics is not set up on this server")
		return
	}
	if !a.gaStartLimit(r) {
		fail(w, http.StatusTooManyRequests, "please wait a moment")
		return
	}
	st := gaState{Site: r.PathValue("site"), User: u.ID, State: auth.Token("", 24), Verifier: oauth2.GenerateVerifier(), Exp: a.Now().Add(gaFlowTTL).Unix()}
	sealed, err := a.sealSSO(st, gaStateCtx)
	if err != nil {
		slog.Error("google analytics import: could not seal the flow", "err", err)
		fail(w, http.StatusInternalServerError, "could not start")
		return
	}
	a.setGACookie(w, r, sealed)
	ssoRedirect(w, a.GA.Client.SignInURL(a.gaRedirectURL(), st.State, st.Verifier))
}

func (a *API) gaStartLimit(r *http.Request) bool {
	return a.loginRate.allow("gastart:"+a.ip(r), a.Now(), 30, 10*time.Minute)
}

// gaBack sends the browser back to the dashboard with a short code the
// import dialog turns into words. Never Google's own text.
func gaBack(w http.ResponseWriter, domain, code string) {
	q := url.Values{"import": {"ga"}}
	if code != "" {
		q.Set("ga_error", code)
	}
	ssoRedirect(w, "/"+url.PathEscape(domain)+"?"+q.Encode())
}

// gaCallback finishes the sign-in Google sent the browser back from.
func (a *API) gaCallback(w http.ResponseWriter, r *http.Request) {
	u := a.gaOwner(w, r)
	if u == nil {
		return
	}
	if !a.gaReady() {
		fail(w, http.StatusNotFound, "importing from Google Analytics is not set up on this server")
		return
	}
	var st gaState
	opened := a.openSSO(r, gaCookie, gaStateCtx, &st, func() int64 { return st.Exp })
	a.setGACookie(w, r, "") // one try per flow, whatever happens next
	p := principalOf(r)
	if !opened || st.State == "" || st.Verifier == "" || st.User != u.ID {
		ssoRedirect(w, "/")
		return
	}
	info, err := a.Ctl.SiteInfo(r.Context(), st.Site)
	owner, err2 := a.Ctl.SiteAccount(r.Context(), st.Site)
	if err != nil || err2 != nil || owner != p.account || !p.sees(st.Site) {
		ssoRedirect(w, "/")
		return
	}
	q := r.URL.Query()
	switch {
	case subtle.ConstantTimeCompare([]byte(q.Get("state")), []byte(st.State)) != 1:
		slog.Warn("google analytics import: the state did not match")
		gaBack(w, info.Domain, "failed")
		return
	case q.Get("error") != "":
		gaBack(w, info.Domain, "denied") // the person said no, or Google did
		return
	}
	tok, expiry, err := a.GA.Client.Exchange(r.Context(), a.gaRedirectURL(), q.Get("code"), st.Verifier)
	if err != nil {
		slog.Warn("google analytics import: the sign-in failed", "err", err)
		gaBack(w, info.Domain, "failed")
		return
	}
	a.GA.Hold(st.Site, u.ID, tok, expiry)
	gaBack(w, info.Domain, "")
}

// gaProperties lists the GA4 properties the signed-in Google account can read.
func (a *API) gaProperties(w http.ResponseWriter, r *http.Request) {
	u := a.gaOwner(w, r)
	if u == nil {
		return
	}
	tok, ok := a.GA.Token(r.PathValue("site"), u.ID)
	if !a.gaReady() || !ok {
		fail(w, http.StatusConflict, "sign in with Google first")
		return
	}
	list, err := a.GA.Client.Properties(r.Context(), tok)
	if err != nil {
		a.gaFail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"properties": list})
}

// gaFail answers a failure of Google's with a code, not its words.
func (a *API) gaFail(w http.ResponseWriter, err error) {
	var q *ga.QuotaError
	switch {
	case errors.Is(err, ga.ErrDenied):
		fail(w, http.StatusForbidden, ga.CodeDenied)
	case errors.As(err, &q):
		w.Header().Set("Retry-After", "300")
		fail(w, http.StatusTooManyRequests, ga.CodeQuota)
	default:
		slog.Warn("google analytics import: a request failed", "err", err)
		fail(w, http.StatusBadGateway, ga.CodeFailed)
	}
}

// gaImport starts (or goes on with) the import of one property.
func (a *API) gaImport(w http.ResponseWriter, r *http.Request) {
	u := a.gaOwner(w, r)
	if u == nil {
		return
	}
	if !a.gaReady() {
		fail(w, http.StatusNotFound, "importing from Google Analytics is not set up on this server")
		return
	}
	site := r.PathValue("site")
	var in struct {
		Property string `json:"property"`
		From     string `json:"from"`
		Resume   bool   `json:"resume"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	tok, ok := a.GA.Token(site, u.ID)
	if !ok {
		fail(w, http.StatusConflict, "sign in with Google first")
		return
	}
	if !ga.ValidProperty(in.Property) {
		fail(w, http.StatusBadRequest, "not a GA4 property")
		return
	}
	// Only a property this Google account can read.
	list, err := a.GA.Client.Properties(r.Context(), tok)
	if err != nil {
		a.gaFail(w, err)
		return
	}
	found := false
	for _, p := range list {
		found = found || p.ID == in.Property
	}
	if !found {
		fail(w, http.StatusBadRequest, "not a GA4 property")
		return
	}
	info, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	from, to, ok := a.gaRange(r, info, in.From)
	if !ok {
		fail(w, http.StatusBadRequest, "there is nothing to import before this site's first visit")
		return
	}
	snap, err := a.GA.Start(site, u.ID, in.Property, from, to, in.Resume)
	switch {
	case errors.Is(err, ga.ErrRunning):
		fail(w, http.StatusConflict, "an import of this site is already running")
	case err != nil:
		fail(w, http.StatusBadRequest, "could not start the import")
	default:
		writeJSON(w, http.StatusAccepted, map[string]any{"job": snap})
	}
}

// gaRange is the days to import: from the start of GA4 (or the day asked
// for) to yesterday, and no further than the day before the site's own first
// event, which is where the reports take over.
func (a *API) gaRange(r *http.Request, info sqlite.SiteInfo, asked string) (from, to string, ok bool) {
	loc, err := time.LoadLocation(info.Timezone)
	if err != nil {
		loc = time.UTC
	}
	last := a.Now().In(loc).AddDate(0, 0, -1)
	if q := a.Query; q != nil {
		if qq := q(); qq != nil {
			if first, err := qq.FirstRecordedDay(r.Context(), info.ID, info.Timezone); err == nil && first != "" {
				if t, err := time.ParseInLocation(time.DateOnly, first, loc); err == nil {
					last = t.AddDate(0, 0, -1)
				}
			}
		}
	}
	from = gaEarliest
	if t, err := time.Parse(time.DateOnly, asked); err == nil && asked > gaEarliest {
		from = t.Format(time.DateOnly)
	}
	to = last.Format(time.DateOnly)
	return from, to, from <= to
}

// gaDisconnect forgets the token and stops the import. What was imported
// stays.
func (a *API) gaDisconnect(w http.ResponseWriter, r *http.Request) {
	u := a.gaOwner(w, r)
	if u == nil {
		return
	}
	if a.GA != nil {
		a.GA.Disconnect(r.PathValue("site"), u.ID)
	}
	w.WriteHeader(http.StatusNoContent)
}
