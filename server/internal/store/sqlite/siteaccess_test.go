package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/trckable/trckable/server/internal/auth"
)

// A viewer can be limited to some sites and given every site again; an owner
// cannot be limited; the limits of a person who becomes an owner go.
func TestViewerSiteAccess(t *testing.T) {
	ctx := context.Background()
	s, err := Open(ctx, filepath.Join(t.TempDir(), "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	one, _ := s.CreateSite(ctx, DefaultAccount, "one.com", "")
	if _, err := s.CreateSite(ctx, DefaultAccount, "two.com", ""); err != nil {
		t.Fatal(err)
	}
	owner, err := s.AddUser(ctx, DefaultAccount, "owner@a.com", "a long enough password", RoleOwner)
	if err != nil {
		t.Fatal(err)
	}
	v, err := s.AddUser(ctx, DefaultAccount, "v@x.com", "a long enough password", RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetAccess(ctx, DefaultAccount, v.ID, []string{one, one}); err != nil {
		t.Fatal(err)
	}
	list, _ := s.AccessList(ctx, DefaultAccount)
	if len(list) != 1 || len(list[0].Sites) != 1 || list[0].Sites[0] != one {
		t.Fatalf("list: %+v", list)
	}
	got, err := s.ViewerSites(ctx, DefaultAccount, v.ID)
	if err != nil || len(got) != 1 || !got[one] {
		t.Fatalf("limited: %v %v", got, err)
	}
	if err := s.SetAccess(ctx, DefaultAccount, owner.ID, []string{}); !errors.Is(err, ErrAccessOwner) {
		t.Errorf("an owner: %v", err)
	}
	if err := s.SetAccess(ctx, DefaultAccount, "usr_nobody", nil); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("an unknown person: %v", err)
	}
	if err := s.SetAccess(ctx, DefaultAccount, v.ID, []string{"tkb_unknown"}); !errors.Is(err, ErrAccessSite) {
		t.Errorf("an unknown site: %v", err)
	}
	if err := s.SetAccess(ctx, DefaultAccount, v.ID, nil); err != nil {
		t.Fatal(err)
	}
	if got, err := s.ViewerSites(ctx, DefaultAccount, v.ID); err != nil || got != nil {
		t.Errorf("unlimited again: %v %v", got, err)
	}
	if err := s.SetAccess(ctx, DefaultAccount, v.ID, []string{}); err != nil {
		t.Fatal(err)
	}
	if err := s.SetRole(ctx, DefaultAccount, v.ID, RoleOwner); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = s.DB.QueryRowContext(ctx, `SELECT count(*) FROM site_access WHERE subject = ?`, v.ID).Scan(&n)
	if n != 0 {
		t.Errorf("a new owner kept their limits")
	}
}
