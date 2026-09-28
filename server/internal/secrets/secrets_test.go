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
