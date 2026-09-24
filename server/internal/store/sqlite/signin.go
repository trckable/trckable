package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// SigninLinkTTL is how long a one-time sign-in link works.
const SigninLinkTTL = time.Minute

// ErrTwoStepOn refuses a sign-in link for someone who asked for a second
// step: a link must never be a way around it.
var ErrTwoStepOn = errors.New("two-step sign-in is on for this person: they sign in themselves")

// CreateSigninLink makes a one-time sign-in token for the person with this
// email. Only the token's hash is kept.
func (s *Store) CreateSigninLink(ctx context.Context, email string) (string, error) {
	var id string
	var twoStep int
	err := s.DB.QueryRowContext(ctx, `SELECT id, totp_enabled FROM users WHERE email = ? COLLATE NOCASE`, strings.TrimSpace(email)).Scan(&id, &twoStep)
	if errors.Is(err, sql.ErrNoRows) {
		return "", auth.ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if twoStep == 1 {
		return "", ErrTwoStepOn
	}
	now := time.Now()
	s.DB.ExecContext(ctx, `DELETE FROM signin_links WHERE expires_at < ?`, now.Unix())
	tok := auth.Token("tkb_link_", 24)
	_, err = s.DB.ExecContext(ctx, `INSERT INTO signin_links (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
		auth.Hash(tok), id, now.Add(SigninLinkTTL).Unix())
	return tok, err
}

// UseSigninLink spends a token: it returns whose it was, once, before it
// expires. Deleting it is how it is spent, so two tabs cannot both use it.
func (s *Store) UseSigninLink(ctx context.Context, tok string) (string, error) {
	var id string
	err := s.DB.QueryRowContext(ctx, `DELETE FROM signin_links WHERE token_hash = ? AND expires_at >= ? RETURNING user_id`,
		auth.Hash(tok), time.Now().Unix()).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", auth.ErrNotFound
	}
	return id, err
}
