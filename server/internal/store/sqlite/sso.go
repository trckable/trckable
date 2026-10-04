package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/trckable/trckable/server/internal/auth"
)

// UserByEmail is the person with exactly this address, as they act in their
// account: for signing in with an identity provider, which vouches for the
// address instead of a password. Nobody (auth.ErrNotFound) when no one on this
// instance has it, or when they belong to no account.
func (s *Store) UserByEmail(ctx context.Context, email string) (User, error) {
	var u User
	err := s.DB.QueryRowContext(ctx, `SELECT id, email FROM users WHERE email = ?`, strings.ToLower(strings.TrimSpace(email))).Scan(&u.ID, &u.Email)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, auth.ErrNotFound
	}
	if err != nil {
		return User{}, err
	}
	return viewOf(ctx, s.DB, u)
}

// UserByID is a person by id, with the account and role they act in.
func (s *Store) UserByID(ctx context.Context, id string) (User, error) {
	var u User
	err := s.DB.QueryRowContext(ctx, `SELECT id, email FROM users WHERE id = ?`, id).Scan(&u.ID, &u.Email)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, auth.ErrNotFound
	}
	if err != nil {
		return User{}, err
	}
	return viewOf(ctx, s.DB, u)
}

// RetirePassword gives someone a password that nobody holds, for when a
// provider signs them in while the password an owner chose for them is still
// waiting to be replaced: that one-time password was seen by the owner and
// passed along, and must not outlive the person's own arrival. It also ends
// every session and remembered browser opened with the old one, and clears the
// request to choose a new password (which could not be answered: nobody holds
// the current one).
func (s *Store) RetirePassword(ctx context.Context, id, unused string) error {
	hash, err := auth.HashPasswordCtx(ctx, unused)
	if err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ? AND must_change = 1`, hash, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil // already chosen by the person, or never chosen for them
	}
	for _, q := range []string{`DELETE FROM auth_sessions WHERE user_id = ?`, `DELETE FROM known_devices WHERE user_id = ?`} {
		if _, err := tx.ExecContext(ctx, q, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ErrNotTheSamePerson: the address belongs to someone here, but the provider's
// id in this token is not the one that was linked the first time, or is
// already linked to someone else.
var ErrNotTheSamePerson = errors.New("the provider's id for this person is not the one that signed in before")

// CheckSSOLink says whether iss and sub may be this person: nothing is
// recorded. It refuses the same way LinkSSO does, so a sign-in that has not
// finished (a code is still to be typed) is turned away on the same ground
// without being able to claim the person's link.
func (s *Store) CheckSSOLink(ctx context.Context, userID, iss, sub string) error {
	var have string
	err := s.DB.QueryRowContext(ctx, `SELECT sub FROM sso_links WHERE user_id = ? AND iss = ?`, userID, iss).Scan(&have)
	switch {
	case err == nil:
		if have != sub {
			return ErrNotTheSamePerson
		}
		return nil
	case !errors.Is(err, sql.ErrNoRows):
		return err
	}
	var other string
	err = s.DB.QueryRowContext(ctx, `SELECT user_id FROM sso_links WHERE iss = ? AND sub = ?`, iss, sub).Scan(&other)
	if err == nil {
		return ErrNotTheSamePerson // this id is someone else's here
	}
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	return err
}

// ClearSSOLinks forgets who a person is to every provider, so the next
// sign-in links again: for a person whose account at the provider was lost or
// replaced.
func (s *Store) ClearSSOLinks(ctx context.Context, userID string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM sso_links WHERE user_id = ?`, userID)
	return err
}

// IsOwnerAnywhere says whether the person is an owner in any account they
// belong to, not only the one they act in now.
func (s *Store) IsOwnerAnywhere(ctx context.Context, userID string) (bool, error) {
	var n int
	err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM memberships WHERE user_id = ? AND role = ?`, userID, RoleOwner).Scan(&n)
	return n > 0, err
}

// LinkSSO records who a person is to a provider (the issuer and the person's
// id there) the first time they sign in with it, and afterwards checks that it
// is still the same one. An address can change hands at the provider (an
// account deleted and made again, a domain sold); the id cannot.
func (s *Store) LinkSSO(ctx context.Context, userID, iss, sub string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var have string
	err = tx.QueryRowContext(ctx, `SELECT sub FROM sso_links WHERE user_id = ? AND iss = ?`, userID, iss).Scan(&have)
	switch {
	case err == nil:
		if have != sub {
			return ErrNotTheSamePerson
		}
		return nil
	case !errors.Is(err, sql.ErrNoRows):
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO sso_links (user_id, iss, sub, created_at) VALUES (?, ?, ?, ?)`, userID, iss, sub, nowUnix()); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return ErrNotTheSamePerson // this id is someone else's here
		}
		return err
	}
	return tx.Commit()
}
