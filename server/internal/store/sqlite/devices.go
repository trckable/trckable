package sqlite

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"errors"
	"strings"
	"time"
	"unicode"

	"github.com/trckable/trckable/server/internal/auth"
)

// Signing in with a code sent by email, and the phone app's own sign-ins.

const (
	// LoginCodeTTL is how long an emailed code can be used.
	LoginCodeTTL = 10 * time.Minute
	// LoginCodeTries is how many wrong guesses end a code.
	LoginCodeTries = 5
	// MaxDevices is how many devices one person keeps; a new one past it
	// replaces the one used longest ago.
	MaxDevices = 20
	// MaxDeviceName is the longest device name kept, in characters.
	MaxDeviceName = 64
	// DeviceTokenPrefix starts every device token, so a bearer token is
	// told apart from an API key without a lookup.
	DeviceTokenPrefix = "tkb_dev_"
)

// codeHash is a code as it is kept: HMAC-SHA256 under a key derived from the
// instance key, so a copy of the database alone cannot be searched for the
// six digits. Without an instance key (tests) the key is a fixed label.
func (s *Store) codeHash(userID, code string) []byte {
	key := []byte("login-code")
	if s.Sealer != nil {
		key = s.Sealer.Derive("login-code")
	}
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(userID + ":" + code))
	return mac.Sum(nil)
}

// PutLoginCode keeps a new code for a person. It replaces the one they had.
func (s *Store) PutLoginCode(ctx context.Context, userID, code string, now time.Time) error {
	_, err := s.DB.ExecContext(ctx, `INSERT OR REPLACE INTO login_codes (user_id, code_hash, expires_at, tries) VALUES (?, ?, ?, 0)`,
		userID, s.codeHash(userID, code), now.Add(LoginCodeTTL).Unix())
	_, _ = s.DB.ExecContext(ctx, `DELETE FROM login_codes WHERE expires_at < ?`, now.Unix())
	return err
}

// CheckLoginCode says whether code is the person's live code. A right code
// stays valid (a second step may still be asked; SpendLoginCode ends it); a
// wrong one counts, and the fifth ends the code. Every failure is the same
// auth.ErrBadLogin: no code, an old one, a spent one and a wrong one look alike.
func (s *Store) CheckLoginCode(ctx context.Context, userID, code string, now time.Time) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var hash []byte
	var exp int64
	var tries int
	err = tx.QueryRowContext(ctx, `SELECT code_hash, expires_at, tries FROM login_codes WHERE user_id = ?`, userID).Scan(&hash, &exp, &tries)
	if errors.Is(err, sql.ErrNoRows) {
		// A write like the wrong-code path makes, so an address with no code
		// (or no person: the caller passes a stand-in id) costs about what a
		// wrong guess costs.
		_, _ = tx.ExecContext(ctx, `UPDATE login_codes SET tries = tries WHERE user_id = ?`, userID)
		return commitBad(tx)
	}
	if err != nil {
		return err
	}
	if exp <= now.Unix() || tries >= LoginCodeTries {
		_, _ = tx.ExecContext(ctx, `DELETE FROM login_codes WHERE user_id = ?`, userID)
		return commitBad(tx)
	}
	if subtle.ConstantTimeCompare(hash, s.codeHash(userID, code)) == 1 {
		return tx.Commit()
	}
	if tries+1 >= LoginCodeTries {
		_, err = tx.ExecContext(ctx, `DELETE FROM login_codes WHERE user_id = ?`, userID)
	} else {
		_, err = tx.ExecContext(ctx, `UPDATE login_codes SET tries = tries + 1 WHERE user_id = ?`, userID)
	}
	if err != nil {
		return err
	}
	return commitBad(tx)
}

func commitBad(tx *sql.Tx) error {
	if err := tx.Commit(); err != nil {
		return err
	}
	return auth.ErrBadLogin
}

// SpendLoginCode uses the code up. Only one of two callers racing with the
// same code gets nil; the other gets auth.ErrBadLogin.
func (s *Store) SpendLoginCode(ctx context.Context, userID, code string) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM login_codes WHERE user_id = ? AND code_hash = ?`, userID, s.codeHash(userID, code))
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrBadLogin
	}
	return nil
}

// RemoveDeviceByToken signs out the device that holds token, if there is one.
func (s *Store) RemoveDeviceByToken(ctx context.Context, token string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM devices WHERE token_hash = ?`, auth.Hash(token))
	return err
}

// Device is one sign-in of the phone app, as listed (never the token).
type Device struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Platform string `json:"platform"`
	Created  int64  `json:"created_at"`
	LastUsed int64  `json:"last_used_at"`
	Current  bool   `json:"current"`
}

// CreateDevice signs a device in as userID and returns its token (shown once).
func (s *Store) CreateDevice(ctx context.Context, userID, name, platform string) (string, Device, error) {
	name = strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, name))
	if name == "" {
		name = "Phone"
	}
	if r := []rune(name); len(r) > MaxDeviceName {
		name = strings.TrimSpace(string(r[:MaxDeviceName]))
	}
	switch p := strings.ToLower(strings.TrimSpace(platform)); p {
	case "ios", "android":
		platform = p
	default:
		platform = "other"
	}
	tok := auth.Token(DeviceTokenPrefix, 32)
	now := time.Now().Unix()
	d := Device{ID: auth.Token("dev_", 8), Name: name, Platform: platform, Created: now, LastUsed: now}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO devices (id, user_id, token_hash, name, platform, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		d.ID, userID, auth.Hash(tok), d.Name, d.Platform, d.Created, d.LastUsed); err != nil {
		return "", Device{}, err
	}
	_, _ = s.DB.ExecContext(ctx, `DELETE FROM devices WHERE user_id = ? AND id NOT IN
		(SELECT id FROM devices WHERE user_id = ? ORDER BY last_used_at DESC, created_at DESC, rowid DESC LIMIT ?)`, userID, userID, MaxDevices)
	return tok, d, nil
}

// DeviceUser resolves a device token to the person and the device. The
// last-used time is written at most once an hour.
func (s *Store) DeviceUser(ctx context.Context, token string) (User, string, error) {
	var u User
	var id string
	err := s.DB.QueryRowContext(ctx, `SELECT u.id, u.email, d.id FROM devices d JOIN users u ON u.id = d.user_id WHERE d.token_hash = ?`,
		auth.Hash(token)).Scan(&u.ID, &u.Email, &id)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, "", auth.ErrNotFound
	}
	if err != nil {
		return User{}, "", err
	}
	if u, err = viewOf(ctx, s.DB, u); err != nil {
		return User{}, "", err
	}
	now := time.Now().Unix()
	// Best effort: a missed update is made on the next request.
	_, _ = s.DB.ExecContext(ctx, `UPDATE devices SET last_used_at = ? WHERE id = ? AND last_used_at < ?`, now, id, now-3600)
	_, _ = s.DB.ExecContext(ctx, `UPDATE users SET last_seen_at = ? WHERE id = ? AND last_seen_at < ?`, now, u.ID, now-3600)
	return u, id, nil
}

// Devices lists a person's devices, newest sign-in first; current marks one.
func (s *Store) Devices(ctx context.Context, userID, current string) ([]Device, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, name, platform, created_at, last_used_at FROM devices WHERE user_id = ? ORDER BY created_at DESC, rowid DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Device{}
	for rows.Next() {
		var d Device
		if err := rows.Scan(&d.ID, &d.Name, &d.Platform, &d.Created, &d.LastUsed); err != nil {
			return nil, err
		}
		d.Current = d.ID == current
		out = append(out, d)
	}
	return out, rows.Err()
}

// RemoveDevice signs one of a person's devices out, at once.
func (s *Store) RemoveDevice(ctx context.Context, userID, id string) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM devices WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return nil
}
