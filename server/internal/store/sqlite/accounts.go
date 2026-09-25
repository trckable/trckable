package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// User is a dashboard login.
type User struct {
	ID, AccountID, Email, Role string
}

// SessionTTL is how long a login lasts.
const SessionTTL = 30 * 24 * time.Hour

// HasUsers reports whether first-run setup has been completed.
func (s *Store) HasUsers(ctx context.Context) (bool, error) {
	var n int
	err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM users`).Scan(&n)
	return n > 0, err
}

// SetupToken returns the one-time setup token, creating it on first call.
// env, when set, wins (Railway templates generate it).
func (s *Store) SetupToken(ctx context.Context, env string) (string, error) {
	if env != "" {
		return env, nil
	}
	var tok string
	err := s.DB.QueryRowContext(ctx, `SELECT value FROM meta WHERE key = 'setup_token'`).Scan(&tok)
	if err == nil {
		return tok, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	tok = auth.Token("tkb_setup_", 20)
	if _, err := s.DB.ExecContext(ctx, `INSERT OR IGNORE INTO meta (key, value) VALUES ('setup_token', ?)`, tok); err != nil {
		return "", err
	}
	err = s.DB.QueryRowContext(ctx, `SELECT value FROM meta WHERE key = 'setup_token'`).Scan(&tok)
	return tok, err
}

// CompleteSetup creates the owner, atomically refusing if any user exists.
func (s *Store) CompleteSetup(ctx context.Context, email, password string) (User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if !strings.Contains(email, "@") || len(email) > 254 {
		return User{}, errors.New("enter a valid email address")
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return User{}, err
	}
	tx, err := s.DB.BeginTx(ctx, nil) // _txlock=immediate: serialises concurrent setups
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback()
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM users`).Scan(&n); err != nil {
		return User{}, err
	}
	if n > 0 {
		return User{}, auth.ErrSetupDone
	}
	u := User{ID: auth.Token("usr_", 10), AccountID: DefaultAccount, Email: email, Role: "owner"}
	if _, err := tx.ExecContext(ctx, `INSERT INTO users (id, account_id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		u.ID, u.AccountID, u.Email, hash, u.Role, time.Now().Unix()); err != nil {
		return User{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM meta WHERE key = 'setup_token'`); err != nil {
		return User{}, err
	}
	return u, tx.Commit()
}

// Login verifies credentials. It always runs one argon2id verification so
// unknown emails and wrong passwords take the same time.
func (s *Store) Login(ctx context.Context, email, password string) (User, error) {
	var u User
	var hash string
	err := s.DB.QueryRowContext(ctx, `SELECT id, account_id, email, role, password_hash FROM users WHERE email = ?`,
		strings.ToLower(strings.TrimSpace(email))).Scan(&u.ID, &u.AccountID, &u.Email, &u.Role, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		auth.VerifyPassword(dummyHash(), password)
		return User{}, auth.ErrBadLogin
	}
	if err != nil {
		return User{}, err
	}
	if !auth.VerifyPassword(hash, password) {
		return User{}, auth.ErrBadLogin
	}
	return u, nil
}

// dummyHash equalizes login timing for unknown emails. Made on the first
// unknown email rather than at start: a hash costs argon2's ~19 MB, which a
// process that nobody signs in to should never pay.
var dummyHash = sync.OnceValue(func() string {
	h, _ := auth.HashPassword("trckable-timing-equalizer")
	return h
})

// CreateSession starts a login session and returns its cookie value.
func (s *Store) CreateSession(ctx context.Context, userID string) (string, error) {
	tok := auth.Token("tkb_s_", 24)
	now := time.Now()
	_, err := s.DB.ExecContext(ctx, `INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
		auth.Hash(tok), userID, now.Unix(), now.Add(SessionTTL).Unix())
	_, _ = s.DB.ExecContext(ctx, `DELETE FROM auth_sessions WHERE expires_at < ?`, now.Unix())
	return tok, err
}

// SessionUser resolves a session cookie.
func (s *Store) SessionUser(ctx context.Context, token string) (User, error) {
	var u User
	err := s.DB.QueryRowContext(ctx, `SELECT u.id, u.account_id, u.email, u.role FROM auth_sessions a
		JOIN users u ON u.id = a.user_id WHERE a.token_hash = ? AND a.expires_at > ?`,
		auth.Hash(token), time.Now().Unix()).Scan(&u.ID, &u.AccountID, &u.Email, &u.Role)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, auth.ErrNotFound
	}
	if err == nil {
		// Someone is using the dashboard. Written at most once an hour.
		now := time.Now().Unix()
		s.DB.ExecContext(ctx, `UPDATE users SET last_seen_at = ? WHERE id = ? AND last_seen_at < ?`, now, u.ID, now-3600)
	}
	return u, err
}

// DeleteSession logs out.
func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM auth_sessions WHERE token_hash = ?`, auth.Hash(token))
	return err
}

// APIKey is a key as listed (never including the secret).
type APIKey struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Prefix   string `json:"prefix"`
	Created  int64  `json:"created_at"`
	LastUsed *int64 `json:"last_used_at,omitempty"`
}

// CreateAPIKey returns the new key's secret (shown once) and its record.
// MaxAPIKeys caps how many keys an account can hold at once. Keys are
// read-only, but every extra one is another thing to lose track of; revoking
// the ones you do not use is part of keeping the place tidy.
const MaxAPIKeys = 20

// ErrTooManySegments is returned when a site has as many saved views as it can.
var ErrTooManySegments = errors.New("that is 30 saved views, which is the limit — remove one you no longer use")

// ErrSegmentName: a saved view needs a name to be found again.
var ErrSegmentName = errors.New("a saved view needs a name")

// ErrTooManyKeys is returned when the cap is reached.
var ErrTooManyKeys = errors.New("that is 20 keys, which is the limit — revoke one you no longer use")

func (s *Store) CreateAPIKey(ctx context.Context, account, name string) (string, APIKey, error) {
	var live int
	if err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM api_keys WHERE revoked_at IS NULL AND account_id = ?`, account).Scan(&live); err != nil {
		return "", APIKey{}, err
	}
	if live >= MaxAPIKeys {
		return "", APIKey{}, ErrTooManyKeys
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = "API key"
	}
	if len(name) > 80 {
		name = name[:80]
	}
	secret := auth.Token("tkb_live_", 20)
	k := APIKey{ID: auth.Token("key_", 8), Name: name, Prefix: secret[:14], Created: time.Now().Unix()}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO api_keys (id, account_id, name, prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		k.ID, account, k.Name, k.Prefix, auth.Hash(secret), k.Created)
	return secret, k, err
}

// APIKeyAccount resolves an API key secret to its account.
func (s *Store) APIKeyAccount(ctx context.Context, secret string) (string, error) {
	var id, account string
	err := s.DB.QueryRowContext(ctx, `SELECT id, account_id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL`,
		auth.Hash(secret)).Scan(&id, &account)
	if errors.Is(err, sql.ErrNoRows) {
		return "", auth.ErrNotFound
	}
	if err == nil {
		_, _ = s.DB.ExecContext(ctx, `UPDATE api_keys SET last_used_at = ? WHERE id = ?`, time.Now().Unix(), id)
	}
	return account, err
}

// ListAPIKeys returns an account's active keys.
func (s *Store) ListAPIKeys(ctx context.Context, account string) ([]APIKey, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, name, prefix, created_at, last_used_at FROM api_keys WHERE revoked_at IS NULL AND account_id = ? ORDER BY created_at DESC`, account)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []APIKey{}
	for rows.Next() {
		var k APIKey
		var last sql.NullInt64
		if err := rows.Scan(&k.ID, &k.Name, &k.Prefix, &k.Created, &last); err != nil {
			return nil, err
		}
		if last.Valid {
			k.LastUsed = &last.Int64
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// RevokeAPIKey disables one of an account's keys immediately.
func (s *Store) RevokeAPIKey(ctx context.Context, account, id string) error {
	res, err := s.DB.ExecContext(ctx, `UPDATE api_keys SET revoked_at = ? WHERE id = ? AND account_id = ? AND revoked_at IS NULL`, time.Now().Unix(), id, account)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return nil
}

// SiteInfo is everything the dashboard shows about a site.
type SiteInfo struct {
	ID       string `json:"id"`
	Domain   string `json:"domain"`
	Name     string `json:"name"`
	Timezone string `json:"timezone"`
	Currency string `json:"currency"`
	ProxyKey string `json:"proxy_key"`
	// LastEventAt is when this site last sent an event (unix seconds, 0 if it
	// never has), so the dashboard can show which sites are live.
	LastEventAt int64 `json:"last_event_at,omitempty"`
	// Color and IconURL are the site's own look in the dashboard, if set.
	Color   string `json:"color,omitempty"`
	IconURL string `json:"icon_url,omitempty"`
	// WeekStart is the site's first day of the week (1 Monday, 0 Sunday), so
	// the dashboard's "This week" starts where the weekly report does.
	WeekStart int `json:"week_start"`
	// Check is the last look this server took for the site's snippet.
	Check *SiteCheck `json:"check,omitempty"`
}

// SiteInfo returns one site.
func (s *Store) SiteInfo(ctx context.Context, id string) (SiteInfo, error) {
	var si SiteInfo
	err := s.DB.QueryRowContext(ctx, `SELECT id, domain, name, timezone, currency, proxy_key FROM sites WHERE id = ?`, id).
		Scan(&si.ID, &si.Domain, &si.Name, &si.Timezone, &si.Currency, &si.ProxyKey)
	if errors.Is(err, sql.ErrNoRows) {
		return si, auth.ErrNotFound
	}
	return si, err
}

// UpdateSite changes a site's name and timezone.
func (s *Store) UpdateSite(ctx context.Context, id, name, tz, currency string) error {
	if tz != "" {
		if _, err := time.LoadLocation(tz); err != nil {
			return errors.New("unknown timezone")
		}
	}
	currency = strings.ToUpper(strings.TrimSpace(currency))
	if currency != "" && (len(currency) != 3 || strings.Trim(currency, "ABCDEFGHIJKLMNOPQRSTUVWXYZ") != "") {
		return errors.New("currency must be a 3-letter ISO code, like USD or EUR")
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE sites SET name = ?,
		timezone = CASE WHEN ? <> '' THEN ? ELSE timezone END,
		currency = CASE WHEN ? <> '' THEN ? ELSE currency END WHERE id = ?`,
		strings.TrimSpace(name), tz, tz, currency, currency, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return nil
}

// ResetPassword sets a new password for a user and signs out all of their
// sessions (the server-side recovery path; there is no email reset).
func (s *Store) ResetPassword(ctx context.Context, email, password string) error {
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var id string
	err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE email = ?`, strings.ToLower(strings.TrimSpace(email))).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return auth.ErrNotFound
	}
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = ? WHERE id = ?`, hash, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM auth_sessions WHERE user_id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

// ---- profile ---------------------------------------------------------------

// MaxAvatar is the largest picture accepted. A profile picture is shown at
// 34 px: anything bigger is wasted bytes in the control plane.
const MaxAvatar = 256 << 10

// Profile is what a person can change about themselves.
type Profile struct {
	Email     string `json:"email"`
	Name      string `json:"name"`
	HasAvatar bool   `json:"has_avatar"`
}

// Profile returns a user's name and whether they have a picture.
func (s *Store) Profile(ctx context.Context, id string) (Profile, error) {
	var p Profile
	var n int
	err := s.DB.QueryRowContext(ctx, `SELECT email, name, length(coalesce(avatar, '')) FROM users WHERE id = ?`, id).Scan(&p.Email, &p.Name, &n)
	p.HasAvatar = n > 0
	return p, err
}

// SetName changes a user's display name ("" clears it).
func (s *Store) SetName(ctx context.Context, id, name string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE users SET name = ? WHERE id = ?`, strings.TrimSpace(name), id)
	return err
}

// SetAvatar stores a picture, or removes it when body is empty.
func (s *Store) SetAvatar(ctx context.Context, id, mime string, body []byte) error {
	if len(body) == 0 {
		_, err := s.DB.ExecContext(ctx, `UPDATE users SET avatar = NULL, avatar_type = '' WHERE id = ?`, id)
		return err
	}
	_, err := s.DB.ExecContext(ctx, `UPDATE users SET avatar = ?, avatar_type = ? WHERE id = ?`, body, mime, id)
	return err
}

// Avatar returns a user's picture and its media type.
func (s *Store) Avatar(ctx context.Context, id string) (string, []byte, error) {
	var mime string
	var body []byte
	err := s.DB.QueryRowContext(ctx, `SELECT avatar_type, avatar FROM users WHERE id = ?`, id).Scan(&mime, &body)
	return mime, body, err
}

// CreateAccount makes a new, empty account and returns its id. A hosted
// service makes one per customer; a self-hosted instance lives in the
// default account and never needs another.
func (s *Store) CreateAccount(ctx context.Context) (string, error) {
	id := auth.Token("acc_", 12)
	_, err := s.DB.ExecContext(ctx, `INSERT INTO accounts (id, created_at) VALUES (?, ?)`, id, time.Now().Unix())
	return id, err
}
