package sqlite

import (
	"context"
	"database/sql"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// ErrNeedsCode says the password was right but a six-digit code is missing.
var ErrNeedsCode = errors.New("two-step sign-in is on for this account")

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
func (s *Store) StartTwoStep(ctx context.Context, id string) (string, error) {
	secret, err := auth.NewTOTPSecret()
	if err != nil {
		return "", err
	}
	_, err = s.DB.ExecContext(ctx, `UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?`, secret, id)
	return secret, err
}

// EnableTwoStep turns it on once the app's code checks out, and returns the
// recovery codes — the only time they are readable.
func (s *Store) EnableTwoStep(ctx context.Context, id, code string, now func() int64) ([]string, error) {
	var secret string
	if err := s.DB.QueryRowContext(ctx, `SELECT totp_secret FROM users WHERE id = ?`, id).Scan(&secret); err != nil {
		return nil, err
	}
	if secret == "" {
		return nil, auth.ErrNotFound
	}
	if !auth.VerifyTOTP(secret, code, nowTime(now)) {
		return nil, auth.ErrBadLogin
	}
	codes := make([]string, 8)
	hashes := make([]string, 8)
	for i := range codes {
		codes[i] = auth.Token("", 5) // short, readable, one use each
		hashes[i] = hex.EncodeToString(auth.Hash(codes[i]))
	}
	_, err := s.DB.ExecContext(ctx, `UPDATE users SET totp_enabled = 1, recovery = ? WHERE id = ?`, strings.Join(hashes, " "), id)
	return codes, err
}

// DisableTwoStep turns it off and forgets the secret.
func (s *Store) DisableTwoStep(ctx context.Context, id string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE users SET totp_enabled = 0, totp_secret = '', recovery = '' WHERE id = ?`, id)
	return err
}

// CheckSecondStep accepts an authenticator code or one recovery code, which is
// then used up.
func (s *Store) CheckSecondStep(ctx context.Context, id, code string, now func() int64) error {
	var secret, recovery string
	var on int
	if err := s.DB.QueryRowContext(ctx, `SELECT totp_secret, totp_enabled, recovery FROM users WHERE id = ?`, id).Scan(&secret, &on, &recovery); err != nil {
		return err
	}
	if on != 1 {
		return nil
	}
	if code == "" {
		return ErrNeedsCode
	}
	if auth.VerifyTOTP(secret, code, nowTime(now)) {
		return nil
	}
	left := splitCodes(recovery)
	for i, h := range left {
		if auth.Equal(h, hex.EncodeToString(auth.Hash(strings.TrimSpace(code)))) {
			left = append(left[:i], left[i+1:]...)
			s.DB.ExecContext(ctx, `UPDATE users SET recovery = ? WHERE id = ?`, strings.Join(left, " "), id)
			return nil
		}
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
