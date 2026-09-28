package server

import (
	"log/slog"
	"os"
	"path/filepath"
)

// privateFiles are the stores in the data directory. SQLite and DuckDB
// create their files with the process's default mode (0644 with the usual
// umask), and the control database holds password hashes, session hashes,
// two-step secrets and sealed provider keys: nobody but this server's user
// has a reason to read any of it.
var privateFiles = []string{"trckable.db", "trckable.db-wal", "trckable.db-shm", "trckable.duckdb", "trckable.duckdb.wal", "secret.key"}

// keepPrivate takes group and other permissions off the stores, for data
// directories made before this (or made by hand or by a volume mount, where
// trckable never chose the mode). SQLite gives its -wal and -shm files the
// database file's mode, so they stay private once it is.
func keepPrivate(dir string) {
	for _, name := range privateFiles {
		path := filepath.Join(dir, name)
		info, err := os.Stat(path)
		if err != nil || info.Mode().Perm()&0o077 == 0 {
			continue
		}
		if err := os.Chmod(path, info.Mode().Perm()&^0o077); err != nil {
			slog.Warn("could not make a data file private", "file", path, "err", err)
		}
	}
}
