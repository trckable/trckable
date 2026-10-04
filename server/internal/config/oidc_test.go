package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const dirA = "11111111-1111-1111-1111-111111111111"

func parse(t *testing.T, env map[string]string) ([]OIDCProvider, error) {
	t.Helper()
	for _, kv := range os.Environ() {
		if k, _, _ := strings.Cut(kv, "="); strings.HasPrefix(k, "OIDC_") {
			t.Setenv(k, "")
			os.Unsetenv(k)
		}
	}
	for k, v := range env {
		t.Setenv(k, v)
	}
	return parseOIDC(os.Environ(), envFile)
}

func TestOIDCPresetsAndGeneric(t *testing.T) {
	got, err := parse(t, map[string]string{
		"OIDC_GOOGLE_CLIENT_ID": "g", "OIDC_GOOGLE_CLIENT_SECRET": "gs", "OIDC_GOOGLE_ALLOWED_DOMAINS": "Acme.com, @corp.io",
		"OIDC_MICROSOFT_CLIENT_ID": "m", "OIDC_MICROSOFT_CLIENT_SECRET": "ms", "OIDC_MICROSOFT_TENANT": strings.ToUpper(dirA),
		"OIDC_KEYCLOAK_CLIENT_ID": "k", "OIDC_KEYCLOAK_CLIENT_SECRET": "ks", "OIDC_KEYCLOAK_ISSUER": "https://sso.acme.com/realms/x", "OIDC_KEYCLOAK_LABEL": "Acme SSO",
		"OIDC_REQUIRE_TOTP": "true",
	})
	if err != nil || len(got) != 3 {
		t.Fatalf("%+v %v", got, err)
	}
	by := map[string]OIDCProvider{}
	for _, p := range got {
		by[p.Name] = p
	}
	g, m, k := by["google"], by["microsoft"], by["keycloak"]
	if g.Kind != KindGoogle || g.Issuer != GoogleIssuer || g.Label != "Google" || strings.Join(g.AllowedDomains, ",") != "acme.com,corp.io" {
		t.Fatalf("google: %+v", g)
	}
	if m.Kind != KindEntra || m.Issuer != EntraBase || m.Label != "Microsoft" || m.Tenant != dirA || strings.Join(m.AllowedTenants, ",") != dirA || m.MultiTenant() {
		t.Fatalf("microsoft: %+v", m)
	}
	if k.Kind != KindOIDC || k.Issuer != "https://sso.acme.com/realms/x" || k.Label != "Acme SSO" || k.ClientSecret != "ks" {
		t.Fatalf("keycloak: %+v", k)
	}
}

func TestOIDCSecretFromAFile(t *testing.T) {
	f := filepath.Join(t.TempDir(), "secret")
	if err := os.WriteFile(f, []byte("from-a-file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := parse(t, map[string]string{"OIDC_GOOGLE_CLIENT_ID": "g", "OIDC_GOOGLE_CLIENT_SECRET_FILE": f})
	if err != nil || len(got) != 1 || got[0].ClientSecret != "from-a-file" {
		t.Fatalf("%+v %v", got, err)
	}
}

func TestOIDCRefusesWhatIsNotSafe(t *testing.T) {
	base := map[string]string{"OIDC_MICROSOFT_CLIENT_ID": "m", "OIDC_MICROSOFT_CLIENT_SECRET": "s"}
	with := func(kv ...string) map[string]string {
		out := map[string]string{}
		for k, v := range base {
			out[k] = v
		}
		for i := 0; i+1 < len(kv); i += 2 {
			out[kv[i]] = kv[i+1]
		}
		return out
	}
	for name, env := range map[string]map[string]string{
		"no secret":               {"OIDC_GOOGLE_CLIENT_ID": "g"},
		"no client id":            {"OIDC_GOOGLE_CLIENT_SECRET": "s"},
		"generic with no issuer":  {"OIDC_X_CLIENT_ID": "x", "OIDC_X_CLIENT_SECRET": "s"},
		"generic over plain http": {"OIDC_X_CLIENT_ID": "x", "OIDC_X_CLIENT_SECRET": "s", "OIDC_X_ISSUER": "http://sso.example.com"},
		"generic at a host that starts like localhost": {"OIDC_X_CLIENT_ID": "x", "OIDC_X_CLIENT_SECRET": "s", "OIDC_X_ISSUER": "http://localhost.evil.example"},
		"google with another issuer":                   {"OIDC_GOOGLE_CLIENT_ID": "g", "OIDC_GOOGLE_CLIENT_SECRET": "s", "OIDC_GOOGLE_ISSUER": "https://evil.example"},
		"microsoft with no tenant":                     base,
		"microsoft with a domain name":                 with("OIDC_MICROSOFT_TENANT", "contoso.onmicrosoft.com"),
		"common with no allowed tenants":               with("OIDC_MICROSOFT_TENANT", "common"),
		"organizations with none":                      with("OIDC_MICROSOFT_TENANT", "organizations"),
		"consumers":                                    with("OIDC_MICROSOFT_TENANT", "consumers"),
		"the personal directory":                       with("OIDC_MICROSOFT_TENANT", "9188040d-6c67-4c5b-b112-36a304b66dad"),
		"the personal directory allowed":               with("OIDC_MICROSOFT_TENANT", "common", "OIDC_MICROSOFT_ALLOWED_TENANTS", dirA+",9188040d-6c67-4c5b-b112-36a304b66dad"),
		"allowed tenants that are not ids":             with("OIDC_MICROSOFT_TENANT", "common", "OIDC_MICROSOFT_ALLOWED_TENANTS", "contoso.com"),
		"a stray setting for no provider":              {"OIDC_LONELY_ALLOWED_DOMAINS": "a.com"},
	} {
		t.Run(name, func(t *testing.T) {
			if got, err := parse(t, env); err == nil {
				t.Fatalf("accepted: %+v", got)
			}
		})
	}
}

func TestOIDCManyDirectoriesWithTheListGiven(t *testing.T) {
	got, err := parse(t, map[string]string{
		"OIDC_MICROSOFT_CLIENT_ID": "m", "OIDC_MICROSOFT_CLIENT_SECRET": "s",
		"OIDC_MICROSOFT_TENANT": "organizations", "OIDC_MICROSOFT_ALLOWED_TENANTS": dirA,
	})
	if err != nil || len(got) != 1 || !got[0].MultiTenant() || got[0].AllowedTenants[0] != dirA {
		t.Fatalf("%+v %v", got, err)
	}
}

func TestOIDCNothingConfigured(t *testing.T) {
	if got, err := parse(t, map[string]string{"OIDC_REQUIRE_TOTP": "true", "OIDC_ALLOW_SIGNUP": "true"}); err != nil || got != nil {
		t.Fatalf("%+v %v", got, err)
	}
}

func TestOIDCAsksTheAuthenticatorCodeUnlessToldNot(t *testing.T) {
	for v, want := range map[string]bool{"": true, "true": true, "1": true, "false": false, "FALSE": false, "0": false} {
		t.Setenv("OIDC_REQUIRE_TOTP", v)
		if got := Load().OIDCRequireTOTP; got != want {
			t.Errorf("OIDC_REQUIRE_TOTP=%q: %v, want %v", v, got, want)
		}
	}
}
