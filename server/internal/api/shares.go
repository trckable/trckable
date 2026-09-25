package api

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/modules"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// A link to one site's numbers for someone with no account. Everything it may
// show is decided here: hiding revenue means never asking the query layer for
// it, so the figure is not in the answer to be found in a network tab.

const shareCookie = "trckable_share"

// sharePath is where the browser sends the share cookie back. The link's token
// appears in the address bar once; every request after that carries a session
// instead, so it stays out of logs and Referer headers.
const sharePath = "/api/v1/share"

func (a *API) shares(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	list, err := a.Ctl.Shares(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"shares": list, "base": a.publicBase(r)})
}

func (a *API) createShare(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	var in struct {
		Name     string `json:"name"`
		Password string `json:"password"`
		Revenue  bool   `json:"revenue"`
		Days     int    `json:"days"` // 0 = no end date
		// Embed lists the sites allowed to show this link in an iframe.
		Embed []string `json:"embed_origins"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if len([]rune(in.Name)) > 60 {
		fail(w, http.StatusBadRequest, "keep the name under 60 characters")
		return
	}
	var expires *int64
	if in.Days > 0 {
		if in.Days > 3650 {
			fail(w, http.StatusBadRequest, "ten years is the longest a link can last")
			return
		}
		at := a.Now().AddDate(0, 0, in.Days).Unix()
		expires = &at
	}
	origins, err := embedOrigins(in.Embed)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	sh, token, err := a.Ctl.CreateShare(r.Context(), r.PathValue("site"), in.Name, in.Password, in.Revenue, expires, origins)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"share": sh, "url": a.publicBase(r) + "/s/" + token})
}

func (a *API) deleteShare(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	err := a.Ctl.DeleteShare(r.Context(), r.PathValue("site"), r.PathValue("id"))
	if errors.Is(err, auth.ErrNotFound) {
		fail(w, http.StatusNotFound, "no such link")
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- the public side -------------------------------------------------------

// openShare trades a link's token, and its password if it has one, for a
// session cookie. Rate-limited on the address, because a token is the only
// thing standing between the outside and these numbers.
func (a *API) openShare(w http.ResponseWriter, r *http.Request) {
	if !jsonOnly(r) {
		fail(w, http.StatusUnsupportedMediaType, "send JSON")
		return
	}
	a.init()
	if !a.loginRate.allow("share:"+a.ip(r), a.Now(), 30, 10*time.Minute) {
		fail(w, http.StatusTooManyRequests, "too many attempts, try again in a few minutes")
		return
	}
	var in struct {
		Token, Password string
		// Embed: the page is inside an iframe on another site, where the
		// browser will not send our cookie. The session comes back in the
		// answer instead, and the page sends it as a header.
		Embed bool
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	sh, err := a.Ctl.OpenShare(r.Context(), in.Token, in.Password, a.Now())
	switch {
	case errors.Is(err, sqlite.ErrNeedsPassword):
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "this link asks for a password", "needs_password": true})
		return
	case errors.Is(err, auth.ErrBadLogin):
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "that password is not right", "needs_password": true})
		return
	case errors.Is(err, sqlite.ErrExpired):
		fail(w, http.StatusGone, "this link has expired — ask for a new one")
		return
	case err != nil:
		fail(w, http.StatusNotFound, "this link does not exist, or it was revoked")
		return
	}
	session, err := a.Ctl.StartShareSession(r.Context(), sh.ID, a.Now())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: shareCookie, Value: session, Path: sharePath, MaxAge: int(sqlite.ShareSessionTTL.Seconds()),
		HttpOnly: true, Secure: r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https", SameSite: http.SameSiteLaxMode,
	})
	a.Ctl.TouchShare(r.Context(), sh.ID, a.Now())
	if in.Embed && len(sh.EmbedOrigins) > 0 {
		a.shareInfoWith(w, r, sh, session)
		return
	}
	a.shareInfo(w, r, sh)
}

// shared resolves the cookie to a link, and answers plainly when it cannot.
func (a *API) shared(w http.ResponseWriter, r *http.Request) (sqlite.Share, bool) {
	session := r.Header.Get(shareHeader)
	if session == "" {
		c, err := r.Cookie(shareCookie)
		if err != nil {
			fail(w, http.StatusUnauthorized, "open the link again")
			return sqlite.Share{}, false
		}
		session = c.Value
	}
	sh, err := a.ShareFromSession(r, session)
	if err != nil {
		fail(w, http.StatusUnauthorized, "this link has expired or been revoked")
		return sqlite.Share{}, false
	}
	// A suspended account's links stop working with the account.
	if account, err := a.Ctl.SiteAccount(r.Context(), sh.SiteID); err == nil && a.Ctl.AccountState(r.Context(), account) == sqlite.StateSuspended {
		fail(w, http.StatusUnauthorized, "this link is not available")
		return sqlite.Share{}, false
	}
	return sh, true
}

// shareMe is what the shared page loads first: which site, in what timezone,
// and what it is allowed to show.
func (a *API) shareMe(w http.ResponseWriter, r *http.Request) {
	sh, ok := a.shared(w, r)
	if !ok {
		return
	}
	a.shareInfo(w, r, sh)
}

func (a *API) shareInfo(w http.ResponseWriter, r *http.Request, sh sqlite.Share) {
	a.shareInfoWith(w, r, sh, "")
}

func (a *API) shareInfoWith(w http.ResponseWriter, r *http.Request, sh sqlite.Share, session string) {
	si, err := a.Ctl.SiteInfo(r.Context(), sh.SiteID)
	if err != nil {
		fail(w, http.StatusNotFound, "that site is gone")
		return
	}
	// The modules that change what the page shows travel with it, so a shared
	// dashboard looks like the one the owner sees — minus what the link hides.
	set, _ := modules.Store{DB: a.Ctl.DB}.Of(r.Context(), sh.SiteID)
	mods := map[string]bool{}
	for _, id := range []string{"map", "goals", "funnels", "heatmap", "crawlers"} {
		mods[id] = set.Has(id)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"name":     sh.Name,
		"revenue":  sh.Revenue,
		"expires":  sh.ExpiresAt,
		"domain":   si.Domain,
		"site":     si.Name,
		"timezone": si.Timezone,
		"currency": si.Currency,
		"modules":  mods,
		"session":  session,
	})
}

// shareAnnotations gives a shared page the notes on the chart: "launch post
// on LinkedIn" is the context a number needs, and it is already public the
// moment the link is.
func (a *API) shareAnnotations(w http.ResponseWriter, r *http.Request) {
	sh, ok := a.shared(w, r)
	if !ok {
		return
	}
	v := r.URL.Query()
	list, err := a.Ctl.Annotations(r.Context(), sh.SiteID, v.Get("from"), v.Get("to"))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"annotations": list})
}

// shareReport is the ordinary report, for the shared site, with revenue
// allowed only when the link says so.
func (a *API) shareReport(w http.ResponseWriter, r *http.Request) {
	sh, ok := a.shared(w, r)
	if !ok {
		return
	}
	a.reportFor(w, r, sh.SiteID, sh.Revenue)
}

// shareHeader carries an embedded page's session, since the cookie cannot.
const shareHeader = "X-Trckable-Share"

// ShareFromSession resolves a share session to its link.
func (a *API) ShareFromSession(r *http.Request, session string) (sqlite.Share, error) {
	return a.Ctl.ShareOf(r.Context(), session, a.Now())
}

// embedOrigins checks the sites a link may be embedded on: an origin each,
// https (http only for localhost), no path, at most a handful.
func embedOrigins(in []string) ([]string, error) {
	var out []string
	for _, raw := range in {
		raw = strings.TrimSuffix(strings.TrimSpace(raw), "/")
		if raw == "" {
			continue
		}
		u, err := url.Parse(raw)
		local := err == nil && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1")
		if err != nil || u.Host == "" || (u.Scheme != "https" && !(u.Scheme == "http" && local)) || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.User != nil {
			return nil, fmt.Errorf("%q is not a site address: use one like https://example.com", raw)
		}
		out = append(out, u.Scheme+"://"+u.Host)
	}
	if len(out) > sqlite.MaxEmbedOrigins {
		return nil, fmt.Errorf("a link can be embedded on %d sites at most", sqlite.MaxEmbedOrigins)
	}
	return out, nil
}

// FrameAncestors is the CSP frame-ancestors value for a page: the link's
// embed origins on /s/<token>, and 'none' everywhere else.
func (a *API) FrameAncestors(r *http.Request) string {
	token := shareToken(r.URL.Path)
	if token == "" {
		return ""
	}
	origins := a.Ctl.EmbedOriginsFor(r.Context(), token, a.Now())
	return strings.Join(origins, " ")
}

// shareToken pulls a link's token out of the /s/<token> path, for the page
// that opens it.
func shareToken(path string) string {
	rest, ok := strings.CutPrefix(path, "/s/")
	if !ok {
		return ""
	}
	if i := strings.IndexByte(rest, '/'); i >= 0 {
		rest = rest[:i]
	}
	if len(rest) > 64 {
		return ""
	}
	return rest
}
