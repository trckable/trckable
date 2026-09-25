package server

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/trckable/trckable/server/internal/backup"
	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Restored is what a restore brought back, so the command can say it.
type Restored struct {
	Sites, People int
	Events        int64
	Analytics     bool // false for a backup taken while the server held the store
}

// Restore turns a backup file into a data directory trckabled starts from:
// the control database under its own name, the analytics loaded back into a
// DuckDB file, and the write-ahead log the writer replays from its watermark.
// dir must be empty; on any failure it is left empty again.
func Restore(ctx context.Context, file, dir string, key []byte) (res Restored, err error) {
	// Armed before unpacking: a file that fails halfway (disk full, a damaged
	// entry after the tag check) must not leave half a data directory behind.
	defer func() {
		if err != nil {
			clearDir(dir)
		}
	}()
	if err := backup.Restore(file, dir, key); err != nil {
		return res, err
	}
	c := config.Config{DataDir: dir}

	// The control plane: renamed into place, then opened once so an older
	// backup is migrated now rather than on first boot.
	if err := os.Rename(filepath.Join(dir, "control.db"), c.SQLitePath()); err != nil {
		return res, fmt.Errorf("the backup has no control database: %w", err)
	}
	ctl, err := sqlite.Open(ctx, c.SQLitePath())
	if err != nil {
		return res, fmt.Errorf("open the restored control database: %w", err)
	}
	ctl.DB.QueryRowContext(ctx, `SELECT count(*) FROM sites`).Scan(&res.Sites)
	ctl.DB.QueryRowContext(ctx, `SELECT count(*) FROM users`).Scan(&res.People)
	ctl.Close()

	// The analytics, when the backup has them. Without them the WAL still
	// holds every event it kept, and the writer replays it from zero.
	export := filepath.Join(dir, "analytics")
	if _, err := os.Stat(export); err == nil {
		st, err := duck.Open(ctx, c.DuckPath(), duck.Options{})
		if err != nil {
			return res, err
		}
		if _, err := st.Import(ctx, export); err != nil {
			st.Close()
			return res, err
		}
		st.DB.QueryRowContext(ctx, `SELECT count(*) FROM events`).Scan(&res.Events)
		if err := st.Close(); err != nil {
			return res, err
		}
		res.Analytics = true
		// Visitor data: readable by this user only, like everything else here.
		if err := os.Chmod(c.DuckPath(), 0o600); err != nil {
			return res, err
		}
		if err := os.RemoveAll(export); err != nil {
			return res, err
		}
	}
	return res, nil
}

// clearDir empties dir without removing it: it was empty before the restore.
func clearDir(dir string) {
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		os.RemoveAll(filepath.Join(dir, e.Name()))
	}
}

// ErrNoKey is returned when a restore has no way to know the backup's key.
var ErrNoKey = errors.New("no key for this backup: set TRCKABLE_SECRET to the secret of the instance that wrote it, " +
	"or TRCKABLE_DATA_DIR to its old data directory (which holds secret.key)")
