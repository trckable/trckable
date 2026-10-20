package channels

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2"

	"github.com/trckable/trckable/server/internal/secrets"
)

// YouTube scopes are read-only: analytics for the numbers, and the channel's
// own name and id so the account can be told apart and shown.
const (
	youtubeAnalyticsScope = "https://www.googleapis.com/auth/yt-analytics.readonly"
	youtubeReadScope      = "https://www.googleapis.com/auth/youtube.readonly"
)

const (
	googleAuth   = "https://accounts.google.com/o/oauth2/v2/auth"
	googleToken  = "https://oauth2.googleapis.com/token"  //nolint:gosec // a public endpoint URL, not a credential
	googleRevoke = "https://oauth2.googleapis.com/revoke" //nolint:gosec // a public endpoint URL, not a credential
	youtubeAPI   = "https://www.googleapis.com/youtube/v3"
	youtubeStats = "https://youtubeanalytics.googleapis.com/v2"
)

// YouTubeConnector reads a channel's views per day from the YouTube Analytics
// API. Google's YouTube API terms: stored data is refreshed at least every
// 30 days or deleted, and deleted when access is revoked.
type YouTubeConnector struct {
	Doer
	ID     string
	Secret secrets.Secret

	// The real addresses when empty; tests stand in for Google.
	AuthURL, TokenURL, RevokeURL, APIURL, StatsURL string
}

func (*YouTubeConnector) Platform() string { return YouTube }
func (c *YouTubeConnector) Configured() bool {
	return c != nil && c.ID != "" && !c.Secret.Empty()
}
func (*YouTubeConnector) Backfill() int                { return 90 }
func (*YouTubeConnector) MaxStale() time.Duration      { return 28 * 24 * time.Hour } // two days inside Google's 30
func (*YouTubeConnector) RefreshBefore() time.Duration { return 0 }

func pick(v, def string) string {
	if v != "" {
		return v
	}
	return def
}

func (c *YouTubeConnector) oauth(redirect string) *oauth2.Config {
	return &oauth2.Config{
		ClientID: c.ID, ClientSecret: c.Secret.Reveal(), RedirectURL: redirect,
		Scopes:   []string{youtubeAnalyticsScope, youtubeReadScope},
		Endpoint: oauth2.Endpoint{AuthURL: pick(c.AuthURL, googleAuth), TokenURL: pick(c.TokenURL, googleToken)},
	}
}

// SignInURL asks for offline access, so the daily pull can renew the token,
// and for the consent screen each time, so a refresh token is always sent.
func (c *YouTubeConnector) SignInURL(redirect, state, verifier string) string {
	return c.oauth(redirect).AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.SetAuthURLParam("prompt", "consent"), oauth2.S256ChallengeOption(verifier))
}

func (c *YouTubeConnector) Exchange(ctx context.Context, redirect, code, verifier string) (Token, Identity, error) {
	if code == "" || verifier == "" {
		return Token{}, Identity{}, errors.New("channels: a code and a verifier are needed")
	}
	cctx := context.WithValue(ctx, oauth2.HTTPClient, c.client())
	tok, err := c.oauth(redirect).Exchange(cctx, code, oauth2.VerifierOption(verifier))
	if err != nil || tok.AccessToken == "" {
		return Token{}, Identity{}, errors.New("channels: Google did not accept the sign-in")
	}
	t := Token{Access: secrets.NewSecret(tok.AccessToken), Refresh: secrets.NewSecret(tok.RefreshToken), Expires: tok.Expiry}
	if t.Expires.IsZero() {
		t.Expires = time.Now().Add(time.Hour)
	}
	var res struct {
		Items []struct {
			ID      string `json:"id"`
			Snippet struct {
				Title     string `json:"title"`
				CustomURL string `json:"customUrl"`
			} `json:"snippet"`
		} `json:"items"`
	}
	q := url.Values{"part": {"id,snippet"}, "mine": {"true"}}
	if err := c.get(ctx, pick(c.APIURL, youtubeAPI)+"/channels", q, t.Access, &res); err != nil {
		return Token{}, Identity{}, err
	}
	if len(res.Items) == 0 || res.Items[0].ID == "" {
		return Token{}, Identity{}, errors.New("channels: this Google account has no YouTube channel")
	}
	it := res.Items[0]
	handle := it.Snippet.CustomURL
	if handle == "" {
		handle = it.Snippet.Title
	}
	return t, Identity{ID: it.ID, Handle: handle}, nil
}

// Refresh renews the access token with the refresh token.
func (c *YouTubeConnector) Refresh(ctx context.Context, t Token) (Token, error) {
	if t.Refresh.Empty() {
		return t, ErrDenied
	}
	var res struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	form := url.Values{"grant_type": {"refresh_token"}, "refresh_token": {t.Refresh.Reveal()}, "client_id": {c.ID}, "client_secret": {c.Secret.Reveal()}}
	if err := c.post(ctx, pick(c.TokenURL, googleToken), form, &res); err != nil {
		return t, err
	}
	if res.AccessToken == "" {
		return t, ErrDenied
	}
	t.Access = secrets.NewSecret(res.AccessToken)
	t.Expires = time.Now().Add(time.Duration(res.ExpiresIn) * time.Second)
	return t, nil
}

// Daily reads the channel's views, a row per day.
func (c *YouTubeConnector) Daily(ctx context.Context, t Token, _ Identity, from, to string) ([]Day, error) {
	q := url.Values{"ids": {"channel==MINE"}, "startDate": {from}, "endDate": {to}, "metrics": {"views"}, "dimensions": {"day"}, "sort": {"day"}}
	var res struct {
		Rows [][]any `json:"rows"`
	}
	if err := c.get(ctx, pick(c.StatsURL, youtubeStats)+"/reports", q, t.Access, &res); err != nil {
		return nil, err
	}
	out := make([]Day, 0, len(res.Rows))
	for _, r := range res.Rows {
		if len(r) < 2 {
			continue
		}
		d, _ := r[0].(string)
		v, ok := r[1].(float64)
		if !ok || strings.TrimSpace(d) == "" {
			continue
		}
		out = append(out, Day{Day: d, Views: int64(v)})
	}
	return out, nil
}

// Revoke ends Google's grant for the account, so disconnecting here also
// removes trckable from the person's Google account.
func (c *YouTubeConnector) Revoke(ctx context.Context, t Token) {
	tok := t.Refresh
	if tok.Empty() {
		tok = t.Access
	}
	if tok.Empty() {
		return
	}
	_ = c.post(ctx, pick(c.RevokeURL, googleRevoke), url.Values{"token": {tok.Reveal()}}, nil)
}
