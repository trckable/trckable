package sqlite

import (
	"context"
	"encoding/hex"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/secrets"
)

// A copy of the control database (a stolen disk, a file left readable) must
// not be enough to pass anyone's second step: the authenticator secret is
// stored sealed with the instance key, and recovery codes as keyed hashes,
// so neither can be read or guessed from the file alone.
func TestTwoStepSecretsAreSealedAtRest(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	box, err := secrets.New([]byte("two-step test instance key"))
	if err != nil {
		t.Fatal(err)
	}
	s.Sealer = box
	p, err := s.AddUser(ctx, DefaultAccount, "me@site.com", "correct horse battery", RoleOwner)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 9, 26, 12, 0, 0, 0, time.UTC)
	clock := func() int64 { return at.Unix() }

	secret, err := s.StartTwoStep(ctx, p.ID, false, clock)
	if err != nil {
		t.Fatal(err)
	}
	column := func(name string) string {
		t.Helper()
		var v string
		if err := s.DB.QueryRowContext(ctx, `SELECT `+name+` FROM users WHERE id = ?`, p.ID).Scan(&v); err != nil {
			t.Fatal(err)
		}
		return v
	}
	if pending := column("totp_pending"); pending == "" || strings.Contains(pending, secret) {
		t.Fatalf("the pending secret is stored as it is: %q", pending)
	}
	code, _ := auth.TOTPCode(secret, at)
	codes, err := s.EnableTwoStep(ctx, p.ID, code, clock)
	if err != nil {
		t.Fatal(err)
	}
	if stored := column("totp_secret"); stored == "" || strings.Contains(stored, secret) {
		t.Fatalf("the secret is stored as it is: %q", stored)
	}
	recovery := column("recovery")
	for _, c := range codes {
		if strings.Contains(recovery, hex.EncodeToString(auth.Hash(c))) {
			t.Fatalf("recovery code %q is stored as a plain hash anyone can check guesses against", c)
		}
	}

	// And it all still works.
	at = at.Add(time.Minute)
	next, _ := auth.TOTPCode(secret, at)
	if err := s.CheckSecondStep(ctx, p.ID, next, clock); err != nil {
		t.Fatalf("a current code: %v", err)
	}
	if err := s.CheckSecondStep(ctx, p.ID, codes[0], clock); err != nil {
		t.Fatalf("a recovery code: %v", err)
	}
	if err := s.CheckSecondStep(ctx, p.ID, codes[0], clock); err != auth.ErrBadLogin {
		t.Fatalf("a recovery code twice: %v", err)
	}

	// Without the instance key, a sealed secret is refused, never read as
	// if it were the secret itself.
	s.Sealer = nil
	at = at.Add(time.Minute)
	later, _ := auth.TOTPCode(secret, at)
	if err := s.CheckSecondStep(ctx, p.ID, later, clock); err == nil {
		t.Fatal("a sealed secret was used without the key")
	}
}

// Two-step set up before secrets were sealed keeps working, and is sealed
// the first time a code from it is accepted.
func TestTwoStepFromBeforeSealingStillWorks(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	box, _ := secrets.New([]byte("two-step test instance key"))
	s.Sealer = box
	p, err := s.AddUser(ctx, DefaultAccount, "old@site.com", "correct horse battery", RoleOwner)
	if err != nil {
		t.Fatal(err)
	}
	secret, _ := auth.NewTOTPSecret()
	old := "abcde12345"
	if _, err := s.DB.ExecContext(ctx, `UPDATE users SET totp_secret = ?, totp_enabled = 1, recovery = ? WHERE id = ?`,
		secret, hex.EncodeToString(auth.Hash(old)), p.ID); err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 9, 26, 12, 0, 0, 0, time.UTC)
	clock := func() int64 { return at.Unix() }
	code, _ := auth.TOTPCode(secret, at)
	if err := s.CheckSecondStep(ctx, p.ID, code, clock); err != nil {
		t.Fatalf("a code from an old secret: %v", err)
	}
	var stored string
	if err := s.DB.QueryRowContext(ctx, `SELECT totp_secret FROM users WHERE id = ?`, p.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored == secret || !strings.HasPrefix(stored, "v1:") {
		t.Fatalf("the old secret was not sealed after use: %q", stored)
	}
	if err := s.CheckSecondStep(ctx, p.ID, old, clock); err != nil {
		t.Fatalf("an old recovery code: %v", err)
	}
}

// After the instance key changes, a sealed secret makes no codes, but a
// recovery code that needs no key still lets the person in.
func TestRecoveryCodesWorkAfterAKeyChange(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	box, _ := secrets.New([]byte("the first instance key"))
	s.Sealer = box
	p, _ := s.AddUser(ctx, DefaultAccount, "me@site.com", "correct horse battery", RoleOwner)
	secret, _ := auth.NewTOTPSecret()
	sealedSecret, _ := box.Seal(secret)
	plain := "abcde12345"
	if _, err := s.DB.ExecContext(ctx, `UPDATE users SET totp_secret = ?, totp_enabled = 1, recovery = ? WHERE id = ?`,
		sealedSecret, hex.EncodeToString(auth.Hash(plain)), p.ID); err != nil {
		t.Fatal(err)
	}
	other, _ := secrets.New([]byte("a different instance key"))
	s.Sealer = other
	at := time.Date(2026, 9, 26, 12, 0, 0, 0, time.UTC)
	clock := func() int64 { return at.Unix() }
	code, _ := auth.TOTPCode(secret, at)
	if err := s.CheckSecondStep(ctx, p.ID, code, clock); err == nil || err == auth.ErrBadLogin {
		t.Fatalf("an app code with the wrong key: %v, want the key error", err)
	}
	if err := s.CheckSecondStep(ctx, p.ID, plain, clock); err != nil {
		t.Fatalf("a recovery code after the key changed: %v", err)
	}
}
