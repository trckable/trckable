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
}

// People lists an account's people, oldest first — which is the owner, on any
// account that started with one person.
func (s *Store) People(ctx context.Context, account string) ([]Person, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, email, COALESCE(name, ''), role, created_at, totp_enabled FROM users WHERE account_id = ? ORDER BY created_at`, account)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Person
	for rows.Next() {
		var p Person
		var two int
		if err := rows.Scan(&p.ID, &p.Email, &p.Name, &p.Role, &p.CreatedAt, &two); err != nil {
			return nil, err
		}
		p.TwoStep = two == 1
		out = append(out, p)
	}
	return out, rows.Err()
}

// AddUser adds a person to an account with the given role.
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
	if role == RoleOwner {
		if err := ownersFull(ctx, s.DB, account); err != nil {
			return Person{}, err
		}
	}
	p := Person{ID: auth.Token("usr_", 10), Email: email, Role: role, CreatedAt: time.Now().Unix()}
	_, err = s.DB.ExecContext(ctx, `INSERT INTO users (id, account_id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		p.ID, account, p.Email, hash, p.Role, p.CreatedAt)
	if err != nil && strings.Contains(err.Error(), "UNIQUE") {
		return Person{}, auth.ErrExists
	}
	return p, err
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
	if role != RoleOwner {
		if err := lastOwner(ctx, tx, account, id); err != nil {
			return err
		}
	} else {
		var cur string
		if err := tx.QueryRowContext(ctx, `SELECT role FROM users WHERE id = ? AND account_id = ?`, id, account).Scan(&cur); err == nil && cur != RoleOwner {
			if err := ownersFull(ctx, tx, account); err != nil {
				return err
			}
		}
	}
	res, err := tx.ExecContext(ctx, `UPDATE users SET role = ? WHERE id = ? AND account_id = ?`, role, id, account)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return tx.Commit()
}

// RemoveUser deletes an account and every session it holds. The same last-owner
// rule applies: an instance always keeps someone who can administer it.
func (s *Store) RemoveUser(ctx context.Context, account, id string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := lastOwner(ctx, tx, account, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM auth_sessions WHERE user_id = (SELECT id FROM users WHERE id = ? AND account_id = ?)`, id, account); err != nil {
		return err
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM users WHERE id = ? AND account_id = ?`, id, account)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return tx.Commit()
}

// lastOwner reports ErrLastOwner when id is its account's only owner left, and
// ErrNotFound when id is not in the account at all.
func lastOwner(ctx context.Context, tx *sql.Tx, account, id string) error {
	var role string
	if err := tx.QueryRowContext(ctx, `SELECT role FROM users WHERE id = ? AND account_id = ?`, id, account).Scan(&role); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return auth.ErrNotFound
		}
		return err
	}
	if role != RoleOwner {
		return nil
	}
	var owners int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM users WHERE role = ? AND account_id = ?`, RoleOwner, account).Scan(&owners); err != nil {
		return err
	}
	if owners <= 1 {
		return ErrLastOwner
	}
	return nil
}
