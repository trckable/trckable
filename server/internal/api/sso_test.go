package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/sso"
	"github.com/trckable/trckable/server/internal/sso/ssotest"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

const (
	idpClient = "client-id-1"
	idpSecret = "client-secret-very-secret-1"
)

type ssoRig struct {
	*rig
	idp *ssotest.Fake
}

// newSSO starts the app with one provider, "fake", set up the way an owner
// would: a signed-in owner exists (me@site.com) and ada@example.com is a
// viewer who has never used a password.
func newSSO(t *testing.T, edit ...func(*config.OIDCProvider, *API)) *ssoRig {
	t.Helper()
	s := newSSOBare(t, edit...)
	s.setup(t, client())
	if _, err := s.ctl.AddUser(context.Background(), sqlite.DefaultAccount, "ada@example.com", "a password nobody types", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	return s
}

// newSSOBare is newSSO before first-run setup: nobody exists yet.
func newSSOBare(t *testing.T, edit ...func(*config.OIDCProvider, *API)) *ssoRig {
	t.Helper()
	g := newRig(t)
	idp := ssotest.New(t, idpClient, idpSecret, g.api.Now)
	cfg := config.OIDCProvider{Name: "fake", Kind: config.KindOIDC, Label: "Fake", Issuer: idp.URL(), ClientID: idpClient, ClientSecret: idpSecret}
	for _, e := range edit {
		e(&cfg, g.api)
	}
	g.api.BaseURL = g.srv.URL
	g.api.SSO = sso.NewRegistry([]config.OIDCProvider{cfg}, nil, g.api.Now)
	return &ssoRig{rig: g, idp: idp}
}

// stepper is a browser that shows every redirect instead of following it.
func stepper() *http.Client {
	jar, _ := cookiejar.New(nil)
	return &http.Client{Jar: jar, Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}

// hop is what a response said, once its body is closed.
type hop struct {
	StatusCode int
	Header     http.Header
	cookies    []*http.Cookie
}

func (h hop) Cookies() []*http.Cookie { return h.cookies }

func fetch(t *testing.T, c *http.Client, u string, hdr ...string) hop {
	t.Helper()
	req, _ := http.NewRequest("GET", u, nil)
	for i := 0; i+1 < len(hdr); i += 2 {
		req.Header.Set(hdr[i], hdr[i+1])
	}
	res, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	return hop{res.StatusCode, res.Header, res.Cookies()}
}

// callback walks start, the provider and back, and answers the callback's
// response: where the browser is sent after signing in.
func (s *ssoRig) callback(t *testing.T, c *http.Client, returnTo string) hop {
	t.Helper()
	start := s.srv.URL + "/api/v1/oidc/fake/start"
	if returnTo != "" {
		start += "?return_to=" + url.QueryEscape(returnTo)
	}
	r1 := fetch(t, c, start)
	if r1.StatusCode != http.StatusSeeOther {
		t.Fatalf("start: %d, want a redirect to the provider", r1.StatusCode)
	}
	r2 := fetch(t, c, r1.Header.Get("Location"))
	if r2.StatusCode != http.StatusFound {
		t.Fatalf("the provider's authorize page: %d", r2.StatusCode)
	}
	return fetch(t, c, r2.Header.Get("Location"))
}

func landed(t *testing.T, res hop, want string) {
	t.Helper()
	if res.StatusCode != http.StatusSeeOther || res.Header.Get("Location") != want {
		t.Fatalf("sent to %d %q, want %q", res.StatusCode, res.Header.Get("Location"), want)
	}
}

func signedIn(t *testing.T, s *ssoRig, c *http.Client) bool {
	t.Helper()
	code, _ := do(t, c, "GET", s.srv.URL+"/api/v1/me", "")
	return code == http.StatusOK
}

func (s *ssoRig) refused(t *testing.T, res hop, c *http.Client, why string) {
	t.Helper()
	landed(t, res, "/login?sso_error="+why)
	if signedIn(t, s, c) {
		t.Fatal("refused, and signed in anyway")
	}
	for _, ck := range res.Cookies() {
		if ck.Name == sessionCookie && ck.Value != "" {
			t.Fatal("refused, and a session cookie was set")
		}
	}
}

func TestSSOSignsInSomeoneWhoIsAlreadyHere(t *testing.T) {
	s := newSSO(t)
	c := stepper()
	res := s.callback(t, c, "/site.com?range=7d")
	landed(t, res, "/site.com?range=7d")
	if code, out := do(t, c, "GET", s.srv.URL+"/api/v1/me", ""); code != 200 || out["email"] != "ada@example.com" || out["role"] != "viewer" {
		t.Fatalf("me: %d %v", code, out)
	}
	if _, out := do(t, c, "GET", s.srv.URL+"/api/v1/account", ""); out["signed_in_with"] != "Fake" {
		t.Fatalf("the account does not say how this session signed in: %v", out)
	}
	// A password session says nothing of the kind.
	pw := client()
	do(t, pw, "POST", s.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery"}`)
	if _, out := do(t, pw, "GET", s.srv.URL+"/api/v1/account", ""); out["signed_in_with"] != nil {
		t.Fatalf("a password session claims a provider: %v", out)
	}
	// The flow's cookie is spent.
	if landed := fetch(t, c, s.srv.URL+"/api/v1/oidc/fake/callback?code=x&state=y"); landed.Header.Get("Location") != "/login?sso_error=failed" {
		t.Fatalf("a callback with no flow in progress: %q", landed.Header.Get("Location"))
	}
}

func TestSSOSendsPKCEAndChecksItsAnswer(t *testing.T) {
	s := newSSO(t)
	c := stepper()
	landed(t, s.callback(t, c, ""), "/")
	az, tk := s.idp.Authorizes(), s.idp.Tokens()
	if len(az) != 1 || len(tk) != 1 {
		t.Fatalf("authorize %d, token %d requests", len(az), len(tk))
	}
	q := az[0]
	if q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" || q.Get("state") == "" || q.Get("nonce") == "" {
		t.Fatalf("authorize request: %v", q)
	}
	if q.Get("client_secret") != "" || q.Get("code_verifier") != "" || strings.Contains(q.Encode(), idpSecret) {
		t.Fatalf("a secret went through the browser: %v", q)
	}
	sum := sha256.Sum256([]byte(tk[0].Verifier))
	if tk[0].Verifier == "" || base64.RawURLEncoding.EncodeToString(sum[:]) != q.Get("code_challenge") {
		t.Fatalf("the verifier sent to the token endpoint is not the one the challenge was made from: %q", tk[0].Verifier)
	}
	if tk[0].ClientID != idpClient || tk[0].Secret != idpSecret {
		t.Fatalf("token request credentials: %+v", tk[0])
	}
	if want := s.srv.URL + "/api/v1/oidc/fake/callback"; tk[0].Redirect != want || q.Get("redirect_uri") != want {
		t.Fatalf("the way back is %q / %q, want the configured address %q", q.Get("redirect_uri"), tk[0].Redirect, want)
	}
}

// The way back never comes from the request's own Host.
func TestSSOWayBackIsNotTheRequestsHost(t *testing.T) {
	s := newSSO(t)
	c := stepper()
	r1 := fetch(t, c, s.srv.URL+"/api/v1/oidc/fake/start", "Host", "evil.example", "X-Forwarded-Host", "evil.example")
	if r1.StatusCode != http.StatusSeeOther {
		t.Fatalf("start: %d", r1.StatusCode)
	}
	u, _ := url.Parse(r1.Header.Get("Location"))
	if got := u.Query().Get("redirect_uri"); got != s.srv.URL+"/api/v1/oidc/fake/callback" {
		t.Fatalf("redirect_uri: %q", got)
	}
}

func TestSSOFlowCookieIsSealedShortAndHttpOnly(t *testing.T) {
	s := newSSO(t)
	r := fetch(t, stepper(), s.srv.URL+"/api/v1/oidc/fake/start", "X-Forwarded-Proto", "https")
	var ck *http.Cookie
	for _, x := range r.Cookies() {
		if x.Name == ssoCookie {
			ck = x
		}
	}
	if ck == nil {
		t.Fatal("no flow cookie")
	}
	if !ck.HttpOnly || !ck.Secure || ck.SameSite != http.SameSiteLaxMode || ck.MaxAge != 600 || ck.Path != "/api/v1/oidc/" {
		t.Fatalf("cookie: %+v", ck)
	}
	loc, _ := url.Parse(r.Header.Get("Location"))
	for _, secret := range []string{loc.Query().Get("state"), loc.Query().Get("nonce")} {
		if strings.Contains(ck.Value, secret) {
			t.Fatal("the cookie holds the state or nonce in the clear")
		}
	}
	// With the address over https the cookie is Secure whatever the request looked like.
	s.api.BaseURL = "https://trckable.example"
	r = fetch(t, stepper(), s.srv.URL+"/api/v1/oidc/fake/start")
	if cks := r.Cookies(); len(cks) == 0 || !cks[0].Secure {
		t.Fatal("not Secure behind an https address")
	}
}

func TestSSORefusesATokenThatIsNotRight(t *testing.T) {
	tests := []struct {
		name  string
		claim func(c map[string]any)
		idp   func(f *ssotest.Fake)
		why   string
	}{
		{"wrong issuer", func(c map[string]any) { c["iss"] = "https://evil.example" }, nil, "failed"},
		{"wrong audience", func(c map[string]any) { c["aud"] = "someone-elses-client" }, nil, "failed"},
		{"audience among others, no azp", func(c map[string]any) { c["aud"] = []string{idpClient, "other"} }, nil, "failed"},
		{"azp is another party", func(c map[string]any) { c["azp"] = "other" }, nil, "failed"},
		{"wrong nonce", func(c map[string]any) { c["nonce"] = "from-another-sign-in" }, nil, "failed"},
		{"no nonce", func(c map[string]any) { delete(c, "nonce") }, nil, "failed"},
		{"expired", func(c map[string]any) { c["exp"] = time.Date(2026, 9, 22, 11, 0, 0, 0, time.UTC).Unix() }, nil, "failed"},
		{"no subject", func(c map[string]any) { delete(c, "sub") }, nil, "failed"},
		{"email not verified", func(c map[string]any) { c["email_verified"] = false }, nil, "unverified"},
		{"email verified as the word false", func(c map[string]any) { c["email_verified"] = "false" }, nil, "unverified"},
		{"email_verified missing", func(c map[string]any) { delete(c, "email_verified") }, nil, "unverified"},
		{"no email", func(c map[string]any) { delete(c, "email") }, nil, "unverified"},
		{"not an email", func(c map[string]any) { c["email"] = "ada" }, nil, "unverified"},
		{"two addresses", func(c map[string]any) { c["email"] = "ada@example.com@evil.example" }, nil, "unverified"},
		{"signed with another key", nil, func(f *ssotest.Fake) { f.WrongKey = true }, "failed"},
		{"no ID token", nil, func(f *ssotest.Fake) { f.NoIDToken = true }, "failed"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := newSSO(t)
			s.idp.Claims = tt.claim
			if tt.idp != nil {
				tt.idp(s.idp)
			}
			c := stepper()
			s.refused(t, s.callback(t, c, ""), c, tt.why)
		})
	}
}

func TestSSOAcceptsAStringTrueAndAnyCase(t *testing.T) {
	s := newSSO(t)
	s.idp.Claims = func(c map[string]any) { c["email_verified"] = "true"; c["email"] = " Ada@Example.COM " }
	c := stepper()
	landed(t, s.callback(t, c, ""), "/")
	if !signedIn(t, s, c) {
		t.Fatal("not signed in")
	}
}

func TestSSOStateAndTheFlowCookie(t *testing.T) {
	t.Run("state that is not ours", func(t *testing.T) {
		s := newSSO(t)
		s.idp.State = "forged"
		c := stepper()
		s.refused(t, s.callback(t, c, ""), c, "failed")
		if len(s.idp.Tokens()) != 0 {
			t.Fatal("the code was exchanged although the state did not match")
		}
	})
	t.Run("no flow in progress (a code made for someone else's browser)", func(t *testing.T) {
		s := newSSO(t)
		victim := stepper()
		// The attacker walks the flow in their own browser and stops before the
		// callback; the victim is made to open that callback.
		attacker := stepper()
		r1 := fetch(t, attacker, s.srv.URL+"/api/v1/oidc/fake/start")
		r2 := fetch(t, attacker, r1.Header.Get("Location"))
		res := fetch(t, victim, r2.Header.Get("Location"))
		s.refused(t, res, victim, "failed")
		if len(s.idp.Tokens()) != 0 {
			t.Fatal("the code was exchanged in the wrong browser")
		}
	})
	t.Run("the victim has a flow of their own but the callback is the attacker's", func(t *testing.T) {
		s := newSSO(t)
		victim, attacker := stepper(), stepper()
		fetch(t, victim, s.srv.URL+"/api/v1/oidc/fake/start")
		r1 := fetch(t, attacker, s.srv.URL+"/api/v1/oidc/fake/start")
		r2 := fetch(t, attacker, r1.Header.Get("Location"))
		s.refused(t, fetch(t, victim, r2.Header.Get("Location")), victim, "failed")
	})
	t.Run("a tampered cookie", func(t *testing.T) {
		s := newSSO(t)
		c := stepper()
		r1 := fetch(t, c, s.srv.URL+"/api/v1/oidc/fake/start")
		r2 := fetch(t, c, r1.Header.Get("Location"))
		u, _ := url.Parse(s.srv.URL + "/api/v1/oidc/fake/callback")
		for _, ck := range c.Jar.Cookies(u) {
			if ck.Name == ssoCookie {
				//nolint:gosec // a cookie a test sends back changed
				c.Jar.SetCookies(u, []*http.Cookie{{Name: ssoCookie, Value: ck.Value[:20] + flip(ck.Value[20]) + ck.Value[21:], Path: "/api/v1/oidc/"}})
			}
		}
		s.refused(t, fetch(t, c, r2.Header.Get("Location")), c, "failed")
	})
	t.Run("a callback used twice", func(t *testing.T) {
		s := newSSO(t)
		c := stepper()
		r1 := fetch(t, c, s.srv.URL+"/api/v1/oidc/fake/start")
		r2 := fetch(t, c, r1.Header.Get("Location"))
		landed(t, fetch(t, c, r2.Header.Get("Location")), "/")
		other := stepper()
		s.refused(t, fetch(t, other, r2.Header.Get("Location")), other, "failed")
		// and in the same browser, after the cookie was spent
		if _, err := s.ctl.DB.Exec(`DELETE FROM auth_sessions`); err != nil {
			t.Fatal(err)
		}
		s.refused(t, fetch(t, c, r2.Header.Get("Location")), c, "failed")
	})
	t.Run("a flow that took too long", func(t *testing.T) {
		s := newSSO(t)
		c := stepper()
		r1 := fetch(t, c, s.srv.URL+"/api/v1/oidc/fake/start")
		r2 := fetch(t, c, r1.Header.Get("Location"))
		s.advance(11 * time.Minute)
		s.refused(t, fetch(t, c, r2.Header.Get("Location")), c, "failed")
	})
	t.Run("the cookie of another provider's flow", func(t *testing.T) {
		s := newSSO(t)
		c := stepper()
		r1 := fetch(t, c, s.srv.URL+"/api/v1/oidc/fake/start")
		r2 := fetch(t, c, r1.Header.Get("Location"))
		cb := strings.Replace(r2.Header.Get("Location"), "/oidc/fake/", "/oidc/other/", 1)
		if res := fetch(t, c, cb); res.StatusCode != http.StatusNotFound {
			t.Fatalf("a provider that does not exist: %d", res.StatusCode)
		}
	})
}

func TestSSOProviderSaysNo(t *testing.T) {
	s := newSSO(t)
	s.idp.Error = "access_denied"
	c := stepper()
	res := s.callback(t, c, "")
	s.refused(t, res, c, "denied")
	if strings.Contains(res.Header.Get("Location"), "secret") {
		t.Fatal("the provider's own words went into the address")
	}
}

func TestSSOIssuerInTheAnswerMustBeTheProviders(t *testing.T) {
	s := newSSO(t)
	s.idp.Iss = "https://evil.example"
	c := stepper()
	s.refused(t, s.callback(t, c, ""), c, "failed")
	if len(s.idp.Tokens()) != 0 {
		t.Fatal("the code was exchanged although the answer came from another issuer")
	}
	s = newSSO(t)
	s.idp.Iss = s.idp.URL()
	c = stepper()
	landed(t, s.callback(t, c, ""), "/")
}

func TestSSONeverLinksToSomeoneItShouldNot(t *testing.T) {
	t.Run("an address nobody here has", func(t *testing.T) {
		s := newSSO(t)
		s.idp.Claims = func(c map[string]any) { c["email"] = "stranger@example.com" }
		c := stepper()
		s.refused(t, s.callback(t, c, ""), c, "no_account")
		if n := people(t, s); n != 2 {
			t.Fatalf("%d people: someone was made", n)
		}
	})
	t.Run("an allowed domain, but sign-ups are off", func(t *testing.T) {
		s := newSSO(t, func(p *config.OIDCProvider, _ *API) { p.AllowedDomains = []string{"example.com"} })
		s.idp.Claims = func(c map[string]any) { c["email"] = "newbie@example.com" }
		c := stepper()
		s.refused(t, s.callback(t, c, ""), c, "no_account")
		if n := people(t, s); n != 2 {
			t.Fatalf("%d people: someone was made", n)
		}
	})
	t.Run("sign-ups are on, but no domain is allowed", func(t *testing.T) {
		s := newSSO(t, func(_ *config.OIDCProvider, a *API) { a.SSOSignup = true })
		s.idp.Claims = func(c map[string]any) { c["email"] = "newbie@example.com" }
		c := stepper()
		s.refused(t, s.callback(t, c, ""), c, "no_account")
	})
	t.Run("sign-ups are on, and another domain is allowed", func(t *testing.T) {
		s := newSSO(t, func(p *config.OIDCProvider, a *API) { a.SSOSignup = true; p.AllowedDomains = []string{"example.com"} })
		for _, email := range []string{"x@example.com.evil.org", "x@evilexample.com", "x@sub.example.com", "x@other.org"} {
			s.idp.Claims = func(c map[string]any) { c["email"] = email }
			c := stepper()
			s.refused(t, s.callback(t, c, ""), c, "no_account")
			s.advance(11 * time.Minute)
		}
		if n := people(t, s); n != 2 {
			t.Fatalf("%d people: someone was made", n)
		}
	})
	t.Run("an unverified address of someone who is here", func(t *testing.T) {
		s := newSSO(t)
		s.idp.Claims = func(c map[string]any) { c["email"] = "me@site.com"; c["email_verified"] = false }
		c := stepper()
		s.refused(t, s.callback(t, c, ""), c, "unverified")
	})
	t.Run("a person who was removed", func(t *testing.T) {
		s := newSSO(t)
		u, _ := s.ctl.UserByEmail(context.Background(), "ada@example.com")
		if err := s.ctl.RemoveUser(context.Background(), sqlite.DefaultAccount, u.ID); err != nil {
			t.Fatal(err)
		}
		c := stepper()
		s.refused(t, s.callback(t, c, ""), c, "no_account")
	})
}

// flip is another character of the same alphabet.
func flip(b byte) string {
	if b == 'A' {
		return "B"
	}
	return "A"
}

func people(t *testing.T, s *ssoRig) int {
	t.Helper()
	p, err := s.ctl.People(context.Background(), sqlite.DefaultAccount)
	if err != nil {
		t.Fatal(err)
	}
	return len(p)
}

func TestSSOCreatesAViewerFromAnAllowedDomainWhenSignUpsAreOn(t *testing.T) {
	s := newSSO(t, func(p *config.OIDCProvider, a *API) { a.SSOSignup = true; p.AllowedDomains = []string{"example.com"} })
	s.idp.Claims = func(c map[string]any) { c["email"] = "New.Hire@Example.com" }
	c := stepper()
	landed(t, s.callback(t, c, ""), "/")
	code, out := do(t, c, "GET", s.srv.URL+"/api/v1/me", "")
	if code != 200 || out["email"] != "new.hire@example.com" || out["role"] != "viewer" {
		t.Fatalf("me: %d %v", code, out)
	}
	if n := people(t, s); n != 3 {
		t.Fatalf("%d people", n)
	}
	// A viewer reads and changes nothing else, and nobody can use a password for them.
	if code, _ := do(t, c, "POST", s.srv.URL+"/api/v1/sites", `{"domain":"x.com"}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("a created person may write: %d", code)
	}
	if code, _ := do(t, client(), "POST", s.srv.URL+"/api/v1/login", `{"email":"new.hire@example.com","password":""}`); code == http.StatusOK {
		t.Fatal("a password signs in the person made from a provider")
	}
	// Signing in again finds them.
	s.advance(11 * time.Minute)
	landed(t, s.callback(t, stepper(), ""), "/")
	if n := people(t, s); n != 3 {
		t.Fatalf("%d people after a second sign-in", n)
	}
}

// An owner adds people in Settings; that is the invitation here. The person
// signs in with the provider and never needs the one-time password.
func TestSSOAcceptsSomeoneAnOwnerAdded(t *testing.T) {
	s := newSSO(t)
	owner := client()
	do(t, owner, "POST", s.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery"}`)
	if code, out := do(t, owner, "POST", s.srv.URL+"/api/v1/people", `{"email":"grace@example.com","role":"viewer"}`, csrf, "1"); code != http.StatusCreated {
		t.Fatalf("add: %d %v", code, out)
	}
	s.idp.Claims = func(c map[string]any) { c["email"] = "grace@example.com" }
	c := stepper()
	landed(t, s.callback(t, c, ""), "/")
	if code, out := do(t, c, "GET", s.srv.URL+"/api/v1/me", ""); code != 200 || out["email"] != "grace@example.com" {
		t.Fatalf("me: %d %v", code, out)
	}
	// Not held back to "choose your own password first": there is no
	// password to change from.
	if code, out := do(t, c, "GET", s.srv.URL+"/api/v1/sites", ""); code != 200 {
		t.Fatalf("the person is held at the first-password screen: %d %v", code, out)
	}
}

func TestSSORetiresTheOneTimePassword(t *testing.T) {
	s := newSSO(t)
	owner := client()
	do(t, owner, "POST", s.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery"}`)
	_, out := do(t, owner, "POST", s.srv.URL+"/api/v1/people", `{"email":"grace@example.com","role":"viewer"}`, csrf, "1")
	oneTime, _ := out["password"].(string)
	if oneTime == "" {
		t.Fatalf("no one-time password: %v", out)
	}
	// Someone who saw it signs in with it: held at the first-password step.
	thief := client()
	if code, _ := do(t, thief, "POST", s.srv.URL+"/api/v1/login", `{"email":"grace@example.com","password":"`+oneTime+`"}`); code != 200 {
		t.Fatal("the one-time password does not sign in before the person arrives")
	}
	s.idp.Claims = func(c map[string]any) { c["email"] = "grace@example.com" }
	c := stepper()
	landed(t, s.callback(t, c, ""), "/")
	if code, _ := do(t, thief, "GET", s.srv.URL+"/api/v1/me", ""); code != http.StatusUnauthorized {
		t.Fatalf("a session opened with the one-time password survived: %d", code)
	}
	if code, _ := do(t, client(), "POST", s.srv.URL+"/api/v1/login", `{"email":"grace@example.com","password":"`+oneTime+`"}`); code == 200 {
		t.Fatal("the one-time password still signs in")
	}
}

func TestSSOReturnToIsAPathOnThisSiteOnly(t *testing.T) {
	bad := []string{
		"//evil.example", "///evil.example", "/\\evil.example", "\\\\evil.example", "https://evil.example", "http://evil.example/x",
		"javascript:alert(1)", "evil.example", "evil.example/x", "/\t/evil.example", "/\n/evil.example", "/\r/evil.example",
		"/a\\b", "/%0d%0aSet-Cookie:x=1", "/\x00", "data:text/html,x", "//", "/" + strings.Repeat("a", 600),
	}
	s := newSSO(t)
	for _, to := range bad {
		c := stepper()
		res := s.callback(t, c, to)
		got := res.Header.Get("Location")
		// A header with a break in it would have been refused by the server
		// already; what matters is that none of these leaves the site.
		if got != "/" && (!strings.HasPrefix(got, "/%0d") || to != "/%0d%0aSet-Cookie:x=1") {
			t.Errorf("return_to %q sent the browser to %q", to, got)
		}
		s.advance(11 * time.Minute)
	}
	for _, to := range []string{"/", "/site.com", "/site.com?range=7d&x=//y", "/all", "/a/b/c#d", "/x?next=https://evil.example"} {
		c := stepper()
		landed(t, s.callback(t, c, to), to)
		s.advance(11 * time.Minute)
	}
}

func TestSafeReturn(t *testing.T) {
	for in, want := range map[string]string{
		"": "/", "/": "/", "/x": "/x", "//x": "/", "/\\x": "/", "x": "/", "https://x": "/", "/a b": "/a b", "/a?b=c": "/a?b=c", "/x\ty": "/", "/x\u0085y": "/x\u0085y",
	} {
		if got := safeReturn(in); got != want {
			t.Errorf("safeReturn(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSSOTwoStep(t *testing.T) {
	enableFor := func(t *testing.T, s *ssoRig, email, pw string) (secret string) {
		t.Helper()
		c := client()
		do(t, c, "POST", s.srv.URL+"/api/v1/login", `{"email":"`+email+`","password":"`+pw+`"}`)
		_, out := do(t, c, "POST", s.srv.URL+"/api/v1/account/2fa/start", `{"password":"`+pw+`"}`, csrf, "1")
		secret = out["secret"].(string)
		code, _ := auth.TOTPCode(secret, s.now)
		if st, out := do(t, c, "POST", s.srv.URL+"/api/v1/account/2fa/enable", `{"password":"`+pw+`","code":"`+code+`"}`, csrf, "1"); st != 200 {
			t.Fatalf("enable: %d %v", st, out)
		}
		return secret
	}
	enable := func(t *testing.T, s *ssoRig) string { return enableFor(t, s, "me@site.com", "correct horse battery") }
	asOwner := func(s *ssoRig) { s.idp.Claims = func(c map[string]any) { c["email"] = "me@site.com" } }

	t.Run("an owner with two-step is asked for the code even with the setting off", func(t *testing.T) {
		s := newSSO(t, func(_ *config.OIDCProvider, a *API) { a.SSORequireTOTP = false })
		enable(t, s)
		asOwner(s)
		c := stepper()
		landed(t, s.callback(t, c, ""), "/login?sso=code")
		if signedIn(t, s, c) {
			t.Fatal("an owner with two-step got a session from the provider alone")
		}
	})
	t.Run("someone else with two-step goes straight in when the setting is off", func(t *testing.T) {
		s := newSSO(t, func(_ *config.OIDCProvider, a *API) { a.SSORequireTOTP = false })
		enableFor(t, s, "ada@example.com", "a password nobody types")
		c := stepper()
		landed(t, s.callback(t, c, ""), "/")
		if !signedIn(t, s, c) {
			t.Fatal("not signed in")
		}
	})
	t.Run("someone else with two-step is asked when the setting is on", func(t *testing.T) {
		s := newSSO(t, func(_ *config.OIDCProvider, a *API) { a.SSORequireTOTP = true })
		enableFor(t, s, "ada@example.com", "a password nobody types")
		c := stepper()
		landed(t, s.callback(t, c, ""), "/login?sso=code")
	})
	t.Run("with the setting on, the code is asked for", func(t *testing.T) {
		s := newSSO(t, func(_ *config.OIDCProvider, a *API) { a.SSORequireTOTP = true })
		secret := enable(t, s)
		asOwner(s)
		c := stepper()
		res := s.callback(t, c, "/all")
		landed(t, res, "/login?sso=code")
		if signedIn(t, s, c) {
			t.Fatal("a session before the code")
		}
		for _, ck := range res.Cookies() {
			if ck.Name == sessionCookie && ck.Value != "" {
				t.Fatal("a session cookie before the code")
			}
		}
		post := func(c *http.Client, body string) (int, map[string]any) {
			return do(t, c, "POST", s.srv.URL+"/api/v1/oidc/code", body, csrf, "1")
		}
		if code, out := post(c, `{"code":"000000"}`); code != http.StatusUnauthorized || out["needs_code"] != true {
			t.Fatalf("a wrong code: %d %v", code, out)
		}
		if code, _ := post(c, `{}`); code != http.StatusUnauthorized {
			t.Fatalf("no code: %d", code)
		}
		if code, _ := post(stepper(), `{"code":"000000"}`); code != http.StatusUnauthorized {
			t.Fatalf("a code with no sign-in behind it: %d", code)
		}
		s.advance(61 * time.Second) // the step that turned two-step on is spent
		code, _ := auth.TOTPCode(secret, s.api.Now())
		st, out := post(c, `{"code":"`+code+`"}`)
		if st != 200 || out["return_to"] != "/all" {
			t.Fatalf("the right code: %d %v", st, out)
		}
		if !signedIn(t, s, c) {
			t.Fatal("not signed in after the code")
		}
		// The same step does not sign in twice, and the pending sign-in is spent.
		if st, _ := post(c, `{"code":"`+code+`"}`); st != http.StatusUnauthorized {
			t.Fatalf("the code again: %d", st)
		}
	})
	t.Run("an owner without two-step goes straight in", func(t *testing.T) {
		s := newSSO(t, func(_ *config.OIDCProvider, a *API) { a.SSORequireTOTP = true })
		asOwner(s)
		c := stepper()
		landed(t, s.callback(t, c, ""), "/")
	})
	t.Run("someone without two-step goes straight in", func(t *testing.T) {
		s := newSSO(t, func(_ *config.OIDCProvider, a *API) { a.SSORequireTOTP = true })
		c := stepper()
		landed(t, s.callback(t, c, ""), "/")
	})
	t.Run("the code step is limited", func(t *testing.T) {
		s := newSSO(t, func(_ *config.OIDCProvider, a *API) { a.SSORequireTOTP = true })
		enable(t, s)
		asOwner(s)
		c := stepper()
		landed(t, s.callback(t, c, ""), "/login?sso=code")
		var last int
		for i := 0; i < 11; i++ {
			last, _ = do(t, c, "POST", s.srv.URL+"/api/v1/oidc/code", `{"code":"000000"}`, csrf, "1")
		}
		if last != http.StatusTooManyRequests {
			t.Fatalf("the 11th wrong code: %d", last)
		}
	})
	t.Run("the code step wants JSON", func(t *testing.T) {
		s := newSSO(t, func(_ *config.OIDCProvider, a *API) { a.SSORequireTOTP = true })
		req, _ := http.NewRequest("POST", s.srv.URL+"/api/v1/oidc/code", strings.NewReader("code=1"))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusUnsupportedMediaType {
			t.Fatalf("a form post: %d", res.StatusCode)
		}
	})
}

func TestSSOIsListedOnlyWhenItCanWork(t *testing.T) {
	s := newSSO(t)
	list := func() any { _, out := do(t, client(), "GET", s.srv.URL+"/api/v1/setup", ""); return out["sso"] }
	if got := fmt.Sprint(list()); got != "[map[id:fake label:Fake]]" {
		t.Fatalf("listed: %s", got)
	}
	s.api.BaseURL = ""
	if got := fmt.Sprint(list()); got != "[]" {
		t.Fatalf("listed without an address of our own: %s", got)
	}
	if res := fetch(t, stepper(), s.srv.URL+"/api/v1/oidc/fake/start"); res.StatusCode != http.StatusNotFound {
		t.Fatalf("start without an address of our own: %d", res.StatusCode)
	}
	s.api.BaseURL = s.srv.URL
	s.api.SSO = nil
	if got := fmt.Sprint(list()); got != "[]" {
		t.Fatalf("listed with no providers: %s", got)
	}
	if res := fetch(t, stepper(), s.srv.URL+"/api/v1/oidc/fake/start"); res.StatusCode != http.StatusNotFound {
		t.Fatalf("start of a provider that is not there: %d", res.StatusCode)
	}
}

// Only a callback that fails is counted: people who sign in right never use
// up an address's tries, and failures are held to their own limit.
func TestSSOOnlyFailedCallbacksAreCounted(t *testing.T) {
	s := newSSO(t)
	s.fromAddress("198.51.100.8")
	for i := 0; i < 25; i++ {
		landed(t, s.callback(t, stepper(), ""), "/")
	}
	s.idp.State = "forged"
	for i := 0; i < 20; i++ {
		s.refused(t, s.callback(t, stepper(), ""), stepper(), "failed")
	}
	s.idp.State = ""
	c := stepper()
	res := s.callback(t, c, "")
	if res.Header.Get("Location") != "/login?sso_error=slow" {
		t.Fatalf("the 21st failure is not held back: %q", res.Header.Get("Location"))
	}
	s.advance(11 * time.Minute)
	landed(t, s.callback(t, stepper(), ""), "/")
}

func TestSSOStartIsRateLimited(t *testing.T) {
	s := newSSO(t)
	s.fromAddress("198.51.100.7")
	var last hop
	for i := 0; i < 120; i++ {
		last = fetch(t, stepper(), s.srv.URL+"/api/v1/oidc/fake/start")
		if last.Header.Get("Location") == "/login?sso_error=slow" {
			t.Fatalf("start %d was limited: a person signing in is not a flood", i+1)
		}
	}
	last = fetch(t, stepper(), s.srv.URL+"/api/v1/oidc/fake/start")
	if last.Header.Get("Location") != "/login?sso_error=slow" {
		t.Fatalf("the 121st start: %d %q", last.StatusCode, last.Header.Get("Location"))
	}
}

// logs captures what the server logs while fn runs.
type logBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *logBuf) Write(p []byte) (int, error) { l.mu.Lock(); defer l.mu.Unlock(); return l.b.Write(p) }
func (l *logBuf) String() string              { l.mu.Lock(); defer l.mu.Unlock(); return l.b.String() }

func TestSSOSecretsAreNeverLogged(t *testing.T) {
	var lb logBuf
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&lb, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(old) })

	s := newSSO(t)
	// A success, and the failures that carry most text: the provider refusing
	// the exchange (its answer echoes the code and the client secret), a token
	// for another issuer, and a provider that is down.
	var spent []string
	c := stepper()
	landed(t, s.callback(t, c, ""), "/")
	s.advance(11 * time.Minute)

	s.idp.Claims = func(c map[string]any) { c["iss"] = "https://evil.example" }
	c = stepper()
	s.refused(t, s.callback(t, c, ""), c, "failed")
	s.idp.Claims = nil
	s.advance(11 * time.Minute)

	// The exchange refused: the secret the provider holds is not ours.
	s.idp.ClientSecret = "something-else"
	c = stepper()
	s.refused(t, s.callback(t, c, ""), c, "failed")
	s.idp.ClientSecret = idpSecret
	s.advance(11 * time.Minute)

	// A provider that is down: nothing to discover.
	down := newSSO(t)
	down.idp.Server.Close()
	c = stepper()
	if res := fetch(t, c, down.srv.URL+"/api/v1/oidc/fake/start"); res.Header.Get("Location") != "/login?sso_error=failed" {
		t.Fatalf("a provider that is down: %d %q", res.StatusCode, res.Header.Get("Location"))
	}

	for _, tk := range s.idp.Tokens() {
		spent = append(spent, tk.Code, tk.Verifier)
	}
	spent = append(spent, idpSecret, "something-else")
	out := lb.String()
	if !strings.Contains(out, "signed in with fake") || !strings.Contains(out, "user=usr_") {
		t.Fatalf("the sign-in is not recorded:\n%s", out)
	}
	if strings.Contains(out, "ada@example.com") {
		t.Fatalf("an address is in the log:\n%s", out)
	}
	for _, secret := range spent {
		if secret != "" && strings.Contains(out, secret) {
			t.Fatalf("a secret is in the log: %q\n%s", secret, out)
		}
	}
	for _, word := range []string{"id_token", "eyJ", "access_token"} {
		if strings.Contains(out, word) {
			t.Fatalf("%q is in the log:\n%s", word, out)
		}
	}
}

func google(p *config.OIDCProvider, _ *API) { p.Kind = config.KindGoogle }

// Any Google account may put any address in its email claim and have Google
// say it is verified, as long as the domain is not one Google is the
// authority for and the account is not a member of that domain's Workspace.
func TestSSOGoogleVouchesOnlyForItsOwnDomainsAndWorkspaces(t *testing.T) {
	for name, tt := range map[string]struct {
		email, hd string
		ok        bool
	}{
		"an owner's address on another domain, no hd":  {"me@site.com", "", false},
		"the same, with a Workspace of another domain": {"me@site.com", "evil.example", false},
		"the address's own Workspace":                  {"ada@example.com", "example.com", true},
		"the Workspace in another case":                {"ada@example.com", "Example.COM", true},
		"a gmail address without hd":                   {"someone@gmail.com", "", true},
		"a googlemail address":                         {"someone@googlemail.com", "", true},
		"a lookalike of gmail":                         {"someone@gmail.com.evil.example", "", false},
		"a subdomain of gmail":                         {"someone@mail.gmail.com", "", false},
		"no hd on a company address":                   {"ada@example.com", "", false},
	} {
		t.Run(name, func(t *testing.T) {
			s := newSSO(t, google)
			if _, err := s.ctl.AddUser(context.Background(), sqlite.DefaultAccount, "someone@gmail.com", "a password nobody types", sqlite.RoleViewer); err != nil {
				t.Fatal(err)
			}
			if _, err := s.ctl.AddUser(context.Background(), sqlite.DefaultAccount, "someone@googlemail.com", "a password nobody types", sqlite.RoleViewer); err != nil {
				t.Fatal(err)
			}
			s.idp.Claims = func(c map[string]any) {
				c["email"] = tt.email
				if tt.hd != "" {
					c["hd"] = tt.hd
				}
			}
			c := stepper()
			res := s.callback(t, c, "")
			if !tt.ok {
				s.refused(t, res, c, "unverified")
				return
			}
			landed(t, res, "/")
		})
	}
}

func TestSSOIsClosedUntilSetup(t *testing.T) {
	s := newSSOBare(t)
	list := func() string {
		_, out := do(t, client(), "GET", s.srv.URL+"/api/v1/setup", "")
		return fmt.Sprint(out["sso"])
	}
	if got := list(); got != "[]" {
		t.Fatalf("listed before the owner exists: %s", got)
	}
	if res := fetch(t, stepper(), s.srv.URL+"/api/v1/oidc/fake/start"); res.StatusCode != http.StatusNotFound {
		t.Fatalf("start before the owner exists: %d", res.StatusCode)
	}
	if code, _ := do(t, client(), "POST", s.srv.URL+"/api/v1/oidc/code", `{"code":"123456"}`, csrf, "1"); code != http.StatusNotFound {
		t.Fatalf("the code step before the owner exists: %d", code)
	}
	if res := fetch(t, stepper(), s.srv.URL+"/api/v1/oidc/fake/callback?code=x&state=y"); res.Header.Get("Location") != "/login?sso_error=failed" {
		t.Fatalf("a callback before the owner exists: %q", res.Header.Get("Location"))
	}
	s.setup(t, client())
	if got := list(); got != "[map[id:fake label:Fake]]" {
		t.Fatalf("listed after setup: %s", got)
	}
	// A flow begun after setup, then everyone gone: the callback refuses too.
	c := stepper()
	r1 := fetch(t, c, s.srv.URL+"/api/v1/oidc/fake/start")
	r2 := fetch(t, c, r1.Header.Get("Location"))
	if _, err := s.ctl.DB.Exec(`DELETE FROM users`); err != nil {
		t.Fatal(err)
	}
	s.refused(t, fetch(t, c, r2.Header.Get("Location")), c, "failed")
}

// The first sign-in links the provider's id for the person; the same address
// with another id (an account deleted and made again at the provider, a domain
// that changed hands) is no longer them.
func TestSSOKeepsTheSameProviderIdForAPerson(t *testing.T) {
	var lb logBuf
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&lb, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(old) })

	s := newSSO(t)
	landed(t, s.callback(t, stepper(), ""), "/") // links subject-1
	s.advance(11 * time.Minute)
	landed(t, s.callback(t, stepper(), ""), "/") // the same id again

	s.idp.Claims = func(c map[string]any) { c["sub"] = "subject-2" }
	c := stepper()
	s.refused(t, s.callback(t, c, ""), c, "failed")
	out := lb.String()
	if !strings.Contains(out, "not the one linked") || !strings.Contains(out, "user=usr_") || strings.Contains(out, "ada@example.com") {
		t.Fatalf("the refusal is not logged by user id only:\n%s", out)
	}

	// An id that is someone else's here is not a second person's either.
	s.advance(11 * time.Minute)
	s.idp.Claims = func(c map[string]any) { c["email"] = "me@site.com"; c["sub"] = "subject-1" }
	c = stepper()
	s.refused(t, s.callback(t, c, ""), c, "failed")
}

func TestSSORefusalLogsTheDomainNotTheAddress(t *testing.T) {
	var lb logBuf
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&lb, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(old) })
	s := newSSO(t)
	s.idp.Claims = func(c map[string]any) { c["email"] = "stranger@example.com" }
	c := stepper()
	s.refused(t, s.callback(t, c, ""), c, "no_account")
	out := lb.String()
	if !strings.Contains(out, "domain=example.com") || strings.Contains(out, "stranger") {
		t.Fatalf("the log:\n%s", out)
	}
}

// A browser that signs in with a provider is remembered like one that signs in
// with a password, so a guessing flood on the account cannot lock it out.
func TestSSORemembersTheBrowser(t *testing.T) {
	s := newSSO(t)
	res := s.callback(t, stepper(), "")
	landed(t, res, "/")
	var got bool
	for _, ck := range res.Cookies() {
		if ck.Name == deviceCookie && ck.Value != "" && ck.HttpOnly {
			got = true
		}
	}
	if !got {
		t.Fatal("no device cookie after signing in with a provider")
	}
}
