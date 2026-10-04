package sqlite

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
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

// A session starts only for the token the link has now: an opening that
// checked the old token just before a new address was made gets nothing.
func TestShareSessionNeedsTheCurrentToken(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	s.Sealer = mustBox(t, "race test key")
	site, _ := s.CreateSite(ctx, DefaultAccount, "a.com", "")
	_, old, err := s.CreateShare(ctx, site, "Board", "a long enough password", false, false, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	sh, err := s.OpenShare(ctx, old, "a long enough password", now) // the old token is checked
	if err != nil {
		t.Fatal(err)
	}
	fresh, err := s.RotateShare(ctx, site, sh.ID) // the owner makes a new address meanwhile
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.StartShareSession(ctx, sh.ID, old, now); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("a session started with the old token: %v", err)
	}
	var n int
	if err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM share_sessions`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("sessions left behind: %d %v", n, err)
	}
	if _, err := s.StartShareSession(ctx, sh.ID, fresh, now); err != nil {
		t.Fatalf("the new token: %v", err)
	}
	if _, err := s.StartShareSession(ctx, "shr_nothere", fresh, now); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("another link's id: %v", err)
	}
}

// A sealed token is bound to its own link: a sealed value that carries the
// right token but was made for another link (or for none) is not handed out.
func TestShareTokenSealedValueDoesNotOpenOnAnotherLink(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	box := mustBox(t, "bound seal key")
	s.Sealer = box
	site, _ := s.CreateSite(ctx, DefaultAccount, "a.com", "")
	sh, token, err := s.CreateShare(ctx, site, "Board", "", false, false, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	for name, context := range map[string]string{"another link": "shr_other", "no link": ""} {
		sealed, err := box.SealFor(token, context)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.DB.ExecContext(ctx, `UPDATE site_shares SET token_enc = ? WHERE id = ?`, sealed, sh.ID); err != nil {
			t.Fatal(err)
		}
		if list, err := s.Shares(ctx, site); err != nil || list[0].Token != "" {
			t.Fatalf("a token sealed for %s was handed out: %v %v", name, list, err)
		}
	}
	sealed, _ := box.SealFor(token, sh.ID)
	if _, err := s.DB.ExecContext(ctx, `UPDATE site_shares SET token_enc = ? WHERE id = ?`, sealed, sh.ID); err != nil {
		t.Fatal(err)
	}
	if list, err := s.Shares(ctx, site); err != nil || list[0].Token != token {
		t.Fatalf("its own seal did not open: %v %v", list, err)
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
	session, err := s.StartShareSession(ctx, sh.ID, old, now)
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
	if _, err := s.DB.ExecContext(ctx, `DROP TABLE surges; ALTER TABLE annotations DROP COLUMN planned; ALTER TABLE widgets DROP COLUMN texts; ALTER TABLE widgets DROP COLUMN lang; ALTER TABLE widgets DROP COLUMN name; DROP TABLE report_schedules; DROP TABLE site_share_look; DROP TABLE sso_links; ALTER TABLE auth_sessions DROP COLUMN via; ALTER TABLE site_settings DROP COLUMN exclude_ips; DROP TABLE known_devices; DROP TABLE memberships; ALTER TABLE users DROP COLUMN last_account; ALTER TABLE site_shares DROP COLUMN token_enc; PRAGMA user_version = 39`); err != nil {
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
