package sqlite

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
)

func TestBellRead(t *testing.T) {
	ctx := context.Background()
	s, err := Open(ctx, filepath.Join(t.TempDir(), "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	u, err := s.CompleteSetup(ctx, "a@example.com", "correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if got, err := s.BellRead(ctx, u.ID); err != nil || len(got) != 0 {
		t.Fatalf("a new person has read nothing: %v %v", got, err)
	}
	if err := s.MarkBellRead(ctx, u.ID, []string{"down:1", "mile:visits:100"}, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.MarkBellRead(ctx, u.ID, []string{"down:1", "up:1"}, 20); err != nil {
		t.Fatal(err)
	}
	got, _ := s.BellRead(ctx, u.ID)
	if len(got) != 3 || got[0] != "up:1" {
		t.Fatalf("read list: %v", got)
	}
	if err := s.MarkBellRead(ctx, u.ID, []string{""}, 1); err != ErrBellRead {
		t.Fatalf("an empty id: %v", err)
	}
	many := make([]string, 0, bellPerPut)
	for round := 0; round < 4; round++ {
		many = many[:0]
		for i := 0; i < bellPerPut; i++ {
			many = append(many, fmt.Sprintf("n:%d:%d", round, i))
		}
		if err := s.MarkBellRead(ctx, u.ID, many, int64(100+round)); err != nil {
			t.Fatal(err)
		}
	}
	got, _ = s.BellRead(ctx, u.ID)
	if len(got) != bellKeep {
		t.Fatalf("kept %d, want %d", len(got), bellKeep)
	}
	for _, id := range got {
		if id == "down:1" {
			t.Fatal("the oldest marks should have gone")
		}
	}
}
