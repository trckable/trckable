package config

import (
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"
)

// Single sign-in with an identity provider (OIDC). One provider per name:
//
//	OIDC_<NAME>_CLIENT_ID, OIDC_<NAME>_CLIENT_SECRET (or _FILE), and
//	OIDC_<NAME>_ISSUER for any provider that is not a preset,
//	OIDC_<NAME>_ALLOWED_DOMAINS (optional), OIDC_<NAME>_LABEL (optional).
//
// GOOGLE and MICROSOFT are presets: Google needs no issuer; Microsoft Entra
// takes OIDC_MICROSOFT_TENANT (a directory id, or "organizations" / "common"
// together with OIDC_MICROSOFT_ALLOWED_TENANTS, the directory ids that may
// sign in). A provider is named in the address of its sign-in:
// /api/v1/oidc/<name>/start, with the name in lower case.

// Provider kinds.
const (
	KindOIDC   = "oidc"
	KindGoogle = "google"
	KindEntra  = "entra"
)

// Where the presets live.
const (
	GoogleIssuer = "https://accounts.google.com"
	EntraBase    = "https://login.microsoftonline.com"
)

// personalTenant is the directory of Microsoft's personal accounts, whose
// addresses nobody verifies: never an allowed tenant.
const personalTenant = "9188040d-6c67-4c5b-b112-36a304b66dad"

// OIDCProvider is one configured identity provider.
type OIDCProvider struct {
	Name           string   // lower case; the {provider} in the sign-in address
	Kind           string   // KindOIDC, KindGoogle or KindEntra
	Label          string   // what the button says
	Issuer         string   // the issuer; for Entra the authority, EntraBase
	ClientID       string   // never logged
	ClientSecret   string   // never logged
	AllowedDomains []string // lower case; who may be created here, see the api package
	Tenant         string   // Entra: a directory id, "organizations" or "common"
	AllowedTenants []string // Entra: the directory ids whose people may sign in
}

var (
	oidcName  = regexp.MustCompile(`^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`)
	guid      = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	oidcSufxs = []string{"_CLIENT_SECRET_FILE", "_CLIENT_SECRET", "_CLIENT_ID", "_ISSUER", "_ALLOWED_DOMAINS", "_ALLOWED_TENANTS", "_TENANT", "_LABEL"}
)

// MultiTenant says whether an Entra provider takes people from more than one
// directory, so the issuer in a token must be checked against the tenant it
// names, not against one address.
func (p OIDCProvider) MultiTenant() bool {
	return p.Kind == KindEntra && !guid.MatchString(p.Tenant)
}

// parseOIDC reads the providers out of environ (KEY=VALUE lines). get reads
// a secret the way every other one is read (the variable, or its _FILE).
func parseOIDC(environ []string, get func(string) string) ([]OIDCProvider, error) {
	names := map[string]bool{}
	for _, kv := range environ {
		k, _, _ := strings.Cut(kv, "=")
		if !strings.HasPrefix(k, "OIDC_") {
			continue
		}
		rest := strings.TrimPrefix(k, "OIDC_")
		for _, s := range oidcSufxs {
			if strings.HasSuffix(rest, s) && len(rest) > len(s) {
				names[rest[:len(rest)-len(s)]] = true
				break
			}
		}
	}
	var order []string
	for n := range names {
		order = append(order, n)
	}
	sort.Strings(order)
	var out []OIDCProvider
	var problems []string
	seen := map[string]string{}
	for _, n := range order {
		p, err := oneOIDC(n, get)
		if err != nil {
			problems = append(problems, err.Error())
			continue
		}
		if was, dup := seen[p.Name]; dup {
			problems = append(problems, fmt.Sprintf("OIDC_%s and OIDC_%s name the same provider", was, n))
			continue
		}
		seen[p.Name] = n
		out = append(out, p)
	}
	if len(problems) > 0 {
		return nil, fmt.Errorf("single sign-in: %s", strings.Join(problems, "; "))
	}
	return out, nil
}

func oneOIDC(n string, get func(string) string) (OIDCProvider, error) {
	key := func(s string) string { return "OIDC_" + n + s }
	if !oidcName.MatchString(n) {
		return OIDCProvider{}, fmt.Errorf("OIDC_%s: the name may use capital letters, digits and single underscores", n)
	}
	p := OIDCProvider{
		Name:           strings.ToLower(n),
		Kind:           KindOIDC,
		Issuer:         strings.TrimSpace(os.Getenv(key("_ISSUER"))),
		ClientID:       strings.TrimSpace(os.Getenv(key("_CLIENT_ID"))),
		ClientSecret:   get(key("_CLIENT_SECRET")),
		Label:          strings.TrimSpace(os.Getenv(key("_LABEL"))),
		AllowedDomains: list(os.Getenv(key("_ALLOWED_DOMAINS"))),
		Tenant:         strings.ToLower(strings.TrimSpace(os.Getenv(key("_TENANT")))),
		AllowedTenants: list(os.Getenv(key("_ALLOWED_TENANTS"))),
	}
	if p.ClientID == "" || p.ClientSecret == "" {
		return p, fmt.Errorf("OIDC_%s needs both _CLIENT_ID and _CLIENT_SECRET", n)
	}
	switch n {
	case "GOOGLE":
		p.Kind, p.Label = KindGoogle, firstOf(p.Label, "Google")
		if p.Issuer != "" && p.Issuer != GoogleIssuer {
			return p, fmt.Errorf("OIDC_GOOGLE_ISSUER is fixed: leave it out")
		}
		p.Issuer = GoogleIssuer
	case "MICROSOFT", "ENTRA":
		p.Kind, p.Label = KindEntra, firstOf(p.Label, "Microsoft")
		if p.Issuer != "" {
			return p, fmt.Errorf("OIDC_%s_ISSUER is fixed: use _TENANT", n)
		}
		p.Issuer = EntraBase
		if err := checkTenants(&p, n); err != nil {
			return p, err
		}
	default:
		if p.Issuer == "" {
			return p, fmt.Errorf("OIDC_%s_ISSUER is needed for a provider that is not google or microsoft", n)
		}
		if !secureURL(p.Issuer) {
			return p, fmt.Errorf("OIDC_%s_ISSUER must be an https address", n)
		}
		p.Label = firstOf(p.Label, strings.ToUpper(n[:1])+strings.ToLower(n[1:]))
	}
	return p, nil
}

func checkTenants(p *OIDCProvider, n string) error {
	if p.Tenant == "" {
		return fmt.Errorf("OIDC_%s_TENANT is needed: your directory (tenant) id, or organizations with _ALLOWED_TENANTS", n)
	}
	for i, t := range p.AllowedTenants {
		p.AllowedTenants[i] = strings.ToLower(t)
		if !guid.MatchString(p.AllowedTenants[i]) {
			return fmt.Errorf("OIDC_%s_ALLOWED_TENANTS lists directory ids, like 1b2c3d4e-0000-0000-0000-123456789abc", n)
		}
		if p.AllowedTenants[i] == personalTenant {
			return fmt.Errorf("OIDC_%s_ALLOWED_TENANTS: personal Microsoft accounts have no verified address and cannot sign in", n)
		}
	}
	switch {
	case guid.MatchString(p.Tenant):
		if p.Tenant == personalTenant {
			return fmt.Errorf("OIDC_%s_TENANT: personal Microsoft accounts have no verified address and cannot sign in", n)
		}
		p.AllowedTenants = []string{p.Tenant}
	case p.Tenant == "organizations" || p.Tenant == "common":
		if len(p.AllowedTenants) == 0 {
			return fmt.Errorf("OIDC_%s_TENANT=%s takes people from any directory: list the ones you trust in OIDC_%s_ALLOWED_TENANTS", n, p.Tenant, n)
		}
	default:
		return fmt.Errorf("OIDC_%s_TENANT is a directory id like 1b2c3d4e-0000-0000-0000-123456789abc, or organizations or common", n)
	}
	return nil
}

func secureURL(s string) bool {
	if strings.HasPrefix(s, "https://") {
		return true
	}
	for _, h := range []string{"http://localhost", "http://127.0.0.1", "http://[::1]"} {
		if strings.HasPrefix(s, h) && (len(s) == len(h) || s[len(h)] == ':' || s[len(h)] == '/') {
			return true
		}
	}
	return false
}

func firstOf(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func list(s string) []string {
	var out []string
	for _, v := range strings.FieldsFunc(s, func(r rune) bool { return r == ',' || r == ' ' || r == ';' }) {
		if v = strings.ToLower(strings.TrimSpace(v)); v != "" {
			out = append(out, strings.TrimPrefix(v, "@"))
		}
	}
	return out
}
