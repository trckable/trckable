package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// Two roles, and that is the whole model: an owner runs the instance, a viewer
// reads it. Anything more (per-site access, teams) belongs to a later version,
// and inventing it now would mean guessing.
const (
	RoleOwner  = "owner"
	RoleViewer = "viewer"
)

// ErrLastOwner refuses the change that would leave nobody able to administer.
var ErrLastOwner = errors.New("this is the only owner: make someone else an owner first")

// Person is one account on this instance, as the people list shows it.
type Person struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	CreatedAt int64  `json:"created_at"`
	TwoStep   bool   `json:"two_step"`
	// LastSeen is when they last used the dashboard (unix seconds, hourly at
	// most); 0 means never signed in.
	LastSeen int64 `json:"last_seen"`
	// MustChange: they still have a password someone else chose.
	MustChange bool `json:"must_change"`
}

// People lists an account's people, oldest first — which is the owner, on any
// account that started with one person. Someone still waiting for their
// address to be free (AddUser) is listed like anyone who has not signed in yet.
func (s *Store) People(ctx context.Context, account string) ([]Person, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT id, email, COALESCE(name, ''), role, created_at, totp_enabled, last_seen_at, must_change FROM users WHERE account_id = ?
		UNION ALL
		SELECT id, email, '', role, created_at, 0, 0, must_change FROM waiting_people WHERE account_id = ?
		ORDER BY created_at`, account, account)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Person
	for rows.Next() {
		var p Person
		var two, must int
		if err := rows.Scan(&p.ID, &p.Email, &p.Name, &p.Role, &p.CreatedAt, &two, &p.LastSeen, &must); err != nil {
			return nil, err
		}
		p.TwoStep, p.MustChange = two == 1, must == 1
		out = append(out, p)
	}
	return out, rows.Err()
}

// AddUser adds a person to an account with the given role. ErrExists means
// they are already on this account, which its owner can see anyway.
//
// An address that is someone in another account is never refused: that
// would tell one account about another's people. The person waits instead,
// listed and answered for exactly like anyone added, and joins with the same
// role and password the moment their address is free (letIn). Both ways do
// the same work, the password hash included, so the time taken says nothing
// either.
func (s *Store) AddUser(ctx context.Context, account, email, password, role string) (Person, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || !strings.Contains(email, "@") {
		return Person{}, errors.New("that does not look like an email address")
	}
	if role != RoleOwner && role != RoleViewer {
		return Person{}, errors.New(`role must be "owner" or "viewer"`)
	}
	if len(password) < 12 {
		return Person{}, errors.New("use at least 12 characters")
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return Person{}, err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return Person{}, err
	}
	defer tx.Rollback()
	if role == RoleOwner {
		if err := ownersFull(ctx, tx, account); err != nil {
			return Person{}, err
		}
	}
	var here, elsewhere int
	if err := tx.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM users WHERE account_id = ? AND email = ?) + (SELECT COUNT(*) FROM waiting_people WHERE account_id = ? AND email = ?),
		(SELECT COUNT(*) FROM users WHERE email = ?)`, account, email, account, email, email).Scan(&here, &elsewhere); err != nil {
		return Person{}, err
	}
	if here > 0 {
		return Person{}, auth.ErrExists
	}
	table := "users"
	if elsewhere > 0 {
		table = "waiting_people"
	}
	p := Person{ID: auth.Token("usr_", 10), Email: email, Role: role, CreatedAt: time.Now().Unix()}
	if _, err := tx.ExecContext(ctx, `INSERT INTO `+table+` (id, account_id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		p.ID, account, p.Email, hash, p.Role, p.CreatedAt); err != nil {
		return Person{}, err
	}
	return p, tx.Commit()
}

// person finds someone of an account among its people and those waiting,
// and says which table holds them. ErrNotFound when they are in neither.
func person(ctx context.Context, q interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, account, id string) (p Person, table string, err error) {
	err = q.QueryRowContext(ctx, `
		SELECT id, email, role, 'users' FROM users WHERE id = ? AND account_id = ?
		UNION ALL
		SELECT id, email, role, 'waiting_people' FROM waiting_people WHERE id = ? AND account_id = ?`,
		id, account, id, account).Scan(&p.ID, &p.Email, &p.Role, &table)
	if errors.Is(err, sql.ErrNoRows) {
		err = auth.ErrNotFound
	}
	return p, table, err
}

// letIn gives a freed address to whoever has waited longest for it, as the
// person their owner added: same id, role, password and date.
func letIn(ctx context.Context, tx *sql.Tx, email string) error {
	var id string
	err := tx.QueryRowContext(ctx, `SELECT id FROM waiting_people WHERE email = ? ORDER BY created_at, id LIMIT 1`, email).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO users (id, account_id, email, password_hash, role, created_at, must_change)
		SELECT id, account_id, email, password_hash, role, created_at, must_change FROM waiting_people WHERE id = ?`, id); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `DELETE FROM waiting_people WHERE id = ?`, id)
	return err
}

// SetRole changes what someone may do. The last owner cannot be demoted, or
// the instance would have no one left to administer it.
func (s *Store) SetRole(ctx context.Context, account, id, role string) error {
	if role != RoleOwner && role != RoleViewer {
		return errors.New(`role must be "owner" or "viewer"`)
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	p, table, err := person(ctx, tx, account, id)
	if err != nil {
		return err
	}
	if role != RoleOwner {
		if err := lastOwner(ctx, tx, account, p); err != nil {
			return err
		}
	} else if p.Role != RoleOwner {
		if err := ownersFull(ctx, tx, account); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE `+table+` SET role = ? WHERE id = ? AND account_id = ?`, role, id, account); err != nil {
		return err
	}
	return tx.Commit()
}

// RemoveUser deletes an account and every session it holds. The same last-owner
// rule applies: an instance always keeps someone who can administer it. Their
// address is free again, for anyone waiting for it.
func (s *Store) RemoveUser(ctx context.Context, account, id string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	p, table, err := person(ctx, tx, account, id)
	if err != nil {
		return err
	}
	if err := lastOwner(ctx, tx, account, p); err != nil {
		return err
	}
	if table == "waiting_people" {
		if _, err := tx.ExecContext(ctx, `DELETE FROM waiting_people WHERE id = ? AND account_id = ?`, id, account); err != nil {
			return err
		}
		return tx.Commit()
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM auth_sessions WHERE user_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM users WHERE id = ? AND account_id = ?`, id, account); err != nil {
		return err
	}
	if err := letIn(ctx, tx, p.Email); err != nil {
		return err
	}
	return tx.Commit()
}

// lastOwner reports ErrLastOwner when p is its account's only owner left.
// Owners still waiting count: they are listed as owners, and answering
// differently for them would say their address is taken elsewhere.
func lastOwner(ctx context.Context, tx *sql.Tx, account string, p Person) error {
	if p.Role != RoleOwner {
		return nil
	}
	var owners int
	if err := tx.QueryRowContext(ctx, `SELECT (SELECT count(*) FROM users WHERE role = ? AND account_id = ?) + (SELECT count(*) FROM waiting_people WHERE role = ? AND account_id = ?)`,
		RoleOwner, account, RoleOwner, account).Scan(&owners); err != nil {
		return err
	}
	if owners <= 1 {
		return ErrLastOwner
	}
	return nil
}

// SetMustChange marks whether someone must choose their own password at their
// next sign-in: yes after one was chosen for them, no once they have.
func (s *Store) SetMustChange(ctx context.Context, id string, must bool) error {
	v := 0
	if must {
		v = 1
	}
	if _, err := s.DB.ExecContext(ctx, `UPDATE users SET must_change = ? WHERE id = ?`, v, id); err != nil {
		return err
	}
	_, err := s.DB.ExecContext(ctx, `UPDATE waiting_people SET must_change = ? WHERE id = ?`, v, id)
	return err
}

// MustChange reports whether someone still has a password chosen for them.
func (s *Store) MustChange(ctx context.Context, id string) bool {
	var v int
	s.DB.QueryRowContext(ctx, `SELECT must_change FROM users WHERE id = ?`, id).Scan(&v)
	return v == 1
}

// PersonByID is one person of an account, for acting on them, whether they
// have joined or are still waiting.
func (s *Store) PersonByID(ctx context.Context, account, id string) (Person, error) {
	p, _, err := person(ctx, s.DB, account, id)
	return p, err
}

// ResetPersonPassword gives one person of an account a new password and ends
// their sessions. By id within the account, never by address: someone
// waiting shares theirs with a person in another account.
func (s *Store) ResetPersonPassword(ctx context.Context, account, id, password string) error {
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, table, err := person(ctx, tx, account, id)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE `+table+` SET password_hash = ? WHERE id = ? AND account_id = ?`, hash, id, account); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM auth_sessions WHERE user_id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}
