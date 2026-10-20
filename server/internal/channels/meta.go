package channels

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/secrets"
)

// metaConnector is what Instagram (with Instagram Login) and Threads share:
// the same authorization-code flow, a short-lived token traded for a
// 60-day one that is renewed before it ends, and an insights endpoint.
type metaConnector struct {
	Doer
	ID     string
	Secret secrets.Secret

	// The real addresses when empty; tests stand in for Meta.
	AuthURL, TokenURL, GraphURL string

	name      string
	authBase  string
	tokenBase string
	graphBase string
	scope     string
	exchange  string // grant_type of the long-lived trade
	renew     string // grant_type of the renewal
	meFields  string
	idField   string
	backfill  int
}

func (c *metaConnector) Platform() string { return c.name }
func (c *metaConnector) Configured() bool {
	return c != nil && c.ID != "" && !c.Secret.Empty()
}
func (c *metaConnector) Backfill() int                 { return c.backfill }
func (*metaConnector) MaxStale() time.Duration         { return 0 }
func (*metaConnector) RefreshBefore() time.Duration    { return 14 * 24 * time.Hour }
func (c *metaConnector) graph() string                 { return pick(c.GraphURL, c.graphBase) }
func (c *metaConnector) Revoke(context.Context, Token) {} // the person removes the app in their settings; Meta tells us

// SignInURL has no PKCE: Meta's consent pages do not take one. The state
// still binds the answer to this person's sign-in.
func (c *metaConnector) SignInURL(redirect, state, _ string) string {
	q := url.Values{"client_id": {c.ID}, "redirect_uri": {redirect}, "response_type": {"code"}, "scope": {c.scope}, "state": {state}}
	return pick(c.AuthURL, c.authBase) + "?" + q.Encode()
}

func (c *metaConnector) tokenStep(ctx context.Context, redirect, code string) (Token, string, error) {
	if code == "" {
		return Token{}, "", errors.New("channels: a code is needed")
	}
	form := url.Values{"client_id": {c.ID}, "client_secret": {c.Secret.Reveal()}, "grant_type": {"authorization_code"}, "redirect_uri": {redirect}, "code": {code}}
	var res struct {
		AccessToken string      `json:"access_token"`
		UserID      json.Number `json:"user_id"`
		Data        []struct {
			AccessToken string      `json:"access_token"`
			UserID      json.Number `json:"user_id"`
		} `json:"data"`
	}
	if err := c.post(ctx, pick(c.TokenURL, c.tokenBase), form, &res); err != nil {
		return Token{}, "", errors.New("channels: the platform did not accept the sign-in")
	}
	short, user := res.AccessToken, res.UserID.String()
	if short == "" && len(res.Data) > 0 {
		short, user = res.Data[0].AccessToken, res.Data[0].UserID.String()
	}
	if short == "" {
		return Token{}, "", errors.New("channels: the platform sent no access token")
	}
	// Short-lived (an hour) for long-lived (60 days).
	long, err := c.longer(ctx, c.exchange, short)
	if err != nil {
		return Token{}, "", err
	}
	return long, user, nil
}

// longer trades or renews a token; both answer with a token and its life.
func (c *metaConnector) longer(ctx context.Context, grant string, tok string) (Token, error) {
	q := url.Values{"grant_type": {grant}, "access_token": {tok}}
	u := c.graphRoot() + "/access_token"
	if grant == c.exchange {
		q.Set("client_secret", c.Secret.Reveal())
	} else {
		u = c.graphRoot() + "/refresh_access_token"
	}
	var res struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := c.get(ctx, u, q, secrets.Secret{}, &res); err != nil {
		return Token{}, err
	}
	if res.AccessToken == "" {
		return Token{}, ErrDenied
	}
	return Token{Access: secrets.NewSecret(res.AccessToken), Expires: time.Now().Add(time.Duration(res.ExpiresIn) * time.Second)}, nil
}

// graphRoot is the host without a version: the token calls have none.
func (c *metaConnector) graphRoot() string {
	g := c.graph()
	if i := strings.LastIndex(g, "/v"); i > len("https://") && !strings.Contains(g[i+1:], "/") {
		return g[:i]
	}
	return g
}

func (c *metaConnector) Refresh(ctx context.Context, t Token) (Token, error) {
	return c.longer(ctx, c.renew, t.Access.Reveal())
}

func (c *metaConnector) me(ctx context.Context, t Token) (Identity, error) {
	var res map[string]any
	if err := c.get(ctx, c.graph()+"/me", url.Values{"fields": {c.meFields}}, t.Access, &res); err != nil {
		return Identity{}, err
	}
	id := scalar(res[c.idField])
	if id == "" {
		return Identity{}, errors.New("channels: the platform did not say who signed in")
	}
	app := scalar(res["id"])
	handle := scalar(res["username"])
	if handle != "" {
		handle = "@" + strings.TrimPrefix(handle, "@")
	}
	return Identity{ID: id, Handle: handle, AppID: app}, nil
}

func scalar(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	}
	return ""
}

// Deauth reads a signed request Meta sends when a person removes the app or
// asks for their data to be deleted, and returns whose it is. The signature
// is an HMAC of the payload with the app secret.
func (c *metaConnector) Deauth(signed string) (string, error) {
	sig, payload, ok := strings.Cut(signed, ".")
	if !ok || c.Secret.Empty() {
		return "", ErrBadSignedRequest
	}
	got, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(sig, "="))
	if err != nil {
		return "", ErrBadSignedRequest
	}
	mac := hmac.New(sha256.New, []byte(c.Secret.Reveal()))
	mac.Write([]byte(payload))
	if !hmac.Equal(got, mac.Sum(nil)) {
		return "", ErrBadSignedRequest
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(payload, "="))
	if err != nil {
		return "", ErrBadSignedRequest
	}
	var p struct {
		Algorithm string      `json:"algorithm"`
		UserID    json.Number `json:"user_id"`
	}
	if json.Unmarshal(raw, &p) != nil || p.UserID.String() == "" || !strings.EqualFold(p.Algorithm, "HMAC-SHA256") {
		return "", ErrBadSignedRequest
	}
	return p.UserID.String(), nil
}

// InstagramConnector reads an Instagram Business or Creator account's views
// (Instagram API with Instagram Login). The account-level "views" metric is a
// total, so a day is one call: that is what keeps a pull at a few dozen
// requests and far under the hourly limit.
type InstagramConnector struct{ metaConnector }

// NewInstagram returns the connector for the Instagram app's id and secret.
func NewInstagram(id string, secret secrets.Secret) *InstagramConnector {
	return &InstagramConnector{metaConnector{
		ID: id, Secret: secret, name: Instagram,
		authBase: "https://www.instagram.com/oauth/authorize", tokenBase: "https://api.instagram.com/oauth/access_token",
		graphBase: "https://graph.instagram.com/v21.0",
		scope:     "instagram_business_basic,instagram_business_manage_insights",
		exchange:  "ig_exchange_token", renew: "ig_refresh_token", meFields: "user_id,username", idField: "user_id",
		backfill: 30,
	}}
}

func (c *InstagramConnector) Exchange(ctx context.Context, redirect, code, _ string) (Token, Identity, error) {
	t, _, err := c.tokenStep(ctx, redirect, code)
	if err != nil {
		return Token{}, Identity{}, err
	}
	id, err := c.me(ctx, t)
	return t, id, err
}

// Daily asks for each day on its own.
func (c *InstagramConnector) Daily(ctx context.Context, t Token, id Identity, from, to string) ([]Day, error) {
	a, err := dayStart(from)
	if err != nil {
		return nil, err
	}
	b, err := dayStart(to)
	if err != nil {
		return nil, err
	}
	if c.Pace == 0 {
		c.Pace = 400 * time.Millisecond
	}
	var out []Day
	for d := a; !d.After(b); d = d.AddDate(0, 0, 1) {
		q := url.Values{"metric": {"views"}, "period": {"day"}, "metric_type": {"total_value"},
			"since": {strconv.FormatInt(d.Unix(), 10)}, "until": {strconv.FormatInt(d.AddDate(0, 0, 1).Unix(), 10)}}
		var res struct {
			Data []struct {
				TotalValue struct {
					Value float64 `json:"value"`
				} `json:"total_value"`
			} `json:"data"`
		}
		if err := c.get(ctx, c.graph()+"/"+url.PathEscape(id.ID)+"/insights", q, t.Access, &res); err != nil {
			return out, err
		}
		if len(res.Data) > 0 {
			out = append(out, Day{Day: day(d), Views: int64(res.Data[0].TotalValue.Value)})
		}
	}
	return out, nil
}

// ThreadsConnector reads a Threads profile's views per day.
type ThreadsConnector struct{ metaConnector }

// NewThreads returns the connector for the Threads app's id and secret.
func NewThreads(id string, secret secrets.Secret) *ThreadsConnector {
	return &ThreadsConnector{metaConnector{
		ID: id, Secret: secret, name: Threads,
		authBase: "https://threads.net/oauth/authorize", tokenBase: "https://graph.threads.net/oauth/access_token",
		graphBase: "https://graph.threads.net/v1.0",
		scope:     "threads_basic,threads_manage_insights",
		exchange:  "th_exchange_token", renew: "th_refresh_token", meFields: "id,username", idField: "id",
		backfill: 90,
	}}
}

func (c *ThreadsConnector) Exchange(ctx context.Context, redirect, code, _ string) (Token, Identity, error) {
	t, _, err := c.tokenStep(ctx, redirect, code)
	if err != nil {
		return Token{}, Identity{}, err
	}
	id, err := c.me(ctx, t)
	return t, id, err
}

// Daily reads the profile's views as a series. Each value ends at a time
// (Meta's day starts and ends at the same hour, not at UTC midnight), and
// belongs to the day before it.
func (c *ThreadsConnector) Daily(ctx context.Context, t Token, id Identity, from, to string) ([]Day, error) {
	a, err := dayStart(from)
	if err != nil {
		return nil, err
	}
	b, err := dayStart(to)
	if err != nil {
		return nil, err
	}
	q := url.Values{"metric": {"views"}, "since": {strconv.FormatInt(a.Unix(), 10)}, "until": {strconv.FormatInt(b.AddDate(0, 0, 1).Unix(), 10)}}
	var res struct {
		Data []struct {
			Name   string `json:"name"`
			Values []struct {
				Value   float64 `json:"value"`
				EndTime string  `json:"end_time"`
			} `json:"values"`
			TotalValue *struct {
				Value float64 `json:"value"`
			} `json:"total_value"`
		} `json:"data"`
	}
	if err := c.get(ctx, c.graph()+"/"+url.PathEscape(id.ID)+"/threads_insights", q, t.Access, &res); err != nil {
		return nil, err
	}
	var out []Day
	for _, m := range res.Data {
		if m.Name != "views" {
			continue
		}
		for _, v := range m.Values {
			end, err := time.Parse("2006-01-02T15:04:05-0700", v.EndTime)
			if err != nil {
				continue
			}
			d := day(end.Add(-24 * time.Hour))
			if d < from || d > to {
				continue
			}
			out = append(out, Day{Day: d, Views: int64(v.Value)})
		}
	}
	return out, nil
}
