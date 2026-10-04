package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGAClientFromEnvAndSecretFile(t *testing.T) {
	t.Setenv("GA_OAUTH_CLIENT_ID", " abc.apps.googleusercontent.com ")
	file := filepath.Join(t.TempDir(), "secret")
	if err := os.WriteFile(file, []byte("GOCSPX-from-a-file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GA_OAUTH_CLIENT_SECRET_FILE", file)
	c := Load()
	if c.GAClientID != "abc.apps.googleusercontent.com" || c.GAClientSecret != "GOCSPX-from-a-file" {
		t.Errorf("%q %q", c.GAClientID, c.GAClientSecret)
	}
}

func TestGAClientIsOffByDefault(t *testing.T) {
	t.Setenv("GA_OAUTH_CLIENT_ID", "")
	t.Setenv("GA_OAUTH_CLIENT_SECRET", "")
	t.Setenv("GA_OAUTH_CLIENT_SECRET_FILE", "")
	c := Load()
	if c.GAClientID != "" || c.GAClientSecret != "" {
		t.Errorf("%q %q", c.GAClientID, c.GAClientSecret)
	}
}
