package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// Site access: a viewer may be limited to some of the account's sites.
//
// A row in site_access names its subject (a viewer's user id) and the only
// sites that subject may see. No row: every site of the account. An empty
// list: none. Owners are never limited: making someone an owner drops their
// row.
//
// The API enforces it in one place per kind of read: the site guard every
// /sites/{site} route passes, and the lists (sites, overview, site layout).

// MaxAccessSites caps one list: far more than any account holds.
const MaxAccessSites = 1000

var (
	// ErrAccessSite: a site in the list is not one of the account's.
	ErrAccessSite = errors.New("every site must be one of this account's")
	// ErrAccessOwner: owners see every site; only a viewer can be limited.
	ErrAccessOwner = errors.New("only a viewer can be limited to some sites")
)

// Access is one subject's sites: nil means every site of the account.
type Access struct {
	Subject string   `json:"id"`
	Email   string   `json:"email"`
	Role    string   `json:"role"`
	Sites   []string `json:"sites"`
}

// siteSet turns a stored list into a set. A list that cannot be read is an
// empty set: a broken row shows nothing rather than everything.
func siteSet(raw string) map[string]bool {
	var list []string
	if err := json.Unmarshal([]byte(raw), &list); err != nil {
		return map[string]bool{}
	}
	out := make(map[string]bool, len(list))
	for _, id := range list {
		out[id] = true
	}
	return out
}

// ViewerSites is the set of sites user id may see in account, or nil when
// they may see every one (an owner, or a viewer with no row). An error must
// be taken as "none".
func (s *Store) ViewerSites(ctx context.Context, account, id string) (map[string]bool, error) {
	var role string
	var raw sql.NullString
	err := s.DB.QueryRowContext(ctx, `SELECT u.role, x.sites FROM users u
		LEFT JOIN site_access x ON x.subject = u.id AND x.account_id = u.account_id
		WHERE u.id = ? AND u.account_id = ?`, id, account).Scan(&role, &raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, auth.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if role == RoleOwner || !raw.Valid {
		return nil, nil
	}
	return siteSet(raw.String), nil
}

// cleanAccessSites checks a list against the account's sites: known, no
// repeats, sorted.
func cleanAccessSites(ctx context.Context, tx *sql.Tx, account string, in []string) ([]string, error) {
	if len(in) > MaxAccessSites {
		return nil, ErrAccessSite
	}
	seen := map[string]bool{}
	out := []string{}
	for _, id := range in {
		id = strings.TrimSpace(id)
		if seen[id] {
			continue
		}
		var n int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM sites WHERE id = ? AND account_id = ?`, id, account).Scan(&n); err != nil {
			return nil, err
		}
		if n == 0 {
			return nil, ErrAccessSite
		}
		seen[id] = true
		out = append(out, id)
	}
	sort.Strings(out)
	return out, nil
}

// SetAccess limits a viewer of account to sites;
// nil sites gives them every site again. The subject must be a viewer in that
// account (ErrNotFound otherwise, ErrAccessOwner for an owner), and every
// site one of its own.
func (s *Store) SetAccess(ctx context.Context, account, subject string, sites []string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var role string
	err = tx.QueryRowContext(ctx, `SELECT role FROM users WHERE id = ? AND account_id = ?`, subject, account).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return auth.ErrNotFound
	}
	if err != nil {
		return err
	}
	if role != RoleViewer {
		return ErrAccessOwner
	}
	if sites == nil {
		if _, err := tx.ExecContext(ctx, `DELETE FROM site_access WHERE subject = ?`, subject); err != nil {
			return err
		}
		return tx.Commit()
	}
	list, err := cleanAccessSites(ctx, tx, account, sites)
	if err != nil {
		return err
	}
	raw, _ := json.Marshal(list)
	if _, err := tx.ExecContext(ctx, `INSERT INTO site_access (subject, account_id, sites, updated_at) VALUES (?, ?, ?, ?)
		ON CONFLICT (subject) DO UPDATE SET account_id = excluded.account_id, sites = excluded.sites, updated_at = excluded.updated_at`,
		subject, account, string(raw), time.Now().Unix()); err != nil {
		return err
	}
	return tx.Commit()
}

// AccessList is every viewer of account, with their sites (nil: every
// site). Owners are left out: they see everything.
func (s *Store) AccessList(ctx context.Context, account string) ([]Access, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT u.id, u.email, u.role, x.sites FROM users u
		LEFT JOIN site_access x ON x.subject = u.id AND x.account_id = u.account_id
		WHERE u.account_id = ? AND u.role = ?
		ORDER BY 2`, account, RoleViewer)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Access{}
	for rows.Next() {
		var a Access
		var raw sql.NullString
		if err := rows.Scan(&a.Subject, &a.Email, &a.Role, &raw); err != nil {
			return nil, err
		}
		if raw.Valid {
			a.Sites = []string{}
			for id := range siteSet(raw.String) {
				a.Sites = append(a.Sites, id)
			}
			sort.Strings(a.Sites)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// dropAccess forgets a subject's limits, inside a transaction.
func dropAccess(ctx context.Context, tx *sql.Tx, subject string) error {
	_, err := tx.ExecContext(ctx, `DELETE FROM site_access WHERE subject = ?`, subject)
	return err
}
