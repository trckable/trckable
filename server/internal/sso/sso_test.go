package sso_test

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/sso"
	"github.com/trckable/trckable/server/internal/sso/ssotest"
)

var now = time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC)

const (
	tenantA  = "11111111-1111-1111-1111-111111111111"
	tenantB  = "22222222-2222-2222-2222-222222222222"
	personal = "9188040d-6c67-4c5b-b112-36a304b66dad"
	redirect = "http://app.example/api/v1/oidc/ms/callback"
)

// walk does what a browser does between start and callback: the authorize
// request, with a verifier whose challenge it carries, and the code back.
func walk(t *testing.T, p *sso.Provider, f *ssotest.Fake) (sso.Identity, error) {
	t.Helper()
	verifier, nonce := "a-verifier-of-enough-length-1234567890abcdefghijk", "nonce-1"
	sum := sha256.Sum256([]byte(verifier))
	to, err := p.AuthURL(redirect, "state-1", nonce, verifier)
	if err != nil {
		return sso.Identity{}, err
	}
	u, _ := url.Parse(to)
	if u.Query().Get("code_challenge") != base64.RawURLEncoding.EncodeToString(sum[:]) || u.Query().Get("code_challenge_method") != "S256" {
		t.Fatalf("the authorize address has no PKCE challenge: %s", to)
	}
	c := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, err := c.Get(to)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	back, _ := url.Parse(res.Header.Get("Location"))
	return p.Exchange(context.Background(), redirect, back.Query().Get("code"), verifier, nonce)
}

// with changes the claims f signs on top of what it signed already.
func with(f *ssotest.Fake, change func(c map[string]any)) {
	base := f.Claims
	f.Claims = func(c map[string]any) { base(c); change(c) }
}

func entra(t *testing.T, tenant string, allowed ...string) (*sso.Provider, *ssotest.Fake) {
	t.Helper()
	f := ssotest.New(t, "ms-client", "ms-secret", func() time.Time { return now })
	cfg := config.OIDCProvider{Name: "ms", Kind: config.KindEntra, Issuer: f.URL(), ClientID: "ms-client", ClientSecret: "ms-secret", Tenant: tenant, AllowedTenants: allowed}
	if len(allowed) == 0 {
		cfg.AllowedTenants = []string{tenant}
	}
	f.Claims = func(c map[string]any) {
		c["tid"] = tenantA
		c["iss"] = f.URL() + "/" + tenantA + "/v2.0"
		delete(c, "email_verified") // Entra sends no such claim
		c["xms_edov"] = true        // the optional claim the app registration asks for
	}
	return sso.NewRegistry([]config.OIDCProvider{cfg}, nil, func() time.Time { return now }).Get("ms"), f
}

func TestEntraOneDirectory(t *testing.T) {
	p, f := entra(t, tenantA)
	f.DiscoveryIssuer = "" // the discovery document names the directory's own issuer
	id, err := walk(t, p, f)
	if err != nil || id.Email != "ada@example.com" || id.Tenant != tenantA {
		t.Fatalf("a person of the directory: %+v %v", id, err)
	}
}

func TestEntraRefusesAnotherDirectory(t *testing.T) {
	// Single directory: a token of another directory, even one that is
	// internally consistent, is not the issuer the provider was set up with.
	p, f := entra(t, tenantA)
	with(f, func(c map[string]any) {
		c["tid"] = tenantB
		c["iss"] = f.URL() + "/" + tenantB + "/v2.0"
	})
	if _, err := walk(t, p, f); err == nil {
		t.Fatal("a person of another directory signed in")
	}
	// A directory id that does not match the issuer.
	p, f = entra(t, tenantA)
	with(f, func(c map[string]any) { c["tid"] = tenantB; c["iss"] = f.URL() + "/" + tenantA + "/v2.0" })
	if _, err := walk(t, p, f); !errors.Is(err, sso.ErrUnverified) {
		t.Fatalf("tid of another directory under the right issuer: %v", err)
	}
}

func TestEntraManyDirectoriesOnlyTheAllowedOnes(t *testing.T) {
	setup := func(t *testing.T, tenant string) (*sso.Provider, *ssotest.Fake) {
		p, f := entra(t, tenant, tenantA)
		// What Entra's address for every directory answers: an issuer with a
		// placeholder, which is no directory's own.
		f.DiscoveryIssuer = "https://login.example/{tenantid}/v2.0"
		return p, f
	}
	for _, tenant := range []string{"organizations", "common"} {
		t.Run(tenant+" with an allowed directory", func(t *testing.T) {
			p, f := setup(t, tenant)
			if id, err := walk(t, p, f); err != nil || id.Tenant != tenantA {
				t.Fatalf("%+v %v", id, err)
			}
		})
		t.Run(tenant+" with a directory that is not allowed", func(t *testing.T) {
			p, f := setup(t, tenant)
			with(f, func(c map[string]any) {
				c["tid"] = tenantB
				c["iss"] = f.URL() + "/" + tenantB + "/v2.0"
			})
			if _, err := walk(t, p, f); !errors.Is(err, sso.ErrUnverified) {
				t.Fatalf("a directory nobody allowed: %v", err)
			}
		})
		t.Run(tenant+" with an issuer that is not the directory's", func(t *testing.T) {
			p, f := setup(t, tenant)
			with(f, func(c map[string]any) { c["iss"] = "https://evil.example/" + tenantA + "/v2.0" })
			if _, err := walk(t, p, f); err == nil || errors.Is(err, sso.ErrUnverified) {
				t.Fatalf("an issuer that names an allowed directory but is not Microsoft's: %v", err)
			}
		})
		t.Run(tenant+" with no directory in the token", func(t *testing.T) {
			p, f := setup(t, tenant)
			with(f, func(c map[string]any) { delete(c, "tid"); c["iss"] = f.URL() + "//v2.0" })
			if _, err := walk(t, p, f); err == nil {
				t.Fatal("a token with no tid signed in")
			}
		})
		t.Run(tenant+" the personal accounts directory", func(t *testing.T) {
			p, f := setup(t, tenant)
			with(f, func(c map[string]any) {
				c["tid"] = personal
				c["iss"] = f.URL() + "/" + personal + "/v2.0"
			})
			if _, err := walk(t, p, f); !errors.Is(err, sso.ErrUnverified) {
				t.Fatalf("a personal account: %v", err)
			}
		})
	}
}

func TestEntraAddress(t *testing.T) {
	for name, tt := range map[string]struct {
		claims func(c map[string]any)
		email  string
		ok     bool
	}{
		"the email claim":                {func(c map[string]any) { c["email"] = "Ada@Corp.com" }, "ada@corp.com", true},
		"the sign-in name without email": {func(c map[string]any) { delete(c, "email"); c["preferred_username"] = "ada@corp.com" }, "ada@corp.com", true},
		"a guest's sign-in name": {func(c map[string]any) {
			delete(c, "email")
			c["preferred_username"] = "ada_x.com#EXT#@corp.onmicrosoft.com"
		}, "", false},
		"a sign-in name that is no email": {func(c map[string]any) { delete(c, "email"); c["preferred_username"] = "ada" }, "", false},
		"nothing":                         {func(c map[string]any) { delete(c, "email") }, "", false},
		"said not verified":               {func(c map[string]any) { c["email_verified"] = false }, "", false},
	} {
		t.Run(name, func(t *testing.T) {
			p, f := entra(t, tenantA)
			with(f, tt.claims)
			id, err := walk(t, p, f)
			if tt.ok != (err == nil) || id.Email != tt.email {
				t.Fatalf("%+v %v", id, err)
			}
		})
	}
}

// nOAuth: in a directory (or a multi-tenant sign-up) the email claim can be
// set to an address its holder does not own. Entra's own word that the
// domain is verified, or the operator's list of domains, is what counts.
func TestEntraAddressNeedsTheDomainToBeVerified(t *testing.T) {
	for name, tt := range map[string]struct {
		domains []string
		claims  func(c map[string]any)
		ok      bool
	}{
		"xms_edov true":                          {nil, func(c map[string]any) {}, true},
		"xms_edov as a string":                   {nil, func(c map[string]any) { c["xms_edov"] = "1" }, true},
		"xms_edov false":                         {nil, func(c map[string]any) { c["xms_edov"] = false }, false},
		"xms_edov false, domain listed":          {[]string{"example.com"}, func(c map[string]any) { c["xms_edov"] = false }, false},
		"no claim, no list":                      {nil, func(c map[string]any) { delete(c, "xms_edov") }, false},
		"no claim, the domain is listed":         {[]string{"example.com"}, func(c map[string]any) { delete(c, "xms_edov") }, true},
		"no claim, another domain is listed":     {[]string{"corp.example"}, func(c map[string]any) { delete(c, "xms_edov") }, false},
		"no claim, a parent domain is listed":    {[]string{"com"}, func(c map[string]any) { delete(c, "xms_edov") }, false},
		"a guest (acct 1)":                       {nil, func(c map[string]any) { c["acct"] = 1 }, false},
		"a guest (acct as a string)":             {nil, func(c map[string]any) { c["acct"] = "1" }, false},
		"a member (acct 0)":                      {nil, func(c map[string]any) { c["acct"] = 0 }, true},
		"signed in by another identity provider": {nil, func(c map[string]any) { c["idp"] = "https://sts.windows.net/" + tenantB + "/" }, false},
		"idp the directory itself":               {nil, func(c map[string]any) { c["idp"] = c["iss"] }, true},
	} {
		t.Run(name, func(t *testing.T) {
			p, f := entra(t, tenantA)
			p.Cfg.AllowedDomains = tt.domains
			with(f, tt.claims)
			id, err := walk(t, p, f)
			if tt.ok != (err == nil) || (!tt.ok && !errors.Is(err, sso.ErrUnverified)) {
				t.Fatalf("%+v %v", id, err)
			}
		})
	}
}

// Many directories: only Entra's own word for the domain counts. A list of
// domains cannot say which of the directories may hold an address on one.
func TestEntraManyDirectoriesNeedTheDomainClaim(t *testing.T) {
	for _, tenant := range []string{"organizations", "common"} {
		for name, ok := range map[string]bool{"xms_edov true": true, "no claim, domain listed": false, "xms_edov false": false} {
			t.Run(tenant+" "+name, func(t *testing.T) {
				p, f := entra(t, tenant, tenantA)
				p.Cfg.AllowedDomains = []string{"example.com"}
				f.DiscoveryIssuer = "https://login.example/{tenantid}/v2.0"
				switch name {
				case "no claim, domain listed":
					with(f, func(c map[string]any) { delete(c, "xms_edov") })
				case "xms_edov false":
					with(f, func(c map[string]any) { c["xms_edov"] = false })
				}
				id, err := walk(t, p, f)
				if ok != (err == nil) || (!ok && !errors.Is(err, sso.ErrUnverified)) {
					t.Fatalf("%+v %v", id, err)
				}
			})
		}
	}
}

func TestPKCEIsNeeded(t *testing.T) {
	// The provider itself checks the verifier against the challenge; a wrong
	// one is refused there, and so is none.
	p, f := entra(t, tenantA)
	to, err := p.AuthURL(redirect, "s", "n", "the-real-verifier-0123456789012345678901234567890")
	if err != nil {
		t.Fatal(err)
	}
	c := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, _ := c.Get(to)
	res.Body.Close()
	back, _ := url.Parse(res.Header.Get("Location"))
	if _, err := p.Exchange(context.Background(), redirect, back.Query().Get("code"), "another-verifier-0123456789012345678901234567890", "n"); err == nil {
		t.Fatal("a code was exchanged with a verifier it was not made for")
	}
	if len(f.Tokens()) == 0 { // the library may try the secret in the header, then in the body
		t.Fatal("the exchange was not attempted")
	}
	if _, err := p.Exchange(context.Background(), redirect, "x", "", "n"); err == nil {
		t.Fatal("an exchange with no verifier")
	}
}
