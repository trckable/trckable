package sqlite

import (
	"context"
	"testing"
	"time"
)

// Migration 56: a site that existed is watched from the moment the migration
// ran, one added later from the day it was added.
func TestWatchedSinceMigration(t *testing.T) {
	ctx := context.Background()
	st := openT(t)
	old, _ := st.CreateSite(ctx, DefaultAccount, "old.com", "")
	fresh, _ := st.CreateSite(ctx, DefaultAccount, "fresh.com", "")
	before := time.Now().Unix()
	if _, err := st.DB.ExecContext(ctx, `UPDATE sites SET created_at = ? WHERE id = ?`, 1700000000, old); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.ExecContext(ctx, `UPDATE sites SET created_at = ? WHERE id = ?`, before+86400, fresh); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.ExecContext(ctx, `DROP TABLE site_watch; PRAGMA user_version = 55`); err != nil {
		t.Fatal(err)
	}
	if err := st.MigrateTo(ctx, len(migrations)); err != nil {
		t.Fatal(err)
	}
	if got, _ := st.SiteInfo(ctx, old); got.WatchedSince < before || got.WatchedSince > time.Now().Unix() {
		t.Fatalf("old site watched since %d", got.WatchedSince)
	}
	if got, _ := st.SiteInfo(ctx, fresh); got.WatchedSince != before+86400 {
		t.Fatalf("new site watched since %d", got.WatchedSince)
	}
	// A site added afterwards is watched from the moment it exists.
	next, _ := st.CreateSite(ctx, DefaultAccount, "next.com", "")
	if got, _ := st.SiteInfo(ctx, next); got.WatchedSince == 0 || got.WatchedSince != got.CreatedAt {
		t.Fatalf("created %d watched %d", got.CreatedAt, got.WatchedSince)
	}
}
