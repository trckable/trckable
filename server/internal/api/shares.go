package api

import (
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/modules"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/weburl"
)

// A link to one site's numbers for someone with no account. Everything it may
// show is decided here: hiding revenue means never asking the query layer for
// it, so the figure is not in the answer to be found in a network tab.

const shareCookie = "trckable_share"

// sharePasswordTries is how many wrong passwords one link takes in ten
// minutes, from all addresses together.
const sharePasswordTries = 20

// sharePath is where the browser sends the share cookie back. The link's token
// stays in the page's address (and the page sends no Referer); every API
// request after the first carries a session instead, so the token stays out
// of the API's logs.
const sharePath = "/api/v1/share"

// shareRow is a link as its owner's list shows it: with its address, when one
// can be given (see sqlite.Share.Token).
type shareRow struct {
	sqlite.Share
	URL string `json:"url,omitempty"`
}

// shares lists a site's links to an owner, and only to an owner: the address
// of a link is the credential itself. The answer is never stored or
// compressed (writeJSON says no-store; plainAnswers leaves it alone).
func (a *API) shares(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	list, err := a.Ctl.Shares(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	base := a.shareBase(r, r.PathValue("site"))
	rows := make([]shareRow, 0, len(list))
	for _, sh := range list {
		row := shareRow{Share: sh}
		if sh.Token != "" {
			row.URL = base + "/s/" + sh.Token
		}
		rows = append(rows, row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"shares": rows, "base": base})
}

func (a *API) createShare(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	var in struct {
		Name     string `json:"name"`
		Password string `json:"password"`
		Revenue  bool   `json:"revenue"`
		Notes    bool   `json:"notes"` // the chart's notes: off unless asked for
		Days     int    `json:"days"`  // 0 = no end date
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
	sh, token, err := a.Ctl.CreateShare(r.Context(), r.PathValue("site"), in.Name, in.Password, in.Revenue, in.Notes, expires, origins)
	if busy(w, err) {
		return
	}
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"share": sh, "url": a.shareBase(r, r.PathValue("site")) + "/s/" + token})
}

// updateShare changes what an existing link shows. Only the notes switch for
// now: the rest is fixed when the link is made (a new link is one click).
func (a *API) updateShare(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	var in struct {
		Notes *bool `json:"notes"`
	}
	if err := decode(r, &in); err != nil || in.Notes == nil {
		fail(w, http.StatusBadRequest, "send {\"notes\": true} or false")
		return
	}
	err := a.Ctl.SetShareNotes(r.Context(), r.PathValue("site"), r.PathValue("id"), *in.Notes)
	if errors.Is(err, auth.ErrNotFound) {
		fail(w, http.StatusNotFound, "no such link")
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"notes": *in.Notes})
}

// newShareAddress gives a link a new address. The old one, and every session
// opened through it, stops working at once; the answer is the new address.
func (a *API) newShareAddress(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	a.init()
	// Each new address is a write that ends every open session: limited, so
	// a stolen session cannot keep a link from ever staying put.
	if !a.loginRate.allow("shareaddr:"+r.PathValue("site"), a.Now(), 10, 10*time.Minute) {
		fail(w, http.StatusTooManyRequests, "tried many times just now: try again in a few minutes")
		return
	}
	token, err := a.Ctl.RotateShare(r.Context(), r.PathValue("site"), r.PathValue("id"))
	if errors.Is(err, auth.ErrNotFound) {
		fail(w, http.StatusNotFound, "no such link")
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"url": a.shareBase(r, r.PathValue("site")) + "/s/" + token})
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
	if !a.loginRate.allow("share:"+a.ip(r), a.Now(), a.ipMax(r, 30), 10*time.Minute) {
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
	// Wrong passwords are counted per link as well: the limit per address
	// alone lets many addresses (or a wider ceiling behind a proxy) guess one
	// link's password without end. Only real links with a password count (the
	// key is the token's hash), so this stays as small as the number of such
	// links. The slot is taken before the password is checked, so a burst
	// cannot all pass; a right password gives it back.
	guess := limit{"sharepw:" + hex.EncodeToString(auth.Hash(strings.TrimSpace(in.Token))), sharePasswordTries, 10 * time.Minute}
	now := a.Now()
	reserved := false
	if in.Password != "" && !a.openedHere(r, in.Token) {
		if !a.loginRate.reserve(now, guess) {
			fail(w, http.StatusTooManyRequests, "too many wrong passwords for this link: try again in a few minutes")
			return
		}
		reserved = true
	}
	// A reload of /s/<token> arrives without the password: the session this
	// browser already holds on the same link answers for it.
	sh, held := a.heldShare(r, in.Token)
	var err error
	if !held || in.Password != "" {
		sh, err = a.Ctl.OpenShare(r.Context(), in.Token, in.Password, a.Now())
	}
	if reserved && !errors.Is(err, auth.ErrBadLogin) {
		a.loginRate.release(now, guess)
	}
	if busy(w, err) {
		return
	}
	switch {
	case errors.Is(err, sqlite.ErrNeedsPassword):
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "this link asks for a password", "needs_password": true, "hide_brand": a.hidesBrand(r, in.Token)})
		return
	case errors.Is(err, auth.ErrBadLogin):
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "that password is not right", "needs_password": true, "hide_brand": a.hidesBrand(r, in.Token)})
		return
	case errors.Is(err, sqlite.ErrExpired):
		fail(w, http.StatusGone, "this link has expired — ask for a new one")
		return
	case err != nil:
		fail(w, http.StatusNotFound, "this link does not exist, or it was revoked")
		return
	}
	session, err := a.Ctl.StartShareSession(r.Context(), sh.ID, in.Token, a.Now())
	if errors.Is(err, auth.ErrNotFound) {
		// The owner made a new address between the check and here.
		fail(w, http.StatusNotFound, "this link does not exist, or it was revoked")
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	//nolint:gosec // Secure whenever the request came over https; plain http is for localhost and private networks, where a Secure cookie would never be sent
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

// openedHere says whether this browser already holds a live session on the
// link: someone who guesses wrong passwords can hold the link shut for
// strangers, but not for the people already reading it.
func (a *API) openedHere(r *http.Request, token string) bool {
	_, ok := a.heldShare(r, token)
	return ok
}

// heldShare is the link this browser already holds a live session on, when
// it is the one the token belongs to.
func (a *API) heldShare(r *http.Request, token string) (sqlite.Share, bool) {
	session := r.Header.Get(shareHeader)
	if session == "" {
		if c, err := r.Cookie(shareCookie); err == nil {
			session = c.Value
		}
	}
	if session == "" {
		return sqlite.Share{}, false
	}
	sh, err := a.ShareFromSession(r, session)
	if err != nil || sh.ID == "" || sh.ID != a.Ctl.ShareIDForToken(r.Context(), token) {
		return sqlite.Share{}, false
	}
	return sh, true
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
	for _, m := range modules.All {
		mods[m.ID] = set.Has(m.ID)
	}
	cfg, _ := a.Ctl.SiteConfig(r.Context(), sh.SiteID)
	brand := a.Ctl.ShareBrand(r.Context(), sh.SiteID)
	look := a.Ctl.ShareLookOf(r.Context(), sh.SiteID)
	mark := brand.Color
	if look.Color != "" {
		mark = look.Color
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"color":      mark,
		"accent":     look.Color, // the page's own colour, only when the owner chose one
		"logo_url":   shareLogoURL(look),
		"hide_brand": look.HideBrand,
		"icon_url":   shareIconURL(brand),
		"cookieless": cfg.ConsentFree,
		"name":       sh.Name,
		"revenue":    sh.Revenue,
		"notes":      sh.Notes,
		"expires":    sh.ExpiresAt,
		"domain":     si.Domain,
		"site":       si.Name,
		"timezone":   si.Timezone,
		"currency":   si.Currency,
		"modules":    mods,
		"session":    session,
	})
}

// shareIconURL is where a shared page loads the site's icon from: this server,
// with the link's own session, never a third party.
func shareIconURL(b sqlite.Brand) string {
	if b.IconAt == 0 {
		return ""
	}
	return sharePath + "/icon?v=" + strconv.FormatInt(b.IconAt, 10)
}

// shareIcon is the shared site's icon, for the mark beside its name. It needs
// the link's session like every other answer on this side.
func (a *API) shareIcon(w http.ResponseWriter, r *http.Request) {
	sh, ok := a.shared(w, r)
	if !ok {
		return
	}
	typ, data, err := a.Ctl.BrandIcon(r.Context(), sh.SiteID)
	if err != nil {
		fail(w, http.StatusNotFound, "this site has no icon")
		return
	}
	w.Header().Set("Content-Type", typ)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// The address carries ?v=<when it changed>, so the browser may keep it.
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	_, _ = w.Write(data)
}

// shareAnnotations gives a shared page the notes on the chart, when the
// owner turned them on for this link: "launch post on LinkedIn" is the
// context a number needs, but a note can also say more than the numbers do,
// so a link shows none unless asked. Who wrote a note never leaves: only the
// day and the words.
func (a *API) shareAnnotations(w http.ResponseWriter, r *http.Request) {
	sh, ok := a.shared(w, r)
	if !ok {
		return
	}
	type note struct {
		ID   string `json:"id"`
		Day  string `json:"day"`
		Text string `json:"text"`
		At   int64  `json:"created_at"`
	}
	out := []note{}
	if !sh.Notes || !a.modulesOf(r, sh.SiteID).Has("notes") {
		writeJSON(w, http.StatusOK, map[string]any{"annotations": out})
		return
	}
	v := r.URL.Query()
	list, err := a.Ctl.Annotations(r.Context(), sh.SiteID, v.Get("from"), v.Get("to"))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, n := range list {
		out = append(out, note{n.ID, n.Day, n.Text, n.Created})
	}
	writeJSON(w, http.StatusOK, map[string]any{"annotations": out})
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
// https (http only for localhost), no path, a plain host (the value goes
// into a Content-Security-Policy header), at most a handful.
func embedOrigins(in []string) ([]string, error) {
	var out []string
	for _, raw := range in {
		raw = strings.TrimSuffix(strings.TrimSpace(raw), "/")
		if raw == "" {
			continue
		}
		origin, ok := weburl.Origin(raw)
		if !ok {
			return nil, fmt.Errorf("%q is not a site address: use one like https://example.com", raw)
		}
		out = append(out, origin)
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

// hidesBrand says whether the link's site leaves trckable's name off its
// pages: the password page asks before anything else is known.
func (a *API) hidesBrand(r *http.Request, token string) bool {
	site := a.Ctl.ShareSiteForToken(r.Context(), token)
	return site != "" && a.Ctl.ShareLookOf(r.Context(), site).HideBrand
}
