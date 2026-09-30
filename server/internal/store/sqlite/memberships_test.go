package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/auth"
)

const testPassword = "a long enough password"

// seeded is a person the upgrade test puts in place before the memberships
// exist.
type seeded struct {
	id, email, account, role string
	at                       int64
	sites                    []string // a site limit, when not nil
}

// A database left at the last schema before memberships upgrades, and every
// person keeps exactly their account, their role and their site access:
// owners, viewers, limited viewers, two accounts and a pending invitation.
func TestUpgradeToMembershipsKeepsEveryone(t *testing.T) {
	ctx := context.Background()
	all := migrations
	defer func() { migrations = all }()
	path := filepath.Join(t.TempDir(), "trckable.db")

	if len(all) < 41 || !strings.Contains(all[40], "CREATE TABLE memberships") {
		t.Fatal("migration 41 must be the one that makes memberships")
	}
	migrations = all[:40]
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=foreign_keys(ON)")
	if err != nil {
		t.Fatal(err)
	}
	if err := (&Store{DB: db}).migrate(ctx); err != nil {
		t.Fatal(err)
	}
	hash, err := auth.HashPasswordCtx(ctx, testPassword)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`INSERT INTO accounts (id, created_at) VALUES ('acc_b', 5)`,
		`INSERT INTO sites (id, account_id, domain, name, created_at) VALUES ('s1', 'acc_default', 'one.com', 'one', 1), ('s2', 'acc_default', 'two.com', 'two', 1), ('s3', 'acc_b', 'three.com', 'three', 1)`,
		`INSERT INTO invitations (id, account_id, email, role, created_at, expires_at) VALUES ('inv_1', 'acc_default', 'later@x.com', 'viewer', 10, 99999999999)`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	people := []seeded{
		{id: "u1", email: "owner@a.com", account: DefaultAccount, role: RoleOwner, at: 100},
		{id: "u2", email: "co@a.com", account: DefaultAccount, role: RoleOwner, at: 100},
		{id: "u3", email: "all@a.com", account: DefaultAccount, role: RoleViewer, at: 120},
		{id: "u4", email: "some@a.com", account: DefaultAccount, role: RoleViewer, at: 130, sites: []string{"s2"}},
		{id: "u5", email: "none@a.com", account: DefaultAccount, role: RoleViewer, at: 140, sites: []string{}},
		{id: "u6", email: "boss@b.com", account: "acc_b", role: RoleOwner, at: 150},
		{id: "u7", email: "read@b.com", account: "acc_b", role: RoleViewer, at: 160, sites: []string{"s3"}},
	}
	for _, p := range people {
		if _, err := db.Exec(`INSERT INTO users (id, account_id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
			p.id, p.account, p.email, hash, p.role, p.at); err != nil {
			t.Fatal(err)
		}
		if p.sites != nil {
			raw := "[]"
			if len(p.sites) > 0 {
				raw = `["` + p.sites[0] + `"]`
			}
			if _, err := db.Exec(`INSERT INTO site_access (subject, account_id, sites, updated_at) VALUES (?, ?, ?, 1)`, p.id, p.account, raw); err != nil {
				t.Fatal(err)
			}
		}
	}
	db.Close()

	migrations = all
	s, err := Open(ctx, path)
	if err != nil {
		t.Fatalf("upgrade: %v", err)
	}
	defer s.Close()
	var v int
	if err := s.DB.QueryRow(`PRAGMA user_version`).Scan(&v); err != nil || v != len(all) {
		t.Fatalf("schema %d, want %d (%v)", v, len(all), err)
	}

	for _, p := range people {
		ms, err := s.Memberships(ctx, p.id)
		if err != nil || len(ms) != 1 || ms[0].Account != p.account || ms[0].Role != p.role || ms[0].CreatedAt != p.at {
			t.Errorf("%s: memberships %+v %v", p.email, ms, err)
		}
		u, err := s.Login(ctx, p.email, testPassword)
		if err != nil || u.ID != p.id || u.AccountID != p.account || u.Role != p.role {
			t.Errorf("%s: sign-in gives %+v %v", p.email, u, err)
		}
		limit, err := s.ViewerSites(ctx, p.account, p.id)
		switch {
		case err != nil:
			t.Errorf("%s: sites %v", p.email, err)
		case p.sites == nil && limit != nil:
			t.Errorf("%s: limited to %v, was not", p.email, limit)
		case p.sites != nil && len(limit) != len(p.sites):
			t.Errorf("%s: sites %v, want %v", p.email, limit, p.sites)
		}
		for _, id := range p.sites {
			if !limit[id] {
				t.Errorf("%s: lost site %s", p.email, id)
			}
		}
	}
	for _, acc := range []string{DefaultAccount, "acc_b"} {
		list, err := s.People(ctx, acc)
		if err != nil {
			t.Fatal(err)
		}
		var got, want []string
		for _, p := range list {
			got = append(got, p.ID+":"+p.Role)
		}
		for _, p := range people {
			if p.account == acc {
				want = append(want, p.id+":"+p.role)
			}
		}
		sort.Strings(got)
		sort.Strings(want)
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%s: people %v, want %v", acc, got, want)
		}
	}
	// The first owner is the oldest: the one who was listed first.
	if list, _ := s.People(ctx, DefaultAccount); len(list) == 0 || list[0].ID != "u1" || !list[0].Holder {
		t.Errorf("the holder of the default account: %+v", list)
	}
	if list, _ := s.People(ctx, "acc_b"); len(list) == 0 || list[0].ID != "u6" || !list[0].Holder {
		t.Errorf("the holder of the other account: %+v", list)
	}
	// What was there stays: the invitation, and the mirror on every user.
	var n int
	if err := s.DB.QueryRow(`SELECT count(*) FROM invitations WHERE id = 'inv_1'`).Scan(&n); err != nil || n != 1 {
		t.Errorf("the invitation: %d %v", n, err)
	}
	var last string
	for _, p := range people {
		var acc, role string
		if err := s.DB.QueryRow(`SELECT account_id, role, last_account FROM users WHERE id = ?`, p.id).Scan(&acc, &role, &last); err != nil || acc != p.account || role != p.role || last != "" {
			t.Errorf("%s: user row %s %s %q %v", p.email, acc, role, last, err)
		}
	}
}

func membersT(t *testing.T) (*Store, string) {
	t.Helper()
	s := openT(t)
	other, err := s.CreateAccount(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return s, other
}

// join puts an existing person into a second account, the way a later
// version's invitations will.
func join(t *testing.T, s *Store, user, account, role string, at int64) {
	t.Helper()
	tx, err := s.DB.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if err := addMembership(context.Background(), tx, user, account, role, at); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
}

// The role a person acts with is the membership's. The user row only mirrors
// it: a wrong mirror changes nothing about access.
func TestRoleComesFromTheMembership(t *testing.T) {
	ctx := context.Background()
	s := openT(t)
	if _, err := s.AddUser(ctx, DefaultAccount, "boss@a.com", testPassword, RoleOwner); err != nil {
		t.Fatal(err)
	}
	v, err := s.AddUser(ctx, DefaultAccount, "read@a.com", testPassword, RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	// The mirror claims an owner in a different account; the membership says
	// viewer in the default one.
	if _, err := s.DB.Exec(`UPDATE users SET role = 'owner', account_id = 'acc_nowhere' WHERE id = ?`, v.ID); err == nil {
		t.Fatal("the mirror must still be a real account")
	}
	if _, err := s.DB.Exec(`UPDATE users SET role = 'owner' WHERE id = ?`, v.ID); err != nil {
		t.Fatal(err)
	}
	tok, err := s.CreateSession(ctx, v.ID)
	if err != nil {
		t.Fatal(err)
	}
	u, err := s.SessionUser(ctx, tok)
	if err != nil || u.Role != RoleViewer || u.AccountID != DefaultAccount {
		t.Fatalf("session: %+v %v", u, err)
	}
	if list, _ := s.People(ctx, DefaultAccount); len(list) != 2 || list[1].Role != RoleViewer {
		t.Fatalf("people: %+v", list)
	}
	if _, err := s.PersonByID(ctx, DefaultAccount, v.ID); err != nil {
		t.Fatal(err)
	}
	// Someone with no membership is not signed in, whatever the user row says.
	if _, err := s.DB.Exec(`DELETE FROM memberships WHERE user_id = ?`, v.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SessionUser(ctx, tok); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("a person with no membership: %v", err)
	}
	if _, err := s.Login(ctx, "read@a.com", testPassword); !errors.Is(err, auth.ErrBadLogin) {
		t.Fatalf("sign-in with no membership: %v", err)
	}
}

// Writes keep the mirror: the user row shows the oldest membership.
func TestTheMirrorFollowsTheOldestMembership(t *testing.T) {
	ctx := context.Background()
	s, other := membersT(t)
	p, err := s.AddUser(ctx, DefaultAccount, "a@a.com", testPassword, RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	mirror := func() (string, string) {
		var acc, role string
		if err := s.DB.QueryRow(`SELECT account_id, role FROM users WHERE id = ?`, p.ID).Scan(&acc, &role); err != nil {
			t.Fatal(err)
		}
		return acc, role
	}
	if acc, role := mirror(); acc != DefaultAccount || role != RoleViewer {
		t.Fatalf("new person: %s %s", acc, role)
	}
	join(t, s, p.ID, other, RoleOwner, p.CreatedAt+10)
	if acc, role := mirror(); acc != DefaultAccount || role != RoleViewer {
		t.Fatalf("a newer membership must not move the home: %s %s", acc, role)
	}
	if err := s.SetRole(ctx, DefaultAccount, p.ID, RoleOwner); err == nil {
		// Not the only owner there? There is none but them: fine, owner now.
		if _, role := mirror(); role != RoleOwner {
			t.Fatalf("role change not mirrored: %s", role)
		}
	} else {
		t.Fatal(err)
	}
}

// Removing one membership leaves the rest; the last removal deletes the person.
func TestRemovingOneMembership(t *testing.T) {
	ctx := context.Background()
	s, other := membersT(t)
	if _, err := s.AddUser(ctx, DefaultAccount, "boss@a.com", testPassword, RoleOwner); err != nil {
		t.Fatal(err)
	}
	p, err := s.AddUser(ctx, DefaultAccount, "p@a.com", testPassword, RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	site, err := s.CreateSite(ctx, DefaultAccount, "one.com", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetAccess(ctx, DefaultAccount, p.ID, []string{site}); err != nil {
		t.Fatal(err)
	}
	join(t, s, p.ID, other, RoleViewer, p.CreatedAt+10)
	if _, err := s.DB.Exec(`INSERT INTO users (id, account_id, email, password_hash, role, created_at) VALUES ('usr_o', ?, 'o@b.com', 'x', 'owner', 1)`, other); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.Exec(`INSERT INTO memberships (user_id, account_id, role, created_at) VALUES ('usr_o', ?, 'owner', 1)`, other); err != nil {
		t.Fatal(err)
	}
	tok, _ := s.CreateSession(ctx, p.ID)
	if err := s.SetAccess(ctx, other, p.ID, []string{}); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = s.DB.QueryRow(`SELECT count(*) FROM site_access WHERE subject = ?`, p.ID).Scan(&n)
	if n != 2 {
		t.Fatalf("a limit in each account: %d", n)
	}

	if err := s.RemoveUser(ctx, DefaultAccount, p.ID); err != nil {
		t.Fatal(err)
	}
	_ = s.DB.QueryRow(`SELECT count(*) FROM site_access WHERE subject = ? AND account_id = ?`, p.ID, DefaultAccount).Scan(&n)
	if n != 0 {
		t.Error("the limit in the account they left stayed")
	}
	_ = s.DB.QueryRow(`SELECT count(*) FROM site_access WHERE subject = ? AND account_id = ?`, p.ID, other).Scan(&n)
	if n != 1 {
		t.Error("the limit in the other account went too")
	}
	u, err := s.SessionUser(ctx, tok)
	if err != nil || u.AccountID != other {
		t.Fatalf("their session must stay and open the account they still have: %+v %v", u, err)
	}
	var acc string
	if err := s.DB.QueryRow(`SELECT account_id FROM users WHERE id = ?`, p.ID).Scan(&acc); err != nil || acc != other {
		t.Fatalf("the mirror after the first removal: %q %v", acc, err)
	}
	if err := s.RemoveUser(ctx, DefaultAccount, p.ID); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("removing twice: %v", err)
	}
	if err := s.RemoveUser(ctx, other, p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SessionUser(ctx, tok); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("the last membership takes the person and their sessions: %v", err)
	}
	_ = s.DB.QueryRow(`SELECT count(*) FROM users WHERE id = ?`, p.ID).Scan(&n)
	if n != 0 {
		t.Error("the person stayed after their last membership")
	}
}

// The first owner is not removed and not made a viewer by anyone but the
// operator; the only owner is never either.
func TestTheFirstOwnerStays(t *testing.T) {
	ctx := context.Background()
	s := openT(t)
	first, err := s.AddUser(ctx, DefaultAccount, "first@a.com", testPassword, RoleOwner)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.RemoveUser(ctx, DefaultAccount, first.ID); !errors.Is(err, ErrLastOwner) {
		t.Fatalf("the only owner: %v", err)
	}
	second, err := s.AddUser(ctx, DefaultAccount, "second@a.com", testPassword, RoleOwner)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.RemoveUser(ctx, DefaultAccount, first.ID); !errors.Is(err, ErrHolder) {
		t.Fatalf("removing the first owner: %v", err)
	}
	if err := s.SetRole(ctx, DefaultAccount, first.ID, RoleViewer); !errors.Is(err, ErrHolder) {
		t.Fatalf("demoting the first owner: %v", err)
	}
	if ok, err := s.Holder(ctx, DefaultAccount, first.ID); err != nil || !ok {
		t.Fatalf("holder: %v %v", ok, err)
	}
	// The second owner may step down or be removed; the holder may not.
	if err := s.SetRole(ctx, DefaultAccount, second.ID, RoleViewer); err != nil {
		t.Fatal(err)
	}
	if err := s.SetRole(ctx, DefaultAccount, second.ID, RoleOwner); err != nil {
		t.Fatal(err)
	}
	// The command line on the server may still.
	if err := s.SetRoleAsOperator(ctx, DefaultAccount, first.ID, RoleViewer); err != nil {
		t.Fatalf("operator demotes the first owner: %v", err)
	}
	if err := s.RemoveUserAsOperator(ctx, DefaultAccount, second.ID); !errors.Is(err, ErrLastOwner) {
		t.Fatalf("the operator never removes the only owner: %v", err)
	}
}

// Someone's password is reset by an owner only if all of their memberships are
// in the owner's account.
func TestResetNeedsAPersonWhollyInTheAccount(t *testing.T) {
	ctx := context.Background()
	s, other := membersT(t)
	p, err := s.AddUser(ctx, DefaultAccount, "p@a.com", testPassword, RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	if only, err := s.OnlyInAccount(ctx, p.ID, DefaultAccount); err != nil || !only {
		t.Fatalf("one account: %v %v", only, err)
	}
	if err := s.ResetPersonPassword(ctx, DefaultAccount, p.ID, "another long password"); err != nil {
		t.Fatal(err)
	}
	join(t, s, p.ID, other, RoleViewer, p.CreatedAt+10)
	if only, _ := s.OnlyInAccount(ctx, p.ID, DefaultAccount); only {
		t.Fatal("in two accounts")
	}
	if err := s.ResetPersonPassword(ctx, DefaultAccount, p.ID, "yet another long password"); !errors.Is(err, ErrElsewhere) {
		t.Fatalf("reset across accounts: %v", err)
	}
	if _, err := s.Login(ctx, "p@a.com", "another long password"); err != nil {
		t.Fatalf("the refused reset changed the password: %v", err)
	}
	// Not in the account at all: not found, as for an id that is not there.
	out, err := s.AddUser(ctx, other, "q@b.com", testPassword, RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.ResetPersonPassword(ctx, DefaultAccount, out.ID, "yet another long password"); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("someone of another account: %v", err)
	}
}

// Which account opens when nothing says: the one used last, then the oldest
// where they own, then the oldest.
func TestWhichMembershipOpens(t *testing.T) {
	list := []Membership{{"a", RoleViewer, 1}, {"b", RoleOwner, 2}, {"c", RoleOwner, 3}}
	for _, c := range []struct{ last, want string }{{"", "b"}, {"c", "c"}, {"a", "a"}, {"gone", "b"}} {
		if m, ok := choose(list, c.last); !ok || m.Account != c.want {
			t.Errorf("last %q: %s, want %s", c.last, m.Account, c.want)
		}
	}
	if m, ok := choose([]Membership{{"a", RoleViewer, 1}, {"b", RoleViewer, 2}}, ""); !ok || m.Account != "a" {
		t.Errorf("the oldest when none is an owner: %+v", m)
	}
	if _, ok := choose(nil, "a"); ok {
		t.Error("nothing to choose")
	}
}

// The first owner is derived from the roles: the oldest owner membership. The
// operator stepping them down hands the place to the next oldest owner; making
// them an owner again gives it back, since their membership is still the oldest.
func TestTheFirstOwnerFollowsTheRoles(t *testing.T) {
	ctx := context.Background()
	s := openT(t)
	first, _ := s.AddUser(ctx, DefaultAccount, "first@a.com", testPassword, RoleOwner)
	second, _ := s.AddUser(ctx, DefaultAccount, "second@a.com", testPassword, RoleOwner)
	// Two owners with the same creation second: insertion order still decides.
	if _, err := s.DB.Exec(`UPDATE memberships SET created_at = 100`); err != nil {
		t.Fatal(err)
	}
	holder := func() string {
		t.Helper()
		id, err := holderOf(ctx, s.DB, DefaultAccount)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	if holder() != first.ID {
		t.Fatalf("the first owner is %s", holder())
	}
	if err := s.SetRoleAsOperator(ctx, DefaultAccount, first.ID, RoleViewer); err != nil {
		t.Fatal(err)
	}
	if holder() != second.ID {
		t.Fatal("the next owner is the first owner while the original is a viewer")
	}
	if err := s.RemoveUser(ctx, DefaultAccount, second.ID); !errors.Is(err, ErrLastOwner) {
		t.Fatalf("they are the only owner now: %v", err)
	}
	if err := s.SetRole(ctx, DefaultAccount, first.ID, RoleOwner); err != nil {
		t.Fatal(err)
	}
	if holder() != first.ID {
		t.Fatal("the original is the first owner again")
	}
	if err := s.SetRole(ctx, DefaultAccount, second.ID, RoleViewer); err != nil {
		t.Fatalf("the newer owner steps down: %v", err)
	}
}

// Turning off someone's two-step needs them wholly inside the account, checked
// with the change.
func TestDisableTwoStepInChecksTheMemberships(t *testing.T) {
	ctx := context.Background()
	s, other := membersT(t)
	p, err := s.AddUser(ctx, DefaultAccount, "p@a.com", testPassword, RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	on := func() bool {
		var n int
		_ = s.DB.QueryRow(`SELECT totp_enabled FROM users WHERE id = ?`, p.ID).Scan(&n)
		return n == 1
	}
	if _, err := s.DB.Exec(`UPDATE users SET totp_enabled = 1, totp_secret = 'x' WHERE id = ?`, p.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.DisableTwoStepIn(ctx, other, p.ID); !errors.Is(err, auth.ErrNotFound) || !on() {
		t.Fatalf("someone of another account: %v", err)
	}
	join(t, s, p.ID, other, RoleViewer, p.CreatedAt+10)
	if err := s.DisableTwoStepIn(ctx, DefaultAccount, p.ID); !errors.Is(err, ErrElsewhere) || !on() {
		t.Fatalf("someone in two accounts: %v", err)
	}
	if err := s.RemoveUser(ctx, other, p.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.DisableTwoStepIn(ctx, DefaultAccount, p.ID); err != nil || on() {
		t.Fatalf("someone in one account: %v", err)
	}
}
