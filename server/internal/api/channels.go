package api

// Channels: the team's own YouTube, Instagram and Threads accounts and their
// views per day (package channels).
//
//   - connecting is an owner's job (permissions.ActChannelsConnect); anyone who
//     sees the team reads the numbers;
//   - the sign-in's state, and the PKCE verifier where the platform takes one,
//     travel in one short-lived sealed cookie, and the way back is a fixed
//     address (TRCKABLE_BASE_URL), as in the Google Analytics import;
//   - tokens are sealed in the database and never leave the server; nothing
//     here sends one to the browser or writes one to the log;
//   - disconnecting deletes the tokens and every day the account holds.

import (
	"crypto/subtle"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"golang.org/x/oauth2"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/channels"
	"github.com/trckable/trckable/server/internal/permissions"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

const (
	channelsCookie     = "trckable_ch"
	channelsCookiePath = "/api/v1/channels/"
	channelsFlowTTL    = 10 * time.Minute
	channelsStateCtx   = "channels state v1"
)

type channelsState struct {
	Platform string `json:"p"`
	User     string `json:"u"`
	State    string `json:"t"`
	Verifier string `json:"v"`
	Exp      int64  `json:"e"`
}

// channelsReady says whether a platform can be connected here: its app keys,
// an address of our own to come back to, and a key to seal the flow with.
func (a *API) channelsReady(platform string) (channels.Connector, bool) {
	c, ok := a.Channels.Connector(platform)
	return c, ok && a.BaseURL != "" && a.Box != nil
}

func (a *API) channelsRedirectURL(platform string) string {
	return strings.TrimSuffix(a.BaseURL, "/") + channelsCookiePath + url.PathEscape(platform) + "/callback"
}

func (a *API) setChannelsCookie(w http.ResponseWriter, r *http.Request, value string) {
	maxAge := int(channelsFlowTTL.Seconds())
	if value == "" {
		maxAge = -1
	}
	//nolint:gosec // Secure whenever the address is https or the request came over it; plain http is for localhost and private networks, where a Secure cookie would never be sent
	http.SetCookie(w, &http.Cookie{
		Name: channelsCookie, Value: value, Path: channelsCookiePath, MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Secure: strings.HasPrefix(a.BaseURL, "https://") || r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
	})
}

// channelsBack sends the browser back to the team's page with a short code
// the page turns into words. Never the platform's own text.
func channelsBack(w http.ResponseWriter, platform, code string) {
	q := url.Values{"channel": {platform}}
	if code == "" {
		q.Set("connected", "1")
	} else {
		q.Set("channel_error", code)
	}
	ssoRedirect(w, "/sites?"+q.Encode())
}

// The periods the cards can show, and the one they open on.
const channelsDefaultDays = 30

type channelCard struct {
	Platform string `json:"platform"`
	// Ready: the app keys are set, so Connect works. Without them the card
	// says how to set them up.
	Ready      bool                   `json:"ready"`
	Accounts   []sqlite.SocialAccount `json:"accounts"`
	Monitoring int                    `json:"monitoring"`
	// Views is absent until an account has been read once: not zero, unknown.
	Views    *int64 `json:"views,omitempty"`
	Previous *int64 `json:"previous,omitempty"`
	// From is set when the period starts before the numbers can: the total
	// counts from that day only.
	From   string             `json:"from,omitempty"`
	Series []sqlite.SocialDay `json:"series"`
}

// channelsList answers the cards: per platform, never a total across them,
// because a view, a play and an impression are not the same thing.
func (a *API) channelsList(w http.ResponseWriter, r *http.Request) {
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	switch days {
	case 7, 30, 90:
	default:
		days = channelsDefaultDays
	}
	team := principalOf(r).account
	now := a.Now().UTC()
	end := now.AddDate(0, 0, -1) // the newest day any platform has finished
	from := end.AddDate(0, 0, 1-days)
	prevFrom := from.AddDate(0, 0, -days)
	fmtDay := func(t time.Time) string { return t.Format(time.DateOnly) }
	accounts, err := a.Ctl.SocialAccountsOf(r.Context(), team)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	rows, err := a.Ctl.SocialDaysOf(r.Context(), team, fmtDay(prevFrom), fmtDay(end))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	cards := make([]channelCard, 0, len(channels.Platforms))
	for _, p := range channels.Platforms {
		_, ready := a.channelsReady(p)
		card := channelCard{Platform: p, Ready: ready, Accounts: []sqlite.SocialAccount{}, Series: []sqlite.SocialDay{}}
		read, covered := 0, true
		for _, ac := range accounts {
			if ac.Platform != p {
				continue
			}
			card.Accounts = append(card.Accounts, ac)
			if ac.LastOK > 0 {
				read++
			}
			if c := a.Channels.CoverFrom(ac); c > fmtDay(from) {
				card.From = max(card.From, c)
			}
			covered = covered && a.Channels.CoverFrom(ac) <= fmtDay(prevFrom)
		}
		card.Monitoring = len(card.Accounts)
		if read > 0 {
			var cur, prev int64
			byDay := map[string]int64{}
			for _, row := range rows {
				if row.Platform != p {
					continue
				}
				if row.Day >= fmtDay(from) {
					cur += row.Views
					byDay[row.Day] += row.Views
				} else {
					prev += row.Views
				}
			}
			card.Views = &cur
			if covered {
				card.Previous = &prev
			}
			for d := from; !d.After(end); d = d.AddDate(0, 0, 1) {
				if v, ok := byDay[fmtDay(d)]; ok {
					card.Series = append(card.Series, sqlite.SocialDay{Day: fmtDay(d), Views: v})
				}
			}
		}
		cards = append(cards, card)
	}
	writeJSON(w, http.StatusOK, map[string]any{"days": days, "through": fmtDay(end), "platforms": cards})
}

// channelsOwner is the signed-in person who may connect accounts, or nil
// after answering 403.
func (a *API) channelsOwner(w http.ResponseWriter, r *http.Request) *sqlite.User {
	u := principalOf(r).user
	if !canUser(u, permissions.ActChannelsConnect) {
		fail(w, http.StatusForbidden, "only an owner or an admin can connect social accounts")
		return nil
	}
	return u
}

// channelsStart sends the browser to the platform's consent page.
func (a *API) channelsStart(w http.ResponseWriter, r *http.Request) {
	u := a.channelsOwner(w, r)
	if u == nil {
		return
	}
	platform := r.PathValue("platform")
	c, ok := a.channelsReady(platform)
	if !ok {
		fail(w, http.StatusNotFound, "this platform is not set up on this server")
		return
	}
	if !a.loginRate.allow("chstart:"+a.ip(r), a.Now(), 30, 10*time.Minute) {
		fail(w, http.StatusTooManyRequests, "please wait a moment")
		return
	}
	st := channelsState{Platform: platform, User: u.ID, State: auth.Token("", 24), Verifier: oauth2.GenerateVerifier(), Exp: a.Now().Add(channelsFlowTTL).Unix()}
	sealed, err := a.sealSSO(st, channelsStateCtx)
	if err != nil {
		slog.Error("channels: could not seal the flow", "err", err)
		fail(w, http.StatusInternalServerError, "could not start")
		return
	}
	a.setChannelsCookie(w, r, sealed)
	ssoRedirect(w, c.SignInURL(a.channelsRedirectURL(platform), st.State, st.Verifier))
}

// channelsCallback finishes the sign-in the platform sent the browser back from.
func (a *API) channelsCallback(w http.ResponseWriter, r *http.Request) {
	u := a.channelsOwner(w, r)
	if u == nil {
		return
	}
	platform := r.PathValue("platform")
	c, ok := a.channelsReady(platform)
	if !ok {
		fail(w, http.StatusNotFound, "this platform is not set up on this server")
		return
	}
	var st channelsState
	opened := a.openSSO(r, channelsCookie, channelsStateCtx, &st, func() int64 { return st.Exp })
	a.setChannelsCookie(w, r, "") // one try per flow, whatever happens next
	if !opened || st.State == "" || st.User != u.ID || st.Platform != platform {
		ssoRedirect(w, "/sites")
		return
	}
	q := r.URL.Query()
	switch {
	case subtle.ConstantTimeCompare([]byte(q.Get("state")), []byte(st.State)) != 1:
		slog.Warn("channels: the state did not match", "platform", platform)
		channelsBack(w, platform, channels.CodeFailed)
		return
	case q.Get("error") != "":
		channelsBack(w, platform, channels.CodeDenied) // the person said no, or the platform did
		return
	}
	tok, who, err := c.Exchange(r.Context(), a.channelsRedirectURL(platform), q.Get("code"), st.Verifier)
	if err != nil {
		slog.Warn("channels: the sign-in failed", "platform", platform, "err", err)
		channelsBack(w, platform, channels.CodeFailed)
		return
	}
	acct, err := a.Channels.Connect(r.Context(), principalOf(r).account, platform, tok, who)
	if err != nil {
		slog.Warn("channels: could not keep the account", "platform", platform, "err", err)
		channelsBack(w, platform, channels.CodeFailed)
		return
	}
	a.Channels.Soon(acct)
	channelsBack(w, platform, "")
}

// channelsDisconnect removes one account: its tokens and its days. It deletes
// data, so it is an owner's alone, where connecting may be an admin's.
func (a *API) channelsDisconnect(w http.ResponseWriter, r *http.Request) {
	if !requireAct(w, r, permissions.ActChannelsDisconnect, "only an owner can disconnect social accounts") {
		return
	}
	if a.Channels == nil {
		fail(w, http.StatusNotFound, "no such account")
		return
	}
	gone, err := a.Channels.Disconnect(r.Context(), principalOf(r).account, r.PathValue("id"))
	switch {
	case err != nil && !errors.Is(err, auth.ErrNotFound):
		fail(w, http.StatusInternalServerError, err.Error())
	case !gone:
		fail(w, http.StatusNotFound, "no such account")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// channelsDeauth is the address Meta calls when a person removes the app or
// asks for their data to be deleted. It carries a request signed with the app
// secret; nothing else is believed.
func (a *API) channelsDeauth(w http.ResponseWriter, r *http.Request) {
	if a.Channels == nil || r.ParseForm() != nil {
		fail(w, http.StatusNotFound, "not set up")
		return
	}
	err := a.Channels.Deauth(r.Context(), r.PathValue("platform"), r.PostForm.Get("signed_request"))
	switch {
	case errors.Is(err, channels.ErrBadSignedRequest):
		fail(w, http.StatusBadRequest, "not a signed request")
	case err != nil:
		fail(w, http.StatusInternalServerError, err.Error())
	default:
		// The shape Meta's data deletion callback expects.
		writeJSON(w, http.StatusOK, map[string]string{"url": strings.TrimSuffix(a.BaseURL, "/") + "/sites", "confirmation_code": "deleted"})
	}
}
