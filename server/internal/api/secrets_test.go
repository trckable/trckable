package api

import (
	"net/http"
	"strings"
	"testing"
)

// An API key reads reports: not where alerts go (a webhook URL is a secret)
// and not the list of keys.
func TestAPIKeyCannotReadAlertsOrKeys(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	code, out := do(t, c, "POST", g.srv.URL+"/api/v1/keys", `{"name":"mcp"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("create key: %d %v", code, out)
	}
	secret := out["secret"].(string)
	anon := client()
	for _, path := range []string{"/api/v1/sites/" + g.site + "/alerts", "/api/v1/keys"} {
		if code, _ := do(t, anon, "GET", g.srv.URL+path, "", "Authorization", "Bearer "+secret); code != http.StatusForbidden {
			t.Fatalf("API key GET %s: %d, want 403", path, code)
		}
		if code, _ := do(t, c, "GET", g.srv.URL+path, ""); code != http.StatusOK {
			t.Fatalf("owner GET %s: %d, want 200", path, code)
		}
	}
}

func TestRedactTarget(t *testing.T) {
	for in, want := range map[string]string{
		"https://hooks.slack.com/services/T0/B0/secret": "hooks.slack.com/…",
		"https://discord.com/api/webhooks/1/abc":        "discord.com/…",
		"ada@example.com":                               "a…@example.com",
		"":                                              "",
	} {
		if got := redactTarget(in); got != want {
			t.Errorf("redactTarget(%q) = %q, want %q", in, got, want)
		}
	}
}

// Every byte figure in a module's text is filled in from the build; none is
// typed, and none is left as a placeholder.
func TestModuleTextsCarryMeasuredSizes(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	code, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/modules", "")
	if code != http.StatusOK {
		t.Fatalf("modules: %d", code)
	}
	for _, m := range out["modules"].([]any) {
		mod := m.(map[string]any)
		costs, _ := mod["costs"].([]any)
		for _, cst := range costs {
			s := cst.(string)
			if strings.Contains(s, "{") {
				t.Errorf("%s: placeholder left in %q", mod["id"], s)
			}
		}
	}
}
