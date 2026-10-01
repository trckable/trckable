package server

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// A volume the image cannot write to (one an older, root-running image
// filled) is refused up front with the command that fixes it, not with the
// first database error.
func TestUnwritableDataDirSaysWhatToRun(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("needs Unix permissions and a user that is not root")
	}
	dir := filepath.Join(t.TempDir(), "data")
	if err := PrepareDataDir(dir); err != nil {
		t.Fatalf("a missing directory is created: %v", err)
	}
	if err := os.Chmod(dir, 0o500); err != nil { //nolint:gosec // read-only on purpose
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(dir, 0o700) }) //nolint:gosec // so the temp dir can be removed
	err := PrepareDataDir(dir)
	if err == nil || !strings.Contains(err.Error(), "chown -R 65532:65532 "+dir) {
		t.Fatalf("want a message with the chown command, got %v", err)
	}
}

// The directory is writable but a file in it is not: the same message.
func TestUnwritableDataFileSaysWhatToRun(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("needs Unix permissions and a user that is not root")
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "trckable.db"), []byte("x"), 0o400); err != nil {
		t.Fatal(err)
	}
	if err := PrepareDataDir(dir); err == nil || !strings.Contains(err.Error(), "chown -R") {
		t.Fatalf("want a message with the chown command, got %v", err)
	}
}

func TestWritableDataDirIsAccepted(t *testing.T) {
	dir := t.TempDir()
	if err := PrepareDataDir(dir); err != nil {
		t.Fatal(err)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Errorf("the probe left %d files behind", len(entries))
	}
}
