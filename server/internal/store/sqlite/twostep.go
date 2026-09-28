package sqlite

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// ErrNeedsCode says the password was right but a six-digit code is missing.
var ErrNeedsCode = errors.New("two-step sign-in is on for this account")

// Sealer is the instance key's box (secrets.Box).
type Sealer interface {
	Seal(plain string) (string, error)
	Open(sealed string) (string, error)
	Derive(label string) []byte
}

// sealed marks a value the Sealer wrote (secrets.Box's "v1:"). A TOTP secret
// is base32, which never contains a colon, so an old plain secret is never
// mistaken for one.
const sealed = "v1:"

// sealSecret is how an authenticator secret is stored: sealed with the
// instance key, so a copy of this database alone cannot make codes.
func (s *Store) sealSecret(secret string) (string, error) {
	if s.Sealer == nil || secret == "" {
		return secret, nil
	}
	return s.Sealer.Seal(secret)
}

// openSecret reads a stored secret: sealed, or plain from before secrets
// were sealed.
func (s *Store) openSecret(stored string) (string, error) {
	if !strings.HasPrefix(stored, sealed) {
		return stored, nil
	}
	if s.Sealer == nil {
		return "", errors.New("two-step secret is sealed and this process has no instance key")
	}
	return s.Sealer.Open(stored)
}

// keyed marks a recovery code stored as an HMAC with a key derived from the
// instance key. Codes are short enough to type (40 bits), so a plain hash in
// a copied database could be searched for every code there is; a keyed one
// cannot be checked without the key. Codes made before this are plain
// SHA-256 and still accepted.
const keyed = "k1:"

func (s *Store) recoveryHash(code string) string {
	if s.Sealer == nil {
		return hex.EncodeToString(auth.Hash(code))
	}
	m := hmac.New(sha256.New, s.Sealer.Derive("two-step recovery codes"))
	m.Write([]byte(code))
	return keyed + hex.EncodeToString(m.Sum(nil))
}

// recoveryMatch says whether a stored hash is this code's, in either form.
func (s *Store) recoveryMatch(stored, code string) bool {
	if strings.HasPrefix(stored, keyed) {
		return s.Sealer != nil && auth.Equal(stored, s.recoveryHash(code))
	}
	return auth.Equal(stored, hex.EncodeToString(auth.Hash(code)))
}

// TwoStep is what the dashboard needs to show the section.
type TwoStep struct {
	Enabled bool `json:"enabled"`
	// Recovery is how many one-time codes are left.
	Recovery int `json:"recovery_left"`
}

// TwoStepOf reports whether two-step sign-in is on for a user.
func (s *Store) TwoStepOf(ctx context.Context, id string) (TwoStep, error) {
	var on int
	var recovery string
	err := s.DB.QueryRowContext(ctx, `SELECT totp_enabled, recovery FROM users WHERE id = ?`, id).Scan(&on, &recovery)
	if errors.Is(err, sql.ErrNoRows) {
		return TwoStep{}, auth.ErrNotFound
	}
	return TwoStep{Enabled: on == 1, Recovery: len(splitCodes(recovery))}, err
}

// StartTwoStep stores a fresh secret without turning anything on: it is only
// enabled once a code from it has been proven.
//
// wasOn is whether two-step was on when the caller checked what to ask for;
// if it changed since, nothing is written (the caller asked for too little).
func (s *Store) StartTwoStep(ctx context.Context, id string, wasOn bool, now func() int64) (string, error) {
	secret, err := auth.NewTOTPSecret()
	if err != nil {
		return "", err
	}
	stored, err := s.sealSecret(secret)
	if err != nil {
		return "", err
	}
	on := 0
	if wasOn {
		on = 1
	}
	// Pending only: the secret that works now (if any) keeps working until a
	// code from the new one is proven. Writing it over the live one used to
	// turn two-step off the moment a setup started.
	res, err := s.DB.ExecContext(ctx, `UPDATE users SET totp_pending = ?, totp_pending_at = ? WHERE id = ? AND totp_enabled = ?`, stored, nowTime(now).Unix(), id, on)
	if err != nil {
		return "", err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return "", ErrChanged
	}
	return secret, nil
}

// PendingTTL is how long a new phone's secret waits to be proven.
const PendingTTL = 10 * time.Minute

// ErrChanged: two-step changed between the check and the write.
var ErrChanged = errors.New("two-step sign-in changed meanwhile: try again")

// EnableTwoStep turns it on once the app's code checks out, and returns the
// recovery codes — the only time they are readable.
func (s *Store) EnableTwoStep(ctx context.Context, id, code string, now func() int64) ([]string, error) {
	var pending string
	var at int64
	if err := s.DB.QueryRowContext(ctx, `SELECT totp_pending, totp_pending_at FROM users WHERE id = ?`, id).Scan(&pending, &at); err != nil {
		return nil, err
	}
	if pending == "" || nowTime(now).Sub(time.Unix(at, 0)) > PendingTTL {
		return nil, auth.ErrNotFound
	}
	secret, err := s.openSecret(pending)
	if err != nil {
		return nil, err
	}
	// Stored sealed from here on, whatever the pending one was.
	stored, err := s.sealSecret(secret)
	if err != nil {
		return nil, err
	}
	step, ok := auth.TOTPStepOf(secret, code, nowTime(now))
	if !ok {
		return nil, auth.ErrBadLogin
	}
	codes := make([]string, 8)
	hashes := make([]string, 8)
	for i := range codes {
		codes[i] = auth.Token("", 5) // short, readable, one use each
		hashes[i] = s.recoveryHash(codes[i])
	}
	// Exactly the secret that was checked, exactly once: two enables racing
	// with one code used to copy an already-cleared pending secret, leaving
	// two-step on with an empty secret whose codes anyone can compute.
	res, err := s.DB.ExecContext(ctx, `UPDATE users SET totp_secret = ?, totp_pending = '', totp_pending_at = 0, totp_enabled = 1, recovery = ?, totp_last_step = ? WHERE id = ? AND totp_pending = ?`,
		stored, strings.Join(hashes, " "), step, id, pending)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return nil, auth.ErrNotFound // another request enabled it first
	}
	return codes, nil
}

// DisableTwoStepIf turns it off only if it is still as the caller checked
// (wasOn): a two-step turned on between that check and this write is left on.
func (s *Store) DisableTwoStepIf(ctx context.Context, id string, wasOn bool) error {
	on := 0
	if wasOn {
		on = 1
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE users SET totp_enabled = 0, totp_secret = '', totp_pending = '', recovery = '', totp_last_step = 0 WHERE id = ? AND totp_enabled = ?`, id, on)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrChanged
	}
	return nil
}

// DisableTwoStep turns it off and forgets the secret.
func (s *Store) DisableTwoStep(ctx context.Context, id string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE users SET totp_enabled = 0, totp_secret = '', totp_pending = '', recovery = '', totp_last_step = 0 WHERE id = ?`, id)
	return err
}

// CheckSecondStep accepts an authenticator code or one recovery code, which is
// then used up.
func (s *Store) CheckSecondStep(ctx context.Context, id, code string, now func() int64) error {
	var stored, recovery string
	var on int
	if err := s.DB.QueryRowContext(ctx, `SELECT totp_secret, totp_enabled, recovery FROM users WHERE id = ?`, id).Scan(&stored, &on, &recovery); err != nil {
		return err
	}
	if on != 1 {
		return nil
	}
	if stored == "" {
		return errors.New("two-step is on without a secret: an admin must reset it (trckabled admin disable-2fa)")
	}
	if code == "" {
		return ErrNeedsCode
	}
	// A secret the instance key cannot open (the key was changed or lost)
	// makes no codes, but recovery codes are still tried: codes made before
	// sealing are plain hashes that need no key.
	secret, openErr := s.openSecret(stored)
	if openErr != nil {
		secret = ""
	}
	if step, ok := auth.TOTPStepOf(secret, code, nowTime(now)); ok {
		// Each step once: the update only happens for a newer step, so the
		// same code (or an older one still inside the window) is refused, even
		// when two sign-ins race with it.
		res, err := s.DB.ExecContext(ctx, `UPDATE users SET totp_last_step = ? WHERE id = ? AND totp_last_step < ?`, step, id, step)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 1 {
			// A secret from before sealing is sealed now that it proved
			// itself; only if it is still the one read.
			if !strings.HasPrefix(stored, sealed) && s.Sealer != nil {
				if again, err := s.sealSecret(secret); err == nil {
					if _, err := s.DB.ExecContext(ctx, `UPDATE users SET totp_secret = ? WHERE id = ? AND totp_secret = ?`, again, id, stored); err != nil {
						// The code was right; sealing is tried again next time.
						slog.Warn("two-step: could not seal an old secret", "err", err)
					}
				}
			}
			return nil
		}
		return auth.ErrBadLogin
	}
	left := splitCodes(recovery)
	for i, h := range left {
		if s.recoveryMatch(h, strings.TrimSpace(code)) {
			left = append(left[:i], left[i+1:]...)
			// Spent only if the list is still the one read: of two requests
			// with the same code (or two codes at once) one wins; the other
			// is refused rather than using a code twice or bringing one back.
			res, err := s.DB.ExecContext(ctx, `UPDATE users SET recovery = ? WHERE id = ? AND recovery = ?`, strings.Join(left, " "), id, recovery)
			if err != nil {
				return err
			}
			if n, _ := res.RowsAffected(); n != 1 {
				return auth.ErrBadLogin
			}
			return nil
		}
	}
	if openErr != nil {
		return fmt.Errorf("two-step secret cannot be read (was TRCKABLE_SECRET changed?): use a recovery code, or an admin can reset it (trckabled admin disable-2fa): %w", openErr)
	}
	return auth.ErrBadLogin
}

func splitCodes(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return strings.Fields(s)
}

// nowTime lets tests pin the clock without threading a clock through every
// call: the default is simply now.
func nowTime(now func() int64) time.Time {
	if now == nil {
		return time.Now()
	}
	return time.Unix(now(), 0)
}
