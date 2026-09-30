package sqlite

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/secrets"
)

// A link's token is kept sealed with the instance key, so its owner can copy
// the address again, and is never stored in the clear.
func TestShareTokenIsSealedAndComesBack(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	box, err := secrets.New([]byte("share token test key"))
	if err != nil {
		t.Fatal(err)
	}
	s.Sealer = box
	site, _ := s.CreateSite(ctx, DefaultAccount, "a.com", "")
	_, token, err := s.CreateShare(ctx, site, "Board", "", true, false, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	var stored string
	if err := s.DB.QueryRowContext(ctx, `SELECT token_enc FROM site_shares`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(stored, "v1:") || strings.Contains(stored, token) {
		t.Fatalf("the token is stored as it is, or not sealed: %q", stored)
	}
	list, err := s.Shares(ctx, site)
	if err != nil || len(list) != 1 || list[0].Token != token {
		t.Fatalf("the token did not come back: %v %v", list, err)
	}
	// The link still opens by its hash.
	if _, err := s.OpenShare(ctx, token, "", time.Now()); err != nil {
		t.Fatalf("open: %v", err)
	}
}

// Without the key that sealed it, a token reads as not kept: the list never
// fails, and never hands out something it cannot vouch for.
func TestShareTokenWithAnotherKeyOrNoKey(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	first, _ := secrets.New([]byte("the first instance key"))
	s.Sealer = first
	site, _ := s.CreateSite(ctx, DefaultAccount, "a.com", "")
	if _, _, err := s.CreateShare(ctx, site, "Board", "", false, false, nil, nil); err != nil {
		t.Fatal(err)
	}
	for name, sealer := range map[string]Sealer{"another key": mustBox(t, "a different instance key"), "no key": nil} {
		s.Sealer = sealer
		list, err := s.Shares(ctx, site)
		if err != nil || len(list) != 1 || list[0].Token != "" {
			t.Fatalf("%s: %v %v", name, list, err)
		}
	}
	// A sealed value moved from one link to another is not taken for its token.
	s.Sealer = first
	if _, _, err := s.CreateShare(ctx, site, "Second", "", false, false, nil, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.ExecContext(ctx, `UPDATE site_shares SET token_enc = (SELECT token_enc FROM site_shares WHERE name = 'Board') WHERE name = 'Second'`); err != nil {
		t.Fatal(err)
	}
	list, _ := s.Shares(ctx, site)
	for _, sh := range list {
		if sh.Name == "Second" && sh.Token != "" {
			t.Fatal("a swapped token was handed out as this link's address")
		}
	}
}

func mustBox(t *testing.T, key string) Sealer {
	t.Helper()
	b, err := secrets.New([]byte(key))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// A new address ends the old one and every session opened through it.
func TestRotateShareEndsTheOldAddress(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	s.Sealer = mustBox(t, "rotate test key")
	site, _ := s.CreateSite(ctx, DefaultAccount, "a.com", "")
	sh, old, err := s.CreateShare(ctx, site, "Board", "a long enough password", true, true, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	session, err := s.StartShareSession(ctx, sh.ID, now)
	if err != nil {
		t.Fatal(err)
	}
	fresh, err := s.RotateShare(ctx, site, sh.ID)
	if err != nil || fresh == old || len(fresh) != len(old) {
		t.Fatalf("rotate: %q %v", fresh, err)
	}
	if _, err := s.OpenShare(ctx, old, "a long enough password", now); err == nil {
		t.Fatal("the old address still opens")
	}
	if _, err := s.ShareOf(ctx, session, now); err == nil {
		t.Fatal("a session from the old address still reads")
	}
	got, err := s.OpenShare(ctx, fresh, "a long enough password", now)
	if err != nil || got.ID != sh.ID || !got.Revenue || !got.Notes || !got.HasPass {
		t.Fatalf("the new address: %v %v", got, err)
	}
	if list, _ := s.Shares(ctx, site); len(list) != 1 || list[0].Token != fresh {
		t.Fatalf("the list does not carry the new token: %v", list)
	}
	// Another site's link, and one that is not there, are not rotated.
	other, _ := s.CreateSite(ctx, DefaultAccount, "b.com", "")
	if _, err := s.RotateShare(ctx, other, sh.ID); err == nil {
		t.Fatal("a link was rotated through another site")
	}
	if _, err := s.RotateShare(ctx, site, "shr_nothere"); err == nil {
		t.Fatal("a link that does not exist was rotated")
	}
}

// Links made before token_enc have none: migration 40 adds the column empty,
// and such a link lists with no token and still opens.
func TestShareTokenMigration(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	s.Sealer = mustBox(t, "migration test key")
	site, _ := s.CreateSite(ctx, DefaultAccount, "a.com", "")
	if _, err := s.DB.ExecContext(ctx, `ALTER TABLE site_shares DROP COLUMN token_enc; PRAGMA user_version = 39`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO site_shares (id, site_id, name, token_hash, created_at) VALUES ('shr_old', ?, 'Old', 'h', 1)`, site); err != nil {
		t.Fatal(err)
	}
	if err := s.MigrateTo(ctx, len(migrations)); err != nil {
		t.Fatal(err)
	}
	list, err := s.Shares(ctx, site)
	if err != nil || len(list) != 1 || list[0].ID != "shr_old" || list[0].Token != "" {
		t.Fatalf("the old link: %v %v", list, err)
	}
	if _, err := s.RotateShare(ctx, site, "shr_old"); err != nil {
		t.Fatalf("a link from before can get a new address: %v", err)
	}
	if list, _ := s.Shares(ctx, site); list[0].Token == "" {
		t.Fatal("the new address was not kept")
	}
}
