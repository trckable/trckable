package sqlite

import (
	"context"
	"errors"
	"testing"

	"github.com/trckable/trckable/server/internal/auth"
)

// Adding an address that is someone in another account answers exactly like
// adding a new one; the person waits, and joins with the password their owner
// was given the moment the address is free. Nothing done to them while
// waiting touches the other account's person.
func TestAddressUsedElsewhereWaits(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	a, _, err := s.CreateAccountWithOwner(ctx, "boss@a.com")
	if err != nil {
		t.Fatal(err)
	}
	b, _, err := s.CreateAccountWithOwner(ctx, "boss@b.com")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddUser(ctx, a.ID, "them@x.com", "their own password A", RoleViewer); err != nil {
		t.Fatal(err)
	}

	fresh, err := s.AddUser(ctx, b.ID, "new@x.com", "a password for new", RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	waiting, err := s.AddUser(ctx, b.ID, "Them@X.com", "a password for them", RoleViewer)
	if err != nil {
		t.Fatalf("an address used in another account was refused: %v", err)
	}
	if waiting.Email != "them@x.com" || waiting.Role != fresh.Role || len(waiting.ID) != len(fresh.ID) {
		t.Fatalf("answered differently: %+v and %+v", waiting, fresh)
	}
	for _, e := range []string{"new@x.com", "them@x.com"} {
		if _, err := s.AddUser(ctx, b.ID, e, "a password for again", RoleViewer); !errors.Is(err, auth.ErrExists) {
			t.Fatalf("%s twice on the same account: %v", e, err)
		}
	}
	s.SetMustChange(ctx, fresh.ID, true)
	s.SetMustChange(ctx, waiting.ID, true)
	list, _ := s.People(ctx, b.ID)
	if len(list) != 3 {
		t.Fatalf("list %+v", list)
	}
	for _, p := range list[1:] {
		if p.Name != "" || p.TwoStep || p.LastSeen != 0 || !p.MustChange || p.Role != RoleViewer {
			t.Fatalf("listed differently: %+v", p)
		}
	}
	if acc, _ := s.Accounts(ctx); acc[1].Viewers != 2 {
		t.Fatalf("the account's count leaves someone out: %+v", acc[1])
	}

	// Acting on them acts on the one waiting, never on the other account's.
	if p, err := s.PersonByID(ctx, b.ID, waiting.ID); err != nil || p.Email != "them@x.com" {
		t.Fatalf("by id: %+v %v", p, err)
	}
	if err := s.ResetPersonPassword(ctx, b.ID, waiting.ID, "a reset password for them"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetRole(ctx, b.ID, waiting.ID, RoleOwner); err != nil {
		t.Fatal(err)
	}
	u, err := s.Login(ctx, "them@x.com", "their own password A")
	if err != nil || u.AccountID != a.ID || u.Role != RoleViewer {
		t.Fatalf("the other account's person changed: %+v %v", u, err)
	}
	if _, err := s.PersonByID(ctx, a.ID, waiting.ID); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("seen from the other account: %v", err)
	}

	// Free the address: they join the account that added them, as added.
	people, _ := s.People(ctx, a.ID)
	for _, p := range people {
		if p.Email == "them@x.com" {
			if err := s.RemoveUser(ctx, a.ID, p.ID); err != nil {
				t.Fatal(err)
			}
		}
	}
	u, err = s.Login(ctx, "them@x.com", "a reset password for them")
	if err != nil || u.AccountID != b.ID || u.ID != waiting.ID || u.Role != RoleOwner {
		t.Fatalf("did not join once free: %+v %v", u, err)
	}
	if !s.MustChange(ctx, u.ID) {
		t.Fatal("a password chosen by their owner must still be replaced at first sign-in")
	}
	if list, _ := s.People(ctx, b.ID); len(list) != 3 {
		t.Fatalf("joining changed the list: %+v", list)
	}
}

// Deleting an account frees its addresses for whoever waits; someone removed
// while waiting never joins, and a deleted account's waiting people go with it.
func TestDeletedAccountLetsWaitingPeopleIn(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	a, _, _ := s.CreateAccountWithOwner(ctx, "boss@a.com")
	b, _, _ := s.CreateAccountWithOwner(ctx, "boss@b.com")
	c, _, _ := s.CreateAccountWithOwner(ctx, "boss@c.com")
	if _, err := s.AddUser(ctx, a.ID, "them@x.com", "their own password A", RoleViewer); err != nil {
		t.Fatal(err)
	}
	gone, _ := s.AddUser(ctx, b.ID, "them@x.com", "a password from b!", RoleViewer)
	if _, err := s.AddUser(ctx, c.ID, "them@x.com", "a password from c!", RoleViewer); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddUser(ctx, c.ID, "boss@b.com", "a password for boss", RoleViewer); err != nil {
		t.Fatal(err)
	}
	if err := s.RemoveUser(ctx, b.ID, gone.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteAccount(ctx, a.ID); err != nil {
		t.Fatal(err)
	}
	if u, err := s.Login(ctx, "them@x.com", "a password from c!"); err != nil || u.AccountID != c.ID {
		t.Fatalf("not let in to the account still waiting for them: %+v %v", u, err)
	}
	if err := s.DeleteAccount(ctx, c.ID); err != nil {
		t.Fatalf("an account with someone waiting must still delete: %v", err)
	}
	if err := s.DeleteAccount(ctx, b.ID); err != nil {
		t.Fatal(err)
	}
	if u, err := s.Login(ctx, "boss@b.com", "a password for boss"); err == nil {
		t.Fatalf("a deleted account's waiting person got in: %+v", u)
	}
}
