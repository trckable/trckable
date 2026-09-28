package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

// Renaming keeps what a view shows, and never reaches another site's views.
func TestRenameSegment(t *testing.T) {
	ctx := context.Background()
	s, err := Open(ctx, filepath.Join(t.TempDir(), "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	site, _ := s.CreateSite(ctx, DefaultAccount, "a.example.com", "")
	other, _ := s.CreateSite(ctx, DefaultAccount, "b.example.com", "")
	g, err := s.SaveSegment(ctx, site, "Germany", "country=DE")
	if err != nil {
		t.Fatal(err)
	}

	got, err := s.RenameSegment(ctx, site, g.ID, "  Germany, mobile  ")
	if err != nil || got.Name != "Germany, mobile" || got.Query != "country=DE" || got.Created != g.Created {
		t.Fatalf("rename: %+v %v", got, err)
	}
	if _, err := s.RenameSegment(ctx, site, g.ID, "   "); !errors.Is(err, ErrSegmentName) {
		t.Fatalf("an empty name must be refused, got %v", err)
	}
	if _, err := s.RenameSegment(ctx, other, g.ID, "Taken"); err == nil {
		t.Fatal("another site renamed this site's view")
	}
	list, _ := s.Segments(ctx, site)
	if len(list) != 1 || list[0].Name != "Germany, mobile" {
		t.Fatalf("list after rename: %+v", list)
	}
}
