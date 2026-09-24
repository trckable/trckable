package sqlite

import (
	"context"
	"errors"
	"testing"

	"github.com/trckable/trckable/server/internal/auth"
)

// An account for a hosting provider's customer, from creation to deletion.
func TestOperatorAccountLifecycle(t *testing.T) {
	s := openT(t)
	ctx := context.Background()

	a, owner, err := s.CreateAccountWithOwner(ctx, " Them@Company.com ")
	if err != nil {
		t.Fatal(err)
	}
	if owner.Email != "them@company.com" || owner.Role != RoleOwner || a.State != StateActive {
		t.Fatalf("created %+v with %+v", a, owner)
	}
	if _, err := s.Login(ctx, "them@company.com", ""); err == nil {
		t.Fatal("the owner of a hosted account must have no password that works")
	}
	if _, _, err := s.CreateAccountWithOwner(ctx, "them@company.com"); !errors.Is(err, auth.ErrExists) {
		t.Fatalf("a second account for the same email: %v", err)
	}

	list, err := s.Accounts(ctx)
	if err != nil || len(list) != 1 || list[0].ID != a.ID || list[0].Owner != "them@company.com" || list[0].Owners != 1 {
		t.Fatalf("list %+v %v (the default account never appears)", list, err)
	}

	// Team members: owners are limited, viewers never.
	if err := s.SetMaxMembers(ctx, a.ID, 2); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddUser(ctx, a.ID, "second@company.com", "a long enough password", RoleOwner); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddUser(ctx, a.ID, "third@company.com", "a long enough password", RoleOwner); !errors.Is(err, ErrMemberLimit) {
		t.Fatalf("a third owner on a plan for two: %v", err)
	}
	v, err := s.AddUser(ctx, a.ID, "viewer@company.com", "a long enough password", RoleViewer)
	if err != nil {
		t.Fatalf("viewers are never limited: %v", err)
	}
	if err := s.SetRole(ctx, a.ID, v.ID, RoleOwner); !errors.Is(err, ErrMemberLimit) {
		t.Fatalf("promoting a viewer past the limit: %v", err)
	}
	if err := s.SetMaxMembers(ctx, a.ID, 0); err != nil {
		t.Fatal(err)
	}
	if err := s.SetRole(ctx, a.ID, v.ID, RoleOwner); err != nil {
		t.Fatalf("no limit: %v", err)
	}

	// Suspending signs everyone out.
	tok, err := s.CreateSession(ctx, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetAccountState(ctx, a.ID, "paused"); !errors.Is(err, ErrBadState) {
		t.Fatalf("unknown state: %v", err)
	}
	if err := s.SetAccountState(ctx, a.ID, StateSuspended); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SessionUser(ctx, tok); err == nil {
		t.Fatal("a session outlived its account's suspension")
	}
	if got := s.AccountState(ctx, a.ID); got != StateSuspended {
		t.Fatalf("state %q", got)
	}

	// The default account is not the operator's to manage.
	for name, err := range map[string]error{
		"limits": s.SetMaxMembers(ctx, DefaultAccount, 1),
		"state":  s.SetAccountState(ctx, DefaultAccount, StateSuspended),
		"delete": s.DeleteAccount(ctx, DefaultAccount),
	} {
		if !errors.Is(err, ErrDefaultAccount) {
			t.Errorf("%s on the default account: %v", name, err)
		}
	}

	// Deleting: sites first, then the account and everyone in it.
	site, err := s.CreateSite(ctx, a.ID, "company.com", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteAccount(ctx, a.ID); err == nil {
		t.Fatal("deleted an account that still has a site")
	}
	if _, err := s.DeleteSite(ctx, site); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteAccount(ctx, a.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.Accounts(ctx); len(list) != 0 {
		t.Fatalf("still listed: %+v", list)
	}
	if people, _ := s.People(ctx, a.ID); len(people) != 0 {
		t.Fatalf("people outlived their account: %+v", people)
	}
	if _, _, err := s.CreateAccountWithOwner(ctx, "them@company.com"); err != nil {
		t.Fatalf("the email is free again after deletion: %v", err)
	}
}
