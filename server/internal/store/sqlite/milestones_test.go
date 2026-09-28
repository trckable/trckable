package sqlite

import (
	"context"
	"errors"
	"testing"

	"github.com/trckable/trckable/server/internal/auth"
)

// Storing the same milestones again adds nothing and changes nothing: the
// key is (site, kind, step).
func TestMilestonesAreStoredOnce(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	site, _ := s.CreateSite(ctx, DefaultAccount, "a.com", "")
	rows := []Milestone{{Kind: "visitors", Step: "100", Value: 100, Day: "2026-09-01", Quiet: true}, {Kind: "visitors", Step: "1000", Value: 1000, Day: "2026-09-20"}}
	added, err := s.AddMilestones(ctx, site, rows)
	if err != nil || len(added) != 2 {
		t.Fatalf("first: %v %v", added, err)
	}
	rows[0].Quiet, rows[0].Day = false, "2026-09-25"
	if added, err := s.AddMilestones(ctx, site, rows); err != nil || len(added) != 0 {
		t.Fatalf("again: %v %v", added, err)
	}
	list, _ := s.Milestones(ctx, site, "u1")
	if len(list) != 2 || list[1].Day != "2026-09-01" || list[1].New || !list[0].New {
		t.Fatalf("list: %+v", list)
	}
}

// Closing a moment is per person: another person still has it.
func TestClosingIsPerPerson(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	site, _ := s.CreateSite(ctx, DefaultAccount, "a.com", "")
	other, _ := s.CreateSite(ctx, DefaultAccount, "b.com", "")
	a, _ := s.AddUser(ctx, DefaultAccount, "a@a.com", "correct horse battery A", RoleOwner)
	b, _ := s.AddUser(ctx, DefaultAccount, "b@a.com", "correct horse battery B", RoleViewer)
	_, _ = s.AddMilestones(ctx, site, []Milestone{{Kind: "visitors", Step: "100", Value: 100, Day: "2026-09-01"}})
	_, _ = s.AddMilestones(ctx, other, []Milestone{{Kind: "visitors", Step: "100", Value: 100, Day: "2026-09-01"}})
	if err := s.CloseMilestones(ctx, site, a.ID, [][2]string{{"visitors", "100"}, {"nope", "1"}}); err != nil {
		t.Fatal(err)
	}
	la, _ := s.Milestones(ctx, site, a.ID)
	lb, _ := s.Milestones(ctx, site, b.ID)
	lo, _ := s.Milestones(ctx, other, a.ID)
	if la[0].New || !lb[0].New || !lo[0].New {
		t.Fatalf("a %+v b %+v other site %+v", la, lb, lo)
	}
	if none, _ := s.Milestones(ctx, site, ""); none[0].New {
		t.Fatal("nothing is new to an API key")
	}
}

// A link opens its one milestone until it is revoked, the site goes, or
// milestones are turned off. Only the hash of its token is stored.
func TestMilestoneLinks(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	site, _ := s.CreateSite(ctx, DefaultAccount, "a.com", "")
	_, _ = s.AddMilestones(ctx, site, []Milestone{{Kind: "revenue", Step: "1000", Value: 1000, Currency: "EUR", Day: "2026-09-01"}})
	if _, err := s.ShareMilestone(ctx, site, "visitors", "100", false); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("a milestone that is not there: %v", err)
	}
	token, err := s.ShareMilestone(ctx, site, "revenue", "1000", true)
	if err != nil || len(token) != 43 {
		t.Fatalf("token %q: %v", token, err)
	}
	var stored int
	_ = s.DB.QueryRow(`SELECT count(*) FROM milestone_shares WHERE token_hash = ?`, token).Scan(&stored)
	if stored != 0 {
		t.Fatal("the token itself is stored")
	}
	if _, err := s.ShareMilestone(ctx, site, "revenue", "1000", false); !errors.Is(err, ErrShared) {
		t.Fatalf("a second link: %v", err)
	}
	m, err := s.MilestoneByToken(ctx, token)
	if err != nil || m.Domain != "a.com" || !m.Amount || m.Value != 1000 {
		t.Fatalf("open: %+v %v", m, err)
	}
	if _, err := s.MilestoneByToken(ctx, token[:42]+"x"); err == nil {
		t.Fatal("a wrong token opens something")
	}
	_ = s.SetMilestonesOn(ctx, site, false)
	if _, err := s.MilestoneByToken(ctx, token); err == nil {
		t.Fatal("milestones off, the link still opens")
	}
	_ = s.SetMilestonesOn(ctx, site, true)
	if err := s.RevokeMilestoneShare(ctx, site, "revenue", "1000"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.MilestoneByToken(ctx, token); err == nil {
		t.Fatal("a revoked link still opens")
	}
	token, _ = s.ShareMilestone(ctx, site, "revenue", "1000", false)
	if _, err := s.DeleteSite(ctx, site); err != nil {
		t.Fatal(err)
	}
	if _, err := s.MilestoneByToken(ctx, token); err == nil {
		t.Fatal("a deleted site's link still opens")
	}
}
