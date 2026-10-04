// Package sso is signing in with an identity provider (Google, Microsoft
// Entra, or any OpenID Connect provider): the authorization-code flow with
// PKCE, and the checks on what comes back. The token handling is the
// libraries' (go-oidc and x/oauth2); what is written here is which of the
// provider's claims may be trusted as an email address, and for whom.
package sso

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/trckable/trckable/server/internal/config"
)

// Refusals the caller tells apart. Anything else is a failure of the flow.
var (
	// ErrUnverified: the provider did not vouch for an email address, or for
	// the directory the person belongs to.
	ErrUnverified = errors.New("the provider did not verify an email address for this person")
)

// Identity is who a provider says signed in, after every check.
type Identity struct {
	Issuer  string // who issued the token: with Subject, who this person is to the provider
	Subject string // the provider's id for the person
	Email   string // lower case, verified (see Provider.identity)
	Tenant  string // Entra: the directory the person belongs to
}

// Provider is one configured identity provider. It discovers its endpoints
// the first time it is used, and again after a failure.
type Provider struct {
	Cfg config.OIDCProvider
	// HTTP reaches the provider; nil is a client with a timeout.
	HTTP *http.Client
	// Now is the clock a token's expiry is read against; nil is the real one.
	Now func() time.Time

	mu sync.Mutex
	d  *discovered
}

type discovered struct {
	endpoint oauth2.Endpoint
	verifier *oidc.IDTokenVerifier
}

// Registry is the providers this instance offers, in a stable order.
type Registry struct {
	list []*Provider
	by   map[string]*Provider
}

// NewRegistry makes a Provider of each configuration.
func NewRegistry(cfgs []config.OIDCProvider, httpc *http.Client, now func() time.Time) *Registry {
	r := &Registry{by: map[string]*Provider{}}
	for _, c := range cfgs {
		p := &Provider{Cfg: c, HTTP: httpc, Now: now}
		r.list = append(r.list, p)
		r.by[c.Name] = p
	}
	return r
}

// List is every provider, for the sign-in screen.
func (r *Registry) List() []*Provider {
	if r == nil {
		return nil
	}
	return r.list
}

// Get is the provider with this name, or nil.
func (r *Registry) Get(name string) *Provider {
	if r == nil {
		return nil
	}
	return r.by[name]
}

func (p *Provider) client() *http.Client {
	if p.HTTP != nil {
		return p.HTTP
	}
	return &http.Client{Timeout: 10 * time.Second}
}

func (p *Provider) now() time.Time {
	if p.Now != nil {
		return p.Now()
	}
	return time.Now()
}

// Issuer is the address tokens are issued under: the configured one, or for a
// single Entra directory the one that directory has.
func (p *Provider) Issuer() string {
	if p.Cfg.Kind == config.KindEntra {
		return p.Cfg.Issuer + "/" + p.Cfg.Tenant + "/v2.0"
	}
	return p.Cfg.Issuer
}

func (p *Provider) discover() (*discovered, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.d != nil {
		return p.d, nil
	}
	// A long-lived context: the provider keeps it to fetch signing keys
	// later. Only the client is in it; each request has the client's timeout.
	ctx := oidc.ClientContext(context.Background(), p.client())
	multi := p.Cfg.MultiTenant()
	if multi {
		// Entra's address for every directory at once names no directory in
		// its discovery document. The issuer is checked in identity instead,
		// against the directory id in the token, which must be one allowed.
		ctx = oidc.InsecureIssuerURLContext(ctx, p.Issuer())
	}
	prov, err := oidc.NewProvider(ctx, p.Issuer())
	if err != nil {
		return nil, fmt.Errorf("discovering %s: %w", p.Cfg.Name, err)
	}
	p.d = &discovered{
		endpoint: prov.Endpoint(),
		verifier: prov.Verifier(&oidc.Config{ClientID: p.Cfg.ClientID, Now: p.now, SkipIssuerCheck: multi}),
	}
	return p.d, nil
}

func (p *Provider) oauth(d *discovered, redirect string) *oauth2.Config {
	return &oauth2.Config{
		ClientID: p.Cfg.ClientID, ClientSecret: p.Cfg.ClientSecret, Endpoint: d.endpoint,
		RedirectURL: redirect, Scopes: []string{oidc.ScopeOpenID, "email", "profile"},
	}
}

// AuthURL is where to send the person: the provider's sign-in page, with a
// PKCE challenge made from verifier, and state and nonce to be checked on the
// way back.
func (p *Provider) AuthURL(redirect, state, nonce, verifier string) (string, error) {
	d, err := p.discover()
	if err != nil {
		return "", err
	}
	return p.oauth(d, redirect).AuthCodeURL(state, oidc.Nonce(nonce), oauth2.S256ChallengeOption(verifier)), nil
}

// Exchange trades the code for the person's ID token (sending the PKCE
// verifier) and checks it: signature, issuer, audience, expiry and nonce, then
// what the provider vouches for (identity).
func (p *Provider) Exchange(ctx context.Context, redirect, code, verifier, nonce string) (Identity, error) {
	d, err := p.discover()
	if err != nil {
		return Identity{}, err
	}
	if nonce == "" || verifier == "" || code == "" {
		return Identity{}, errors.New("sso: a code, a verifier and a nonce are needed")
	}
	ctx = oidc.ClientContext(ctx, p.client())
	tok, err := p.oauth(d, redirect).Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return Identity{}, err
	}
	raw, _ := tok.Extra("id_token").(string)
	if raw == "" {
		return Identity{}, errors.New("sso: the provider sent no ID token")
	}
	idt, err := d.verifier.Verify(ctx, raw)
	if err != nil {
		return Identity{}, err
	}
	if subtle.ConstantTimeCompare([]byte(idt.Nonce), []byte(nonce)) != 1 {
		return Identity{}, errors.New("sso: the ID token answers another sign-in (nonce)")
	}
	var c claims
	if err := idt.Claims(&c); err != nil {
		return Identity{}, err
	}
	// The audience check passed; with several, the authorized party must be us
	// (and if it is named at all, it must be us).
	if (c.AZP != "" && c.AZP != p.Cfg.ClientID) || (len(idt.Audience) > 1 && c.AZP == "") {
		return Identity{}, errors.New("sso: the ID token was issued to another party (azp)")
	}
	if idt.Subject == "" {
		return Identity{}, errors.New("sso: the ID token names no person (sub)")
	}
	id, err := p.identity(idt.Issuer, c)
	id.Issuer, id.Subject = idt.Issuer, idt.Subject
	return id, err
}

type claims struct {
	Email             string   `json:"email"`
	EmailVerified     flexBool `json:"email_verified"`
	PreferredUsername string   `json:"preferred_username"`
	TID               string   `json:"tid"`
	AZP               string   `json:"azp"`
	HD                string   `json:"hd"`       // Google: the Workspace domain the account belongs to
	EDOV              flexBool `json:"xms_edov"` // Entra: the email's domain is verified by the directory
	Acct              flexInt  `json:"acct"`     // Entra: 0 a member, 1 a guest
	IDP               string   `json:"idp"`      // Entra: who signed a guest in, when not the directory
}

// flexBool reads true or "true" (or "1"): some providers send the others.
type flexBool struct{ set, val bool }

func (b *flexBool) UnmarshalJSON(raw []byte) error {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return err
	}
	switch v := v.(type) {
	case bool:
		b.set, b.val = true, v
	case string:
		b.set, b.val = true, strings.EqualFold(v, "true") || v == "1"
	}
	return nil
}

// flexInt reads 1 or "1".
type flexInt struct{ set, val int }

func (n *flexInt) UnmarshalJSON(raw []byte) error {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return err
	}
	switch v := v.(type) {
	case float64:
		n.set, n.val = 1, int(v)
	case string:
		n.set, n.val = 1, -1
		switch v {
		case "1":
			n.val = 1
		case "0":
			n.val = 0
		}
	}
	return nil
}

// googleOwn are the domains Google itself is the authority for: it makes
// the address and no one else can have it. Any other domain at Google is
// someone's own, put on a Workspace or a Cloud Identity account, which can be
// made by whoever controls DNS for it, or by someone who only knows that an
// address exists there, so for those the hd claim must name the same domain.
var googleOwn = []string{"gmail.com", "googlemail.com"}

// identity decides which address the claims vouch for.
//
// Google: email_verified: true, and the domain must be Google's own, or the
// token's hd (the Workspace the account belongs to) must be that domain.
// Without that, any Google identity account (one made with an address that
// is not Gmail, on any domain) may claim another organisation's address on a
// domain it does not own.
//
// A generic provider must say email_verified: true; what that means is the
// provider's, which is why only one the person who runs the server trusts to hand out these
// addresses is set up.
//
// Microsoft Entra: the email claim is whatever the directory's administrators
// (or, in a directory with open sign-up, anyone) set, and Entra does not
// say it is verified. So it counts only for a directory this instance allows
// (tid, with the issuer naming the same one), never for a guest (acct 1, or
// an idp that is not the directory), and only when the directory says the
// domain is verified (the optional claim xms_edov: true), or, when the
// claim is not sent, when the domain is one of the provider's allowed
// domains (for one directory only: with several, the claim is required). The address is the email claim, or when there is none the sign-in
// name, when that looks like one.
func (p *Provider) identity(iss string, c claims) (Identity, error) {
	if p.Cfg.Kind != config.KindEntra {
		if !c.EmailVerified.val {
			return Identity{}, ErrUnverified
		}
		email, ok := cleanEmail(c.Email)
		if !ok {
			return Identity{}, ErrUnverified
		}
		if p.Cfg.Kind == config.KindGoogle && !googleAuthority(email, c.HD) {
			return Identity{}, ErrUnverified
		}
		return Identity{Email: email}, nil
	}
	tid := strings.ToLower(c.TID)
	if !contains(p.Cfg.AllowedTenants, tid) {
		return Identity{}, ErrUnverified
	}
	if iss != p.Cfg.Issuer+"/"+tid+"/v2.0" {
		return Identity{}, errors.New("sso: the ID token's issuer is not the directory it names (iss, tid)")
	}
	if (c.EmailVerified.set && !c.EmailVerified.val) || (c.Acct.set == 1 && c.Acct.val != 0) || (c.IDP != "" && c.IDP != iss) {
		return Identity{}, ErrUnverified
	}
	addr := c.Email
	if addr == "" && !strings.Contains(c.PreferredUsername, "#EXT#") {
		addr = c.PreferredUsername
	}
	email, ok := cleanEmail(addr)
	if !ok {
		return Identity{}, ErrUnverified
	}
	// Many directories: the claim, and nothing weaker. A list of domains
	// cannot say which directory may hold an address on one of them.
	if c.EDOV.set && !c.EDOV.val || !c.EDOV.set && (p.Cfg.MultiTenant() || !p.DomainAllowed(email)) {
		return Identity{}, ErrUnverified
	}
	return Identity{Email: email, Tenant: tid}, nil
}

func googleAuthority(email, hd string) bool {
	_, domain, _ := strings.Cut(email, "@")
	return contains(googleOwn, domain) || (hd != "" && strings.EqualFold(hd, domain))
}

// cleanEmail is the address in the form accounts are kept in, or false when
// it is not one: a single @, something on both sides, nothing that is not
// printable, no spaces.
func cleanEmail(s string) (string, bool) {
	s = strings.ToLower(strings.TrimSpace(s))
	local, domain, ok := strings.Cut(s, "@")
	if !ok || local == "" || domain == "" || len(s) > 254 || strings.Contains(domain, "@") || !strings.Contains(domain, ".") {
		return "", false
	}
	for _, r := range s {
		if r <= ' ' || r == 0x7f || r > 0x7e && r < 0xa0 {
			return "", false
		}
	}
	return s, true
}

// DomainAllowed says whether email's domain is one of the provider's
// allowed domains. With none listed, it is not: nothing is open to everyone.
func (p *Provider) DomainAllowed(email string) bool {
	_, domain, _ := strings.Cut(email, "@")
	return domain != "" && contains(p.Cfg.AllowedDomains, strings.ToLower(domain))
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
