package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// A membership says that a person belongs to an account, with one role
// there. The role, and the sites a viewer may see, always come from the
// membership: users.account_id and users.role only mirror the person's oldest
// membership (their home). They are written here and never read for access.
// They stay because users.account_id is a required foreign key, and because
// an older binary that is started by mistake still sees everyone in their
// home account.

var (
	// ErrHolder refuses the change that would take an account from the person
	// who started it: the first owner is not removed and not made a viewer.
	ErrHolder = errors.New("this is the first owner of the account: they keep it")
	// ErrElsewhere refuses acting on someone's sign-in when they also belong
	// to another account: they manage their own.
	ErrElsewhere = errors.New("this person is in other accounts too: they manage their own sign-in")
)

// Membership is one account a person belongs to.
type Membership struct {
	Account   string
	Role      string
	CreatedAt int64
}

// dbtx is what a read needs: a transaction or the database itself.
type dbtx interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// Memberships lists every account a person belongs to, oldest first.
func (s *Store) Memberships(ctx context.Context, user string) ([]Membership, error) {
	return membershipsOf(ctx, s.DB, user)
}

func membershipsOf(ctx context.Context, q dbtx, user string) ([]Membership, error) {
	rows, err := q.QueryContext(ctx, `SELECT account_id, role, created_at FROM memberships WHERE user_id = ? ORDER BY created_at, rowid`, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Membership
	for rows.Next() {
		var m Membership
		if err := rows.Scan(&m.Account, &m.Role, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// choose picks the membership a person is in when nothing names one: the
// account they used last, then the oldest where they own, then the oldest.
// The list is oldest first. ok is false when there is none.
func choose(list []Membership, last string) (Membership, bool) {
	for _, m := range list {
		if last != "" && m.Account == last {
			return m, true
		}
	}
	for _, m := range list {
		if m.Role == RoleOwner {
			return m, true
		}
	}
	if len(list) > 0 {
		return list[0], true
	}
	return Membership{}, false
}

// viewOf is the person as they act in an account: the account and the role
// of that membership. With no account named, the fallback in choose applies;
// a person with no membership at all is not signed in (auth.ErrNotFound).
func viewOf(ctx context.Context, q dbtx, u User) (User, error) {
	var last string
	if err := q.QueryRowContext(ctx, `SELECT last_account FROM users WHERE id = ?`, u.ID).Scan(&last); err != nil {
		return User{}, err
	}
	list, err := membershipsOf(ctx, q, u.ID)
	if err != nil {
		return User{}, err
	}
	m, ok := choose(list, last)
	if !ok {
		return User{}, auth.ErrNotFound
	}
	u.AccountID, u.Role = m.Account, m.Role
	return u, nil
}

// addMembership joins a person to an account and keeps the mirror.
func addMembership(ctx context.Context, tx *sql.Tx, user, account, role string, at int64) error {
	if _, err := tx.ExecContext(ctx, `INSERT INTO memberships (user_id, account_id, role, created_at) VALUES (?, ?, ?, ?)`, user, account, role, at); err != nil {
		return err
	}
	return syncHome(ctx, tx, user)
}

// syncHome writes the oldest membership into the user row, the mirror.
func syncHome(ctx context.Context, tx *sql.Tx, user string) error {
	list, err := membershipsOf(ctx, tx, user)
	if err != nil || len(list) == 0 {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE users SET account_id = ?, role = ? WHERE id = ?`, list[0].Account, list[0].Role, user)
	return err
}

// holderOf is the first owner of an account: its oldest owner membership.
func holderOf(ctx context.Context, q dbtx, account string) (string, error) {
	var id string
	err := q.QueryRowContext(ctx, `SELECT user_id FROM memberships WHERE account_id = ? AND role = ? ORDER BY created_at, rowid LIMIT 1`, account, RoleOwner).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return id, err
}

// OnlyInAccount reports whether every membership of a person is in account:
// what an owner needs before acting on someone else's sign-in.
func (s *Store) OnlyInAccount(ctx context.Context, user, account string) (bool, error) {
	var other int
	if err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM memberships WHERE user_id = ? AND account_id <> ?`, user, account).Scan(&other); err != nil {
		return false, err
	}
	return other == 0, nil
}

// Holder says whether a person is the first owner of an account.
func (s *Store) Holder(ctx context.Context, account, user string) (bool, error) {
	id, err := holderOf(ctx, s.DB, account)
	return id != "" && id == user, err
}

// removeMembership ends one membership and what hangs on it: the person's
// site limits in that account. If it was their last, the person goes, with
// every session. Otherwise their sessions stay and the mirror moves to their
// next oldest account. The caller checks the rules first.
func removeMembership(ctx context.Context, tx *sql.Tx, account, user string) error {
	res, err := tx.ExecContext(ctx, `DELETE FROM memberships WHERE account_id = ? AND user_id = ?`, account, user)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM site_access WHERE subject = ? AND account_id = ?`, user, account); err != nil {
		return err
	}
	left, err := membershipsOf(ctx, tx, user)
	if err != nil {
		return err
	}
	if len(left) == 0 {
		if _, err := tx.ExecContext(ctx, `DELETE FROM auth_sessions WHERE user_id = ?`, user); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, user)
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET last_account = '' WHERE id = ? AND last_account = ?`, user, account); err != nil {
		return err
	}
	return syncHome(ctx, tx, user)
}

func nowUnix() int64 { return time.Now().Unix() }
