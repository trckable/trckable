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
