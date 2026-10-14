package sqlite

import (
	"context"
	"testing"
	"time"
)

func TestFeedbackGoesWithItsPerson(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	a, err := s.AddUser(ctx, DefaultAccount, "a@x.com", "longenoughpass1", RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.AddUser(ctx, DefaultAccount, "b@x.com", "longenoughpass1", RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	if err := s.AddFeedback(ctx, a.ID, "", "/", "1", "from a", now); err != nil {
		t.Fatal(err)
	}
	if err := s.AddFeedback(ctx, b.ID, "", "/", "1", "from b", now); err != nil {
		t.Fatal(err)
	}
	if err := s.RemoveUser(ctx, DefaultAccount, a.ID); err != nil {
		t.Fatal(err)
	}
	list, _ := s.ListFeedback(ctx, 100)
	if len(list) != 1 || list[0].Message != "from b" {
		t.Fatalf("after removing a: %+v", list)
	}
}

func TestFeedbackGoesWithItsSite(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	u, err := s.AddUser(ctx, DefaultAccount, "a@x.com", "longenoughpass1", RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	gone, err := s.CreateSite(ctx, DefaultAccount, "gone.example.com", "")
	if err != nil {
		t.Fatal(err)
	}
	kept, err := s.CreateSite(ctx, DefaultAccount, "kept.example.com", "")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	for _, site := range []string{gone, kept, ""} {
		if err := s.AddFeedback(ctx, u.ID, site, "/", "1", "note "+site, now); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.DeleteSite(ctx, gone); err != nil {
		t.Fatal(err)
	}
	list, _ := s.ListFeedback(ctx, 100)
	if len(list) != 2 {
		t.Fatalf("notes after deleting a site = %d, want 2", len(list))
	}
}
