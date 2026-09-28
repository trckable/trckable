package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

func TestUserKeymap(t *testing.T) {
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
	if km, err := s.UserKeymap(ctx, u.ID); err != nil || len(km) != 0 {
		t.Fatalf("a new person has the defaults: %v %v", km, err)
	}
	if err := s.SetUserKeymap(ctx, u.ID, Keymap{"period.today": "d", "ask": "mod+j"}); err != nil {
		t.Fatal(err)
	}
	km, _ := s.UserKeymap(ctx, u.ID)
	if km["period.today"] != "d" || km["ask"] != "mod+j" {
		t.Fatalf("keymap not kept: %v", km)
	}
	for name, bad := range map[string]Keymap{
		"two actions on one key": {"period.today": "d", "compare": "d"},
		"not an action":          {"<script>": "d"},
		"not a key":              {"ask": "mod+shift+ctrl+k"},
	} {
		if err := s.SetUserKeymap(ctx, u.ID, bad); !errors.Is(err, ErrKeymap) {
			t.Errorf("%s: want ErrKeymap, got %v", name, err)
		}
	}
	if err := s.SetUserKeymap(ctx, u.ID, Keymap{}); err != nil {
		t.Fatal(err)
	}
	if km, _ := s.UserKeymap(ctx, u.ID); len(km) != 0 {
		t.Fatalf("reset should bring the defaults back: %v", km)
	}
}
