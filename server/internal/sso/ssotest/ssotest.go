// Package ssotest is an identity provider for tests: discovery, an
// authorize page that approves at once, a token endpoint that checks the
// client's secret and the PKCE verifier, and signing keys. What it signs is
// whatever a test makes of the claims.
package ssotest

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
)

// Token is one call to the token endpoint, as it arrived.
type Token struct {
	Code, Verifier, ClientID, Secret, Redirect string
}

type grant struct {
	nonce, challenge, redirect string
}

// Fake is the provider.
type Fake struct {
	Server                 *httptest.Server
	ClientID, ClientSecret string
	Now                    func() time.Time

	// DiscoveryIssuer is the issuer the discovery document names; empty is
	// the address of the discovery document itself.
	DiscoveryIssuer string
	// Claims changes the ID token's claims before it is signed.
	Claims func(c map[string]any)
	// WrongKey signs with a key the provider does not publish.
	WrongKey bool
	// NoIDToken answers the token request without an ID token.
	NoIDToken bool
	// State, when set, is what the authorize page sends back as state.
	State string
	// Iss, when set, is sent back with the code (RFC 9207).
	Iss string
	// Error, when set, is what the authorize page answers with instead of a code.
	Error string

	key, other *rsa.PrivateKey
	mu         sync.Mutex
	grants     map[string]grant
	tokens     []Token
	authorizes []url.Values
}

// New starts a provider; it stops with the test.
func New(t *testing.T, clientID, secret string, now func() time.Time) *Fake {
	t.Helper()
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	o, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	f := &Fake{ClientID: clientID, ClientSecret: secret, Now: now, key: k, other: o, grants: map[string]grant{}}
	f.Server = httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(f.Server.Close)
	return f
}

// URL is the provider's address, and its issuer unless a test says otherwise.
func (f *Fake) URL() string { return f.Server.URL }

// Tokens are the token requests so far.
func (f *Fake) Tokens() []Token {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]Token(nil), f.tokens...)
}

// Authorizes are the authorize requests (their query) so far.
func (f *Fake) Authorizes() []url.Values {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]url.Values(nil), f.authorizes...)
}

func (f *Fake) serve(w http.ResponseWriter, r *http.Request) {
	switch {
	case strings.HasSuffix(r.URL.Path, "/.well-known/openid-configuration"):
		prefix := strings.TrimSuffix(r.URL.Path, "/.well-known/openid-configuration")
		iss := f.DiscoveryIssuer
		if iss == "" {
			iss = f.URL() + prefix
		}
		writeJSON(w, map[string]any{
			"issuer": iss, "authorization_endpoint": f.URL() + "/authorize", "token_endpoint": f.URL() + "/token",
			"jwks_uri": f.URL() + "/keys", "id_token_signing_alg_values_supported": []string{"RS256"},
		})
	case r.URL.Path == "/keys":
		writeJSON(w, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &f.key.PublicKey, KeyID: "k1", Algorithm: "RS256", Use: "sig"}}})
	case r.URL.Path == "/authorize":
		f.authorize(w, r)
	case r.URL.Path == "/token":
		f.token(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (f *Fake) authorize(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f.mu.Lock()
	f.authorizes = append(f.authorizes, q)
	f.mu.Unlock()
	back, err := url.Parse(q.Get("redirect_uri"))
	if err != nil || q.Get("client_id") != f.ClientID || q.Get("response_type") != "code" {
		http.Error(w, "bad authorize request", http.StatusBadRequest)
		return
	}
	v := url.Values{}
	state := q.Get("state")
	if f.State != "" {
		state = f.State
	}
	v.Set("state", state)
	if f.Iss != "" {
		v.Set("iss", f.Iss)
	}
	if f.Error != "" {
		v.Set("error", f.Error)
		v.Set("error_description", "Bearer secret-in-the-provider's-words")
	} else {
		code := randToken()
		f.mu.Lock()
		f.grants[code] = grant{nonce: q.Get("nonce"), challenge: q.Get("code_challenge"), redirect: q.Get("redirect_uri")}
		f.mu.Unlock()
		v.Set("code", code)
	}
	back.RawQuery = v.Encode()
	http.Redirect(w, r, back.String(), http.StatusFound) //nolint:gosec // a test provider sends the browser where the test's own app told it to
}

func (f *Fake) token(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	id, secret, basic := r.BasicAuth()
	if basic {
		id, secret = mustUnescape(id), mustUnescape(secret)
	} else {
		id, secret = r.PostForm.Get("client_id"), r.PostForm.Get("client_secret")
	}
	t := Token{Code: r.PostForm.Get("code"), Verifier: r.PostForm.Get("code_verifier"), ClientID: id, Secret: secret, Redirect: r.PostForm.Get("redirect_uri")}
	f.mu.Lock()
	f.tokens = append(f.tokens, t)
	g, ok := f.grants[t.Code]
	delete(f.grants, t.Code) // a code works once
	f.mu.Unlock()
	fail := func(why string) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		// The way a careless provider answers: everything it was sent, back.
		_ = json.NewEncoder(w).Encode(map[string]string{"error": why, "error_description": "got " + t.Code + " " + t.Secret})
	}
	sum := sha256.Sum256([]byte(t.Verifier))
	switch {
	case id != f.ClientID || secret != f.ClientSecret:
		fail("invalid_client")
	case !ok || r.PostForm.Get("grant_type") != "authorization_code" || t.Redirect != g.redirect:
		fail("invalid_grant")
	case g.challenge == "" || base64.RawURLEncoding.EncodeToString(sum[:]) != g.challenge:
		fail("invalid_grant")
	default:
		out := map[string]any{"access_token": "at-" + randToken(), "token_type": "Bearer", "expires_in": 3600}
		if !f.NoIDToken {
			out["id_token"] = f.sign(g.nonce)
		}
		writeJSON(w, out)
	}
}

// sign makes the ID token for a sign-in that started with nonce: a person
// with a verified address, for this client, valid for five minutes.
func (f *Fake) sign(nonce string) string {
	now := f.Now()
	c := map[string]any{
		"iss": f.URL(), "sub": "subject-1", "aud": f.ClientID, "exp": now.Add(5 * time.Minute).Unix(), "iat": now.Unix(),
		"nonce": nonce, "email": "ada@example.com", "email_verified": true,
	}
	if f.Claims != nil {
		f.Claims(c)
	}
	payload, _ := json.Marshal(c)
	key := f.key
	if f.WrongKey {
		key = f.other
	}
	s, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: jose.JSONWebKey{Key: key, KeyID: "k1"}}, (&jose.SignerOptions{}).WithType("JWT"))
	if err != nil {
		panic(err)
	}
	obj, err := s.Sign(payload)
	if err != nil {
		panic(err)
	}
	out, err := obj.CompactSerialize()
	if err != nil {
		panic(err)
	}
	return out
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func randToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func mustUnescape(s string) string {
	u, err := url.QueryUnescape(s)
	if err != nil {
		return s
	}
	return u
}
