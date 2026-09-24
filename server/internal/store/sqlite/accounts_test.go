package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"

	"github.com/trckable/trckable/server/internal/auth"
)

func openT(t *testing.T) *Store {
	t.Helper()
	s, err := Open(context.Background(), filepath.Join(t.TempDir(), "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestSetupHappensExactlyOnce(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	tok, _ := s.SetupToken(ctx, "")
	again, _ := s.SetupToken(ctx, "")
	if tok == "" || tok != again {
		t.Fatalf("setup token not stable: %q %q", tok, again)
	}
	if _, err := s.CompleteSetup(ctx, "me@x.com", "short"); err != auth.ErrWeakPassword {
		t.Fatalf("weak password: %v", err)
	}
	// Ten concurrent setups: exactly one wins.
	var wg sync.WaitGroup
	var mu sync.Mutex
	wins := 0
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.CompleteSetup(ctx, "me@x.com", "correct horse battery"); err == nil {
				mu.Lock()
				wins++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if wins != 1 {
		t.Fatalf("%d setups succeeded, want 1", wins)
	}
	if has, _ := s.HasUsers(ctx); !has {
		t.Fatal("no user after setup")
	}
	var n int
	s.DB.QueryRow(`SELECT count(*) FROM meta WHERE key = 'setup_token'`).Scan(&n)
	if n != 0 {
		t.Fatal("setup token must be deleted once used")
	}
}

func TestLoginSessionsAndKeys(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	if _, err := s.CompleteSetup(ctx, "Owner@Example.com", "correct horse battery"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Login(ctx, "owner@example.com", "wrong password!"); err != auth.ErrBadLogin {
		t.Fatalf("wrong password: %v", err)
	}
	if _, err := s.Login(ctx, "nobody@example.com", "whatever pass"); err != auth.ErrBadLogin {
		t.Fatalf("unknown email: %v", err)
	}
	u, err := s.Login(ctx, "  OWNER@example.com ", "correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	tok, _ := s.CreateSession(ctx, u.ID)
	if got, err := s.SessionUser(ctx, tok); err != nil || got.Email != "owner@example.com" {
		t.Fatalf("session: %v %+v", err, got)
	}
	s.DeleteSession(ctx, tok)
	if _, err := s.SessionUser(ctx, tok); err != auth.ErrNotFound {
		t.Fatal("logged-out session still valid")
	}

	secret, k, err := s.CreateAPIKey(ctx, DefaultAccount, "MCP client")
	if err != nil || len(secret) < 30 || secret[:9] != "tkb_live_" {
		t.Fatalf("api key %q %v", secret, err)
	}
	if acc, err := s.APIKeyAccount(ctx, secret); err != nil || acc != DefaultAccount {
		t.Fatalf("key lookup: %v", err)
	}
	var stored []byte
	s.DB.QueryRow(`SELECT key_hash FROM api_keys WHERE id = ?`, k.ID).Scan(&stored)
	if string(stored) == secret {
		t.Fatal("api key stored in plain text")
	}
	s.RevokeAPIKey(ctx, DefaultAccount, k.ID)
	if _, err := s.APIKeyAccount(ctx, secret); err != auth.ErrNotFound {
		t.Fatal("revoked key still works")
	}
}

func TestResetPasswordSignsOutEverywhere(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	u, err := s.CompleteSetup(ctx, "Me@Site.com", "correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	tok, _ := s.CreateSession(ctx, u.ID)
	if err := s.ResetPassword(ctx, "me@site.com", "short"); err == nil {
		t.Fatal("weak password accepted")
	}
	if err := s.ResetPassword(ctx, "nobody@site.com", "a brand new password"); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("unknown user: %v", err)
	}
	if err := s.ResetPassword(ctx, "me@site.com", "a brand new password"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SessionUser(ctx, tok); err == nil {
		t.Fatal("old session still valid")
	}
	if _, err := s.Login(ctx, "me@site.com", "correct horse battery"); err == nil {
		t.Fatal("old password still works")
	}
	if _, err := s.Login(ctx, "me@site.com", "a brand new password"); err != nil {
		t.Fatal(err)
	}
}
