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
	// ErrNotMember: the person is not in that account.
	ErrNotMember = errors.New("not a member of that account")
	// ErrTooManyAccounts caps how many accounts one person can be in.
	ErrTooManyAccounts = errors.New("a person can be in at most 50 accounts")
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

// MaxAccounts is how many accounts one person can be in.
const MaxAccounts = 50

// viewOf is the person as they act in an account: the account and the role
// of that membership. With no account named, the fallback in choose applies;
// a person with no membership at all is not signed in (auth.ErrNotFound), and
// a named account they are not in is ErrNotMember.
func viewOf(ctx context.Context, q dbtx, u User, want string) (User, error) {
	var last string
	if err := q.QueryRowContext(ctx, `SELECT last_account FROM users WHERE id = ?`, u.ID).Scan(&last); err != nil {
		return User{}, err
	}
	list, err := membershipsOf(ctx, q, u.ID)
	if err != nil {
		return User{}, err
	}
	if len(list) == 0 {
		return User{}, auth.ErrNotFound
	}
	if want != "" {
		for _, m := range list {
			if m.Account == want {
				u.AccountID, u.Role = m.Account, m.Role
				return u, nil
			}
		}
		return User{}, ErrNotMember
	}
	m, _ := choose(list, last)
	u.AccountID, u.Role = m.Account, m.Role
	return u, nil
}

// In is the person acting in one account they belong to: its role, never the
// role they have elsewhere. An account they are not in is ErrNotMember.
func (s *Store) In(ctx context.Context, u User, account string) (User, error) {
	return viewOf(ctx, s.DB, u, account)
}

// SetLastAccount remembers the account a person used last: the one that
// opens when nothing names another. A preference, nothing more; an account
// they are not in is ErrNotMember.
func (s *Store) SetLastAccount(ctx context.Context, user, account string) error {
	res, err := s.DB.ExecContext(ctx, `UPDATE users SET last_account = ? WHERE id = ? AND EXISTS (SELECT 1 FROM memberships WHERE user_id = ? AND account_id = ?)`, account, user, user, account)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotMember
	}
	return nil
}

// JoinAccount makes an existing person a member of another account. Where
// they already are, nothing changes. At most MaxAccounts accounts a person.
func (s *Store) JoinAccount(ctx context.Context, user, account, role string) error {
	if role != RoleOwner && role != RoleViewer {
		return errors.New(`role must be "owner" or "viewer"`)
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	list, err := membershipsOf(ctx, tx, user)
	if err != nil {
		return err
	}
	if len(list) == 0 {
		return auth.ErrNotFound
	}
	for _, m := range list {
		if m.Account == account {
			return nil
		}
	}
	if len(list) >= MaxAccounts {
		return ErrTooManyAccounts
	}
	if err := addMembership(ctx, tx, user, account, role, nowUnix()); err != nil {
		return err
	}
	return tx.Commit()
}

// Leave takes a person out of one account, for themselves: the same rules as
// removing them (the first owner and the only owner cannot), and the last
// account takes the person with it.
func (s *Store) Leave(ctx context.Context, user, account string) error {
	err := s.RemoveUser(ctx, account, user)
	if errors.Is(err, auth.ErrNotFound) {
		return ErrNotMember
	}
	return err
}

// AccountCard is one account a person belongs to, as the switcher shows it.
type AccountCard struct {
	ID string
	// Name is the account's first owner: their name, else their address.
	Name string
	Role string
	// Holder: this person is the account's first owner, who cannot leave it.
	Holder bool
	Sites  []SiteRow // the sites this person sees there, the first few
	Total  int       // how many they see there in all
}

// AccountCards lists every account a person belongs to, oldest first, with
// the sites they see in each (first few only).
func (s *Store) AccountCards(ctx context.Context, user string, few int) ([]AccountCard, error) {
	list, err := s.Memberships(ctx, user)
	if err != nil {
		return nil, err
	}
	out := make([]AccountCard, 0, len(list))
	for _, m := range list {
		c := AccountCard{ID: m.Account, Role: m.Role}
		err := s.DB.QueryRowContext(ctx, `SELECT COALESCE(NULLIF(u.name, ''), u.email) FROM memberships m JOIN users u ON u.id = m.user_id
			WHERE m.account_id = ? AND m.role = ? ORDER BY m.created_at, m.rowid LIMIT 1`, m.Account, RoleOwner).Scan(&c.Name)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
		holder, err := holderOf(ctx, s.DB, m.Account)
		if err != nil {
			return nil, err
		}
		c.Holder = holder == user
		sites, err := s.ListSites(ctx, m.Account)
		if err != nil {
			return nil, err
		}
		seen, err := s.ViewerSites(ctx, m.Account, user)
		if err != nil {
			return nil, err
		}
		for _, r := range sites {
			if seen != nil && !seen[r.ID] {
				continue
			}
			c.Total++
			if len(c.Sites) < few {
				c.Sites = append(c.Sites, r)
			}
		}
		out = append(out, c)
	}
	return out, nil
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

// holderOf is the first owner of an account: its oldest owner membership
// (by when the membership was made, then by insertion order). It is derived,
// not stored, so it follows the roles: if the operator steps the first owner
// down (SetRoleAsOperator), the next oldest owner is the first owner until
// they are an owner again, when the original is (their membership is still
// the oldest). The cases are in TestTheFirstOwnerFollowsTheRoles.
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
