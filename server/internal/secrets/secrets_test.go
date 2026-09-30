package secrets

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSealOpenAndWrongKey(t *testing.T) {
	a, _ := New([]byte("a very secret instance key"))
	b, _ := New([]byte("another instance key......"))
	s, err := a.Seal("sk_live_123")
	if err != nil || s == "sk_live_123" {
		t.Fatalf("seal: %q %v", s, err)
	}
	if s2, _ := a.Seal("sk_live_123"); s2 == s {
		t.Fatal("nonce reuse: identical ciphertexts")
	}
	if got, err := a.Open(s); err != nil || got != "sk_live_123" {
		t.Fatalf("open: %q %v", got, err)
	}
	if _, err := b.Open(s); err != ErrWrongKey {
		t.Fatalf("wrong key: %v", err)
	}
	if a.KCV() == b.KCV() {
		t.Fatal("KCVs collide")
	}
	if _, err := a.Open("v1:!!!"); err == nil {
		t.Fatal("malformed accepted")
	}
}

// A value sealed for one row opens only for that row; a plain Seal and Open
// are unchanged.
func TestSealForBindsToItsContext(t *testing.T) {
	b, _ := New([]byte("a very secret instance key"))
	sealed, err := b.SealFor("the token", "shr_one")
	if err != nil {
		t.Fatal(err)
	}
	if got, err := b.OpenFor(sealed, "shr_one"); err != nil || got != "the token" {
		t.Fatalf("open for its own row: %q %v", got, err)
	}
	for name, ctx := range map[string]string{"another row": "shr_two", "no context": ""} {
		if _, err := b.OpenFor(sealed, ctx); err == nil {
			t.Errorf("a value sealed for one row opened for %s", name)
		}
	}
	if _, err := b.Open(sealed); err == nil {
		t.Error("a bound value opened without its context")
	}
	plain, _ := b.Seal("sk_live_123")
	if got, err := b.OpenFor(plain, ""); err != nil || got != "sk_live_123" {
		t.Fatalf("a plain value: %q %v", got, err)
	}
}

func TestLoadCreatesKeyFileOnce(t *testing.T) {
	dir := t.TempDir()
	a, err := Load(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	fi, err := os.Stat(filepath.Join(dir, "secret.key"))
	if err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("key file: %v %v", fi, err)
	}
	b, _ := Load(dir, "")
	if a.KCV() != b.KCV() {
		t.Fatal("key changed between loads")
	}
	if _, err := Load(dir, "short"); err == nil {
		t.Fatal("short TRCKABLE_SECRET accepted")
	}
	c, _ := Load(dir, "an explicit secret from the env")
	if c.KCV() == a.KCV() {
		t.Fatal("env secret ignored")
	}
}
