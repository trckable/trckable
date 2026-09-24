// Package gsc reads Google Search Console: which searches showed a site, and
// which of them were clicked. It is the only part of trckable that talks to
// Google, and it does so only when a site's owner connects it.
//
// It signs in with a service account rather than OAuth. OAuth needs a Google
// app registered with a redirect back to your own address, which every
// self-hoster would have to create and which cannot work on localhost or a
// private network. A service account works anywhere: you add its email to
// Search Console as a read-only user and paste its key here — the same "one
// key" shape as the payment providers.
//
// No SDK. The whole protocol is an RS256-signed JWT exchanged for a token,
// and two JSON endpoints.
package gsc

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Scope is read-only. trckable never asks for anything it could change.
const Scope = "https://www.googleapis.com/auth/webmasters.readonly"

// Where the requests go. They are variables so tests can stand in for
// Google; production never changes them.
var (
	TokenURL = "https://oauth2.googleapis.com/token"
	APIBase  = "https://searchconsole.googleapis.com/webmasters/v3"
)

// Key is a service account, as Google's JSON key file describes it. Only the
// fields trckable uses are kept.
type Key struct {
	Type        string `json:"type"`
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
	// TokenURI is in the file, and is deliberately not used: a signed
	// assertion is a credential, and it is only ever sent to Google's own
	// token endpoint, whatever a file says.
	TokenURI string `json:"token_uri"`

	signer *rsa.PrivateKey
}

// ParseKey reads a key file and checks it is one this package can use.
func ParseKey(raw []byte) (*Key, error) {
	var k Key
	if err := json.Unmarshal(raw, &k); err != nil {
		return nil, errors.New("that is not a JSON key file")
	}
	if k.Type != "service_account" {
		if k.Type == "authorized_user" || k.Type == "" {
			return nil, errors.New("this is not a service account key. In Google Cloud, open IAM → Service accounts, pick the account, and under Keys add a JSON key")
		}
		return nil, fmt.Errorf("this key is of type %q; Search Console needs a service account key (JSON)", k.Type)
	}
	if !strings.Contains(k.ClientEmail, "@") {
		return nil, errors.New("the key has no client_email")
	}
	block, _ := pem.Decode([]byte(k.PrivateKey))
	if block == nil {
		return nil, errors.New("the key's private_key is not a PEM block")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("the key's private_key cannot be read: %w", err)
	}
	rk, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("the key's private_key is not RSA")
	}
	k.signer = rk
	return &k, nil
}

// Client talks to Search Console for one service account. It keeps its
// access token until a minute before it expires.
type Client struct {
	Key  *Key
	HTTP *http.Client
	Now  func() time.Time

	mu      sync.Mutex
	token   string
	expires time.Time
}

// New returns a client with sensible timeouts.
func New(k *Key) *Client {
	return &Client{Key: k, HTTP: &http.Client{Timeout: 20 * time.Second}, Now: time.Now}
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

// assertion is the signed JWT the token endpoint trades for an access token.
func (c *Client) assertion(now time.Time) (string, error) {
	head := b64([]byte(`{"alg":"RS256","typ":"JWT"}`))
	claims, _ := json.Marshal(map[string]any{
		"iss":   c.Key.ClientEmail,
		"scope": Scope,
		"aud":   TokenURL,
		"iat":   now.Unix(),
		"exp":   now.Add(time.Hour).Unix(),
	})
	unsigned := head + "." + b64(claims)
	sum := sha256.Sum256([]byte(unsigned))
	sig, err := rsa.SignPKCS1v15(nil, c.Key.signer, crypto.SHA256, sum[:])
	if err != nil {
		return "", err
	}
	return unsigned + "." + b64(sig), nil
}

func (c *Client) accessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.Now()
	if c.token != "" && now.Before(c.expires.Add(-time.Minute)) {
		return c.token, nil
	}
	jwt, err := c.assertion(now)
	if err != nil {
		return "", err
	}
	form := url.Values{"grant_type": {"urn:ietf:params:oauth:grant-type:jwt-bearer"}, "assertion": {jwt}}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, TokenURL, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	var out struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		Error       string `json:"error"`
		Description string `json:"error_description"`
	}
	if err := c.do(req, &out); err != nil {
		return "", fmt.Errorf("Google did not accept the key: %w", err)
	}
	if out.AccessToken == "" {
		return "", fmt.Errorf("Google did not accept the key: %s %s", out.Error, out.Description)
	}
	c.token = out.AccessToken
	c.expires = now.Add(time.Duration(out.ExpiresIn) * time.Second)
	return c.token, nil
}

// do sends a request and decodes a JSON answer, turning Google's error shape
// into something a person can act on.
func (c *Client) do(req *http.Request, into any) error {
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode/100 != 2 {
		var ge struct {
			Error json.RawMessage `json:"error"`
			Desc  string          `json:"error_description"`
		}
		_ = json.Unmarshal(body, &ge)
		var inner struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(ge.Error, &inner)
		msg := inner.Message
		if msg == "" {
			msg = ge.Desc
		}
		if msg == "" {
			msg = strings.TrimSpace(string(body))
			if len(msg) > 200 {
				msg = msg[:200]
			}
		}
		return &APIError{Status: resp.StatusCode, Message: msg}
	}
	return json.Unmarshal(body, into)
}

// APIError is Google saying no, with its reason.
type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string { return fmt.Sprintf("%d: %s", e.Status, e.Message) }

func (c *Client) call(ctx context.Context, method, path string, body any, into any) error {
	tok, err := c.accessToken(ctx)
	if err != nil {
		return err
	}
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequestWithContext(ctx, method, APIBase+path, rd)
	req.Header.Set("Authorization", "Bearer "+tok)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.do(req, into)
}

// Property is one Search Console property the service account can read:
// "https://example.com/" for a URL prefix, "sc-domain:example.com" for a
// whole domain.
type Property struct {
	URL        string `json:"url"`
	Permission string `json:"permission"`
}

// Properties lists what the service account has been given access to. An
// empty list is the most common first-run problem, and it has one cause: the
// account's email has not been added as a user in Search Console yet.
func (c *Client) Properties(ctx context.Context) ([]Property, error) {
	var out struct {
		SiteEntry []struct {
			SiteURL         string `json:"siteUrl"`
			PermissionLevel string `json:"permissionLevel"`
		} `json:"siteEntry"`
	}
	if err := c.call(ctx, http.MethodGet, "/sites", nil, &out); err != nil {
		return nil, err
	}
	ps := make([]Property, 0, len(out.SiteEntry))
	for _, s := range out.SiteEntry {
		if s.PermissionLevel == "siteUnverifiedUser" {
			continue // listed, but it cannot read anything
		}
		ps = append(ps, Property{URL: s.SiteURL, Permission: s.PermissionLevel})
	}
	return ps, nil
}

// Row is one line of a Search Console answer.
type Row struct {
	Key         string  `json:"key"`
	Clicks      float64 `json:"clicks"`
	Impressions float64 `json:"impressions"`
	CTR         float64 `json:"ctr"`
	Position    float64 `json:"position"`
}

// Query asks what people searched for (dim "query"), which pages were shown
// (dim "page"), or either one narrowed to a single page.
type Query struct {
	From, To  time.Time // dates, inclusive; Search Console has no times
	Dimension string    // "query" or "page"
	Page      string    // optional: only this path
	Device    string    // optional: DESKTOP, MOBILE or TABLET
	Country   string    // optional: ISO 3166-1 alpha-3, lowercase
	Limit     int
}

// Search runs one query against one property.
//
// dataState "all" includes the last two or three days, which Google marks as
// preliminary and revises. Without it the newest days are always empty and
// the integration looks broken; with it they are shown and labelled.
func (c *Client) Search(ctx context.Context, property string, q Query) ([]Row, error) {
	if q.Dimension != "query" && q.Dimension != "page" {
		return nil, fmt.Errorf("unknown dimension %q", q.Dimension)
	}
	if q.Limit <= 0 || q.Limit > 1000 {
		q.Limit = 100
	}
	body := map[string]any{
		"startDate":  q.From.Format("2006-01-02"),
		"endDate":    q.To.Format("2006-01-02"),
		"dimensions": []string{q.Dimension},
		"rowLimit":   q.Limit,
		"dataState":  "all",
	}
	var filters []map[string]string
	if q.Page != "" {
		filters = append(filters, map[string]string{"dimension": "page", "operator": "includingRegex", "expression": PageRegex(q.Page)})
	}
	if q.Device != "" {
		filters = append(filters, map[string]string{"dimension": "device", "operator": "equals", "expression": q.Device})
	}
	if q.Country != "" {
		filters = append(filters, map[string]string{"dimension": "country", "operator": "equals", "expression": q.Country})
	}
	if len(filters) > 0 {
		body["dimensionFilterGroups"] = []any{map[string]any{"filters": filters}}
	}
	var out struct {
		Rows []struct {
			Keys        []string `json:"keys"`
			Clicks      float64  `json:"clicks"`
			Impressions float64  `json:"impressions"`
			CTR         float64  `json:"ctr"`
			Position    float64  `json:"position"`
		} `json:"rows"`
	}
	path := "/sites/" + url.PathEscape(property) + "/searchAnalytics/query"
	if err := c.call(ctx, http.MethodPost, path, body, &out); err != nil {
		return nil, err
	}
	rows := make([]Row, 0, len(out.Rows))
	for _, r := range out.Rows {
		if len(r.Keys) == 0 {
			continue
		}
		key := r.Keys[0]
		if q.Dimension == "page" {
			key = PathOf(key)
		}
		rows = append(rows, Row{Key: key, Clicks: r.Clicks, Impressions: r.Impressions, CTR: r.CTR, Position: r.Position})
	}
	return rows, nil
}

// PathOf turns a page URL from Search Console into the path trckable shows,
// so the two can be read side by side.
func PathOf(u string) string {
	p, err := url.Parse(u)
	if err != nil || p.Path == "" {
		return "/"
	}
	return p.Path
}

// PageRegex matches one path on any scheme and with or without www — a
// domain property reports all of them, and a trckable filter means the page,
// not the protocol it happened to be served over.
func PageRegex(path string) string {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	var b strings.Builder
	for _, r := range path {
		if strings.ContainsRune(`\.+*?()|[]{}^$`, r) {
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	return `^https?://[^/]+` + b.String() + `(\?.*)?$`
}
