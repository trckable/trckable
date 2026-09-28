package server

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// The control database holds password hashes, sessions, two-step secrets
// and sealed provider keys. However the data directory was made (by hand,
// by a volume mount, by an older trckable), the files in it that hold those
// are readable by this server's user only.
func TestDataFilesAreReadableByTheServerOnly(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("no Unix permissions")
	}
	dir := t.TempDir()
	names := []string{"trckable.db", "trckable.db-wal", "trckable.db-shm", "trckable.duckdb", "trckable.duckdb.wal", "secret.key"}
	for _, n := range names {
		if err := os.WriteFile(filepath.Join(dir, n), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
		// Readable by others on purpose, whatever the test's umask: the
		// state an old or hand-made data directory is in.
		if err := os.Chmod(filepath.Join(dir, n), 0o644); err != nil { //nolint:gosec // deliberately too open, to check keepPrivate tightens it
			t.Fatal(err)
		}
	}
	keepPrivate(dir)
	for _, n := range names {
		info, err := os.Stat(filepath.Join(dir, n))
		if err != nil {
			t.Fatal(err)
		}
		if perm := info.Mode().Perm(); perm&0o077 != 0 {
			t.Errorf("%s is %v: others can read it", n, perm)
		}
	}
	keepPrivate(filepath.Join(dir, "missing")) // nothing there: nothing to do, no panic
}
