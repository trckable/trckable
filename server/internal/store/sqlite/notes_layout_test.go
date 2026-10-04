package sqlite

import (
	"context"
	"path/filepath"
	"testing"
)

// Migrations 34 and 35 on a server that already has notes and share links:
// old notes keep their words with no author, and every old link stops
// showing notes until its owner turns them on (off is the safe default).
func TestNotesAndLayoutMigrations(t *testing.T) {
	ctx := context.Background()
	st, err := Open(ctx, filepath.Join(t.TempDir(), "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	// Back to the schema before these two, with a note and a link on it.
	if _, err := st.DB.ExecContext(ctx, `DROP TABLE surges; ALTER TABLE annotations DROP COLUMN planned; ALTER TABLE widgets DROP COLUMN texts; ALTER TABLE widgets DROP COLUMN lang; ALTER TABLE widgets DROP COLUMN name; DROP TABLE known_devices; DROP TABLE memberships; ALTER TABLE users DROP COLUMN last_account; DROP TABLE site_access; DROP TABLE site_layout; ALTER TABLE annotations DROP COLUMN author_id; ALTER TABLE site_shares DROP COLUMN notes; ALTER TABLE invitations DROP COLUMN sent_at; ALTER TABLE invitations DROP COLUMN sends; DROP TABLE milestone_shares; DROP TABLE milestone_seen; DROP TABLE milestones; ALTER TABLE sites DROP COLUMN milestones; ALTER TABLE sites DROP COLUMN milestones_day; ALTER TABLE users DROP COLUMN avatar_at; ALTER TABLE site_shares DROP COLUMN token_enc; PRAGMA user_version = 33`); err != nil {
		t.Fatal(err)
	}
	site, err := st.CreateSite(ctx, DefaultAccount, "old.com", "Old")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.ExecContext(ctx, `INSERT INTO annotations (id, site_id, day, text, created_at) VALUES ('note_old', ?, '2026-01-02', 'Old launch', 1)`, site); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.ExecContext(ctx, `INSERT INTO site_shares (id, site_id, token_hash, created_at) VALUES ('shr_old', ?, 'h', 1)`, site); err != nil {
		t.Fatal(err)
	}
	// The owner's address list came later still: it goes last, because the sites are read with it.
	if _, err := st.DB.ExecContext(ctx, `DROP TABLE report_schedules; DROP TABLE sso_links; DROP TABLE site_share_look; ALTER TABLE auth_sessions DROP COLUMN via; ALTER TABLE site_settings DROP COLUMN exclude_ips`); err != nil {
		t.Fatal(err)
	}
	if err := st.MigrateTo(ctx, len(migrations)); err != nil {
		t.Fatal(err)
	}
	notes, err := st.Annotations(ctx, site, "2026-01-01", "2026-12-31")
	if err != nil || len(notes) != 1 || notes[0].Text != "Old launch" || notes[0].Author != "" {
		t.Fatalf("the old note: %v %v", notes, err)
	}
	shares, err := st.Shares(ctx, site)
	if err != nil || len(shares) != 1 || shares[0].Notes {
		t.Fatalf("the old link shows notes by default: %v %v", shares, err)
	}
	l, err := st.SiteLayoutOf(ctx, DefaultAccount)
	if err != nil || len(l.Order) != 0 {
		t.Fatalf("a fresh layout: %v %v", l, err)
	}
}
