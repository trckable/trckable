package sqlite

import (
	"context"
	"testing"
)

func TestGoalLabelsAreKeptAndFollowTheLatestName(t *testing.T) {
	ctx := context.Background()
	st := openT(t)
	site, _ := st.CreateSite(ctx, DefaultAccount, "a.com", "")
	other, _ := st.CreateSite(ctx, DefaultAccount, "b.com", "")
	st.NoteGoalLabel(ctx, site, "start-free", "Start free")
	st.NoteGoalLabel(ctx, site, "start-free", "Start free") // same name: nothing to write
	st.NoteGoalLabel(ctx, other, "start-free", "START FREE")
	st.NoteGoalLabel(ctx, site, "këtu", "Këtu")
	st.NoteGoalLabel(ctx, site, "empty", "")
	got, err := st.GoalLabels(ctx, site)
	if err != nil || len(got) != 2 || got["start-free"] != "Start free" || got["këtu"] != "Këtu" {
		t.Fatalf("labels %v %v", got, err)
	}
	st.NoteGoalLabel(ctx, site, "start-free", "Start Free")
	got, _ = st.GoalLabels(ctx, site)
	if got["start-free"] != "Start Free" {
		t.Fatalf("latest name: %v", got)
	}
	if o, _ := st.GoalLabels(ctx, other); o["start-free"] != "START FREE" {
		t.Fatalf("another site's: %v", o)
	}
	if st.GoalLabel(site, "start-free") != "Start Free" || st.GoalLabel(site, "unknown") != "unknown" {
		t.Fatal("live lookup")
	}
}

// Migration 54 adds the table without touching what is there, and a site's
// removal takes its labels with it.
func TestGoalLabelsMigration(t *testing.T) {
	ctx := context.Background()
	st := openT(t)
	site, _ := st.CreateSite(ctx, DefaultAccount, "a.com", "")
	if _, err := st.DB.ExecContext(ctx, `DROP TABLE goal_labels; DROP TABLE site_probe; DROP TABLE site_probe_log; DROP TABLE pay_notices; DROP TABLE bell_read; ALTER TABLE pay_hints DROP COLUMN from_plan; ALTER TABLE pay_hints DROP COLUMN to_plan; ALTER TABLE pay_hints DROP COLUMN country; ALTER TABLE pay_payments DROP COLUMN country; ALTER TABLE mentions DROP COLUMN state; ALTER TABLE mentions DROP COLUMN via; ALTER TABLE mentions DROP COLUMN link; DROP TABLE IF EXISTS rejected_hosts; ALTER TABLE sites DROP COLUMN setup_mail_at; PRAGMA user_version = 53`); err != nil {
		t.Fatal(err)
	}
	if err := st.MigrateTo(ctx, len(migrations)); err != nil {
		t.Fatal(err)
	}
	if have, want, _ := st.Schema(ctx); have != want || want < 54 {
		t.Fatalf("schema %d of %d", have, want)
	}
	st.NoteGoalLabel(ctx, site, "a", "A")
	if _, err := st.DeleteSite(ctx, site); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := st.DB.QueryRowContext(ctx, `SELECT count(*) FROM goal_labels`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("labels left %d %v", n, err)
	}
}
