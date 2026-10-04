package sqlite

import (
	"context"
	"errors"
	"testing"

	"github.com/trckable/trckable/server/internal/auth"
)

func TestSessionsRememberTheProviderTheySignedInWith(t *testing.T) {
	ctx := context.Background()
	s := openT(t)
	p, err := s.AddUser(ctx, DefaultAccount, "Ada@Example.com", "a long enough password", RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	u, err := s.UserByEmail(ctx, "  ada@EXAMPLE.com ")
	if err != nil || u.ID != p.ID || u.Role != RoleViewer || u.AccountID != DefaultAccount {
		t.Fatalf("by email: %+v %v", u, err)
	}
	if _, err := s.UserByEmail(ctx, "ada@example.org"); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("someone else's address: %v", err)
	}
	if u, err := s.UserByID(ctx, p.ID); err != nil || u.Email != "ada@example.com" {
		t.Fatalf("by id: %+v %v", u, err)
	}
	via, err := s.CreateSessionVia(ctx, p.ID, "google")
	if err != nil {
		t.Fatal(err)
	}
	pw, err := s.CreateSession(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got, err := s.SessionUser(ctx, via); err != nil || got.SignedInWith != "google" || got.Role != RoleViewer {
		t.Fatalf("the provider's session: %+v %v", got, err)
	}
	if got, err := s.SessionUser(ctx, pw); err != nil || got.SignedInWith != "" {
		t.Fatalf("a password session: %+v %v", got, err)
	}
}

func TestLinkSSOKeepsOnePersonPerProviderId(t *testing.T) {
	ctx := context.Background()
	s := openT(t)
	a, _ := s.AddUser(ctx, DefaultAccount, "a@example.com", "a long enough password", RoleViewer)
	b, _ := s.AddUser(ctx, DefaultAccount, "b@example.com", "a long enough password", RoleViewer)
	const iss = "https://idp.example"
	if err := s.LinkSSO(ctx, a.ID, iss, "sub-a"); err != nil {
		t.Fatal(err)
	}
	if err := s.LinkSSO(ctx, a.ID, iss, "sub-a"); err != nil {
		t.Fatalf("the same id again: %v", err)
	}
	if err := s.LinkSSO(ctx, a.ID, iss, "sub-other"); !errors.Is(err, ErrNotTheSamePerson) {
		t.Fatalf("another id for the same person: %v", err)
	}
	if err := s.LinkSSO(ctx, b.ID, iss, "sub-a"); !errors.Is(err, ErrNotTheSamePerson) {
		t.Fatalf("an id that is someone else's: %v", err)
	}
	if err := s.LinkSSO(ctx, b.ID, "https://other.example", "sub-a"); err != nil {
		t.Fatalf("the same id at another issuer is another id: %v", err)
	}
}

func TestCheckSSOLinkRecordsNothing(t *testing.T) {
	ctx := context.Background()
	s := openT(t)
	a, _ := s.AddUser(ctx, DefaultAccount, "a@example.com", "a long enough password", RoleViewer)
	b, _ := s.AddUser(ctx, DefaultAccount, "b@example.com", "a long enough password", RoleViewer)
	const iss = "https://idp.example"
	if err := s.CheckSSOLink(ctx, a.ID, iss, "sub-x"); err != nil {
		t.Fatalf("a first sight: %v", err)
	}
	var n int
	if err := s.DB.QueryRow(`SELECT count(*) FROM sso_links`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("a check recorded %d links (%v)", n, err)
	}
	if err := s.LinkSSO(ctx, a.ID, iss, "sub-a"); err != nil {
		t.Fatal(err)
	}
	if err := s.CheckSSOLink(ctx, a.ID, iss, "sub-a"); err != nil {
		t.Fatalf("the linked id: %v", err)
	}
	if err := s.CheckSSOLink(ctx, a.ID, iss, "sub-x"); !errors.Is(err, ErrNotTheSamePerson) {
		t.Fatalf("another id for the person: %v", err)
	}
	if err := s.CheckSSOLink(ctx, b.ID, iss, "sub-a"); !errors.Is(err, ErrNotTheSamePerson) {
		t.Fatalf("an id that is someone else's: %v", err)
	}
}

func TestLinksAreClearedWithAPasswordResetOrOnRequest(t *testing.T) {
	ctx := context.Background()
	s := openT(t)
	owner, _ := s.AddUser(ctx, DefaultAccount, "o@example.com", "a long enough password", RoleOwner)
	a, _ := s.AddUser(ctx, DefaultAccount, "a@example.com", "a long enough password", RoleViewer)
	b, _ := s.AddUser(ctx, DefaultAccount, "b@example.com", "a long enough password", RoleViewer)
	const iss = "https://idp.example"
	for _, id := range []string{a.ID, b.ID, owner.ID} {
		if err := s.LinkSSO(ctx, id, iss, "sub-"+id); err != nil {
			t.Fatal(err)
		}
	}
	count := func(id string) (n int) {
		t.Helper()
		if err := s.DB.QueryRow(`SELECT count(*) FROM sso_links WHERE user_id = ?`, id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if err := s.ResetPersonPassword(ctx, DefaultAccount, a.ID, "another long enough password"); err != nil {
		t.Fatal(err)
	}
	if count(a.ID) != 0 || count(b.ID) != 1 {
		t.Fatalf("an owner's reset: a %d, b %d links", count(a.ID), count(b.ID))
	}
	if err := s.ResetPassword(ctx, "b@example.com", "another long enough password"); err != nil {
		t.Fatal(err)
	}
	if count(b.ID) != 0 || count(owner.ID) != 1 {
		t.Fatalf("the command-line reset: b %d, owner %d links", count(b.ID), count(owner.ID))
	}
	if err := s.ClearSSOLinks(ctx, owner.ID); err != nil || count(owner.ID) != 0 {
		t.Fatalf("clear: %v, %d links", err, count(owner.ID))
	}
}

func TestIsOwnerAnywhere(t *testing.T) {
	ctx := context.Background()
	s := openT(t)
	v, _ := s.AddUser(ctx, DefaultAccount, "v@example.com", "a long enough password", RoleViewer)
	if own, err := s.IsOwnerAnywhere(ctx, v.ID); err != nil || own {
		t.Fatalf("a viewer: %v %v", own, err)
	}
	other, err := s.CreateAccount(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.Exec(`INSERT INTO memberships (user_id, account_id, role, created_at) VALUES (?, ?, ?, 1)`, v.ID, other, RoleOwner); err != nil {
		t.Fatal(err)
	}
	if own, err := s.IsOwnerAnywhere(ctx, v.ID); err != nil || !own {
		t.Fatalf("an owner of another account: %v %v", own, err)
	}
}
