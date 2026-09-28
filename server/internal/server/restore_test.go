package server

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/trckable/trckable/server/internal/backup"
	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// A backup restores into a directory the server opens as it is: the control
// database under its real name, the analytics loaded back into DuckDB.
func TestRestoreMakesAWorkingDataDir(t *testing.T) {
	ctx := context.Background()
	src := config.Config{DataDir: t.TempDir()}
	ctl, err := sqlite.Open(ctx, src.SQLitePath())
	if err != nil {
		t.Fatal(err)
	}
	site, err := ctl.CreateSite(ctx, sqlite.DefaultAccount, "example.com", "Example")
	if err != nil {
		t.Fatal(err)
	}
	st, err := duck.Open(ctx, src.DuckPath(), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.ExecContext(ctx, `
		INSERT INTO events (seq, site_id, kind, ts, visitor_id, session_id, path)
		SELECT i + 1, ?, 1, TIMESTAMP '2026-09-01' + INTERVAL (i) MINUTE, i % 9, i % 13, '/'
		FROM range(500) t(i)`, site); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.ExecContext(ctx, `UPDATE ingest_state SET hwm = 500`); err != nil {
		t.Fatal(err)
	}
	key := make([]byte, 32)
	res, err := backup.Run(ctx, backup.Store{DataDir: src.DataDir, Ctl: ctl.DB, Duck: st.DB, Key: key}, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	ctl.Close()
	st.Close()

	dir := t.TempDir()
	got, err := Restore(ctx, res.Path, dir, key)
	if err != nil {
		t.Fatal(err)
	}
	if got.Sites != 1 || got.Events != 500 || !got.Analytics {
		t.Fatalf("restored %+v", got)
	}
	dst := config.Config{DataDir: dir}
	for _, p := range []string{dst.SQLitePath(), dst.DuckPath()} {
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("missing %s", filepath.Base(p))
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "analytics")); err == nil {
		t.Fatal("the export was left behind")
	}
	again, err := duck.Open(ctx, dst.DuckPath(), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer again.Close()
	if hwm, _ := again.HWM(ctx); hwm != 500 {
		t.Fatalf("watermark %d: the writer would replay what is already there", hwm)
	}

	// A wrong key leaves the directory as empty as it was.
	bad := t.TempDir()
	if _, err := Restore(ctx, res.Path, bad, make([]byte, 32)[:31]); err == nil {
		t.Fatal("restored with a short key")
	}
	wrong := make([]byte, 32)
	wrong[0] = 1
	if _, err := Restore(ctx, res.Path, bad, wrong); err == nil {
		t.Fatal("restored with the wrong key")
	}
	if entries, _ := os.ReadDir(bad); len(entries) != 0 {
		t.Fatalf("left behind: %v", entries)
	}
}
