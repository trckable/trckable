package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// Accounts, as an operator sees them: a hosting provider such as trckable
// Cloud runs one server for many customers, one account each, and manages
// them through the operator endpoints (internal/api/operator.go). A
// self-hosted instance has only DefaultAccount and never needs any of this.

// Account states. Active is everything; read-only keeps the dashboard and
// the traffic going but refuses changes (a payment that failed, in its grace
// period); suspended refuses sign-in, API keys, share links and new events,
// and keeps the data until the account is deleted.
const (
	StateActive    = "active"
	StateReadOnly  = "read_only"
	StateSuspended = "suspended"
)

var (
	// ErrMemberLimit refuses one more owner than the account's plan allows.
	ErrMemberLimit = errors.New("this plan has room for no more team members: make someone a viewer, or move to a bigger plan")
	// ErrDefaultAccount protects the account a self-hosted instance runs in.
	ErrDefaultAccount = errors.New("the default account cannot be managed this way")
	// ErrBadState is a state that is not one of the three.
	ErrBadState = errors.New(`state must be "active", "read_only" or "suspended"`)
)

// AccountInfo is one account in the operator's list.
type AccountInfo struct {
	ID         string `json:"id"`
	CreatedAt  int64  `json:"created_at"`
	State      string `json:"state"`
	MaxMembers int    `json:"max_members"` // owners allowed; 0 is no limit
	Owner      string `json:"owner"`       // the first owner's email
	Sites      int    `json:"sites"`
	Owners     int    `json:"owners"`
	Viewers    int    `json:"viewers"`
}

// CreateAccountWithOwner makes an account and its first owner in one step.
// The owner gets no password anyone knows: a hosted service signs people in
// itself and opens the dashboard with a one-time sign-in link.
func (s *Store) CreateAccountWithOwner(ctx context.Context, email string) (AccountInfo, Person, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || !strings.Contains(email, "@") {
		return AccountInfo{}, Person{}, errors.New("that does not look like an email address")
	}
	hash, err := auth.HashPassword(auth.Token("", 32)) // never shown, never usable
	if err != nil {
		return AccountInfo{}, Person{}, err
	}
	now := time.Now().Unix()
	a := AccountInfo{ID: auth.Token("acc_", 12), CreatedAt: now, State: StateActive, Owner: email, Owners: 1}
	p := Person{ID: auth.Token("usr_", 10), Email: email, Role: RoleOwner, CreatedAt: now}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return a, p, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO accounts (id, created_at) VALUES (?, ?)`, a.ID, now); err != nil {
		return a, p, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO users (id, account_id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		p.ID, a.ID, p.Email, hash, p.Role, now); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return a, p, auth.ErrExists
		}
		return a, p, err
	}
	return a, p, tx.Commit()
}

// Accounts lists every account but the default one, oldest first.
func (s *Store) Accounts(ctx context.Context) ([]AccountInfo, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT a.id, a.created_at, a.state, a.max_members,
		       COALESCE((SELECT email FROM users u WHERE u.account_id = a.id AND u.role = 'owner' ORDER BY created_at LIMIT 1), ''),
		       (SELECT COUNT(*) FROM sites s WHERE s.account_id = a.id),
		       (SELECT COUNT(*) FROM users u WHERE u.account_id = a.id AND u.role = 'owner'),
		       (SELECT COUNT(*) FROM users u WHERE u.account_id = a.id AND u.role = 'viewer')
		FROM accounts a WHERE a.id != ? ORDER BY a.created_at, a.id`, DefaultAccount)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AccountInfo{}
	for rows.Next() {
		var a AccountInfo
		if err := rows.Scan(&a.ID, &a.CreatedAt, &a.State, &a.MaxMembers, &a.Owner, &a.Sites, &a.Owners, &a.Viewers); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// Account returns one account as the list shows it.
func (s *Store) Account(ctx context.Context, id string) (AccountInfo, error) {
	all, err := s.Accounts(ctx)
	if err != nil {
		return AccountInfo{}, err
	}
	for _, a := range all {
		if a.ID == id {
			return a, nil
		}
	}
	return AccountInfo{}, auth.ErrNotFound
}

// SetMaxMembers sets how many owners the account may have (0: no limit).
// Owners already above a new, lower limit stay; only new ones are refused.
func (s *Store) SetMaxMembers(ctx context.Context, id string, n int) error {
	if id == DefaultAccount {
		return ErrDefaultAccount
	}
	if n < 0 {
		return errors.New("max_members cannot be negative")
	}
	return s.updateAccount(ctx, `UPDATE accounts SET max_members = ? WHERE id = ?`, n, id)
}

// SetAccountState moves an account between active, read-only and suspended.
// Suspending signs everyone out at once.
func (s *Store) SetAccountState(ctx context.Context, id, state string) error {
	if id == DefaultAccount {
		return ErrDefaultAccount
	}
	if state != StateActive && state != StateReadOnly && state != StateSuspended {
		return ErrBadState
	}
	if err := s.updateAccount(ctx, `UPDATE accounts SET state = ? WHERE id = ?`, state, id); err != nil {
		return err
	}
	if state == StateSuspended {
		if _, err := s.DB.ExecContext(ctx, `DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE account_id = ?)`, id); err != nil {
			return err
		}
	}
	return s.reloadSites(ctx)
}

// AccountState returns an account's state; an unknown account is active, so
// a missing row can never lock out the default one.
func (s *Store) AccountState(ctx context.Context, id string) string {
	var st string
	if err := s.DB.QueryRowContext(ctx, `SELECT state FROM accounts WHERE id = ?`, id).Scan(&st); err != nil {
		return StateActive
	}
	return st
}

func (s *Store) updateAccount(ctx context.Context, q string, v any, id string) error {
	res, err := s.DB.ExecContext(ctx, q, v, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return nil
}

// AccountSites lists an account's site ids, for deleting it: each site's
// analytics are purged by the writer before the site itself is deleted.
func (s *Store) AccountSites(ctx context.Context, id string) ([]string, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id FROM sites WHERE account_id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var sid string
		if err := rows.Scan(&sid); err != nil {
			return nil, err
		}
		out = append(out, sid)
	}
	return out, rows.Err()
}

// DeleteAccount removes an account with no sites left: its people (and with
// them their sessions and sign-in links), its API keys and the
// account itself. Sites are deleted first, one by one, by the caller.
func (s *Store) DeleteAccount(ctx context.Context, id string) error {
	if id == DefaultAccount {
		return ErrDefaultAccount
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var sites int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM sites WHERE account_id = ?`, id).Scan(&sites); err != nil {
		return err
	}
	if sites > 0 {
		return errors.New("the account still has sites: delete them first")
	}
	for _, q := range []string{
		`DELETE FROM users WHERE account_id = ?`,
		`DELETE FROM api_keys WHERE account_id = ?`,
		`DELETE FROM accounts WHERE id = ?`,
	} {
		if _, err := tx.ExecContext(ctx, q, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ownersFull reports ErrMemberLimit when the account already has as many
// owners as its limit allows.
func ownersFull(ctx context.Context, q interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, account string) error {
	var max, owners int
	if err := q.QueryRowContext(ctx, `SELECT max_members, (SELECT COUNT(*) FROM users WHERE account_id = ? AND role = 'owner') FROM accounts WHERE id = ?`, account, account).Scan(&max, &owners); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	if max > 0 && owners >= max {
		return ErrMemberLimit
	}
	return nil
}
