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

// A volume whose top folder was handed over but whose log, backups or geo
// folders are still root's is refused the same way.
func TestUnwritableDataSubfolderSaysWhatToRun(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("needs Unix permissions and a user that is not root")
	}
	for _, sub := range []string{"wal", "backups", "geo"} {
		dir := t.TempDir()
		if err := os.Mkdir(filepath.Join(dir, sub), 0o500); err != nil { //nolint:gosec // read-only on purpose
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.Chmod(filepath.Join(dir, sub), 0o700) }) //nolint:gosec // so the temp dir can be removed
		if err := PrepareDataDir(dir); err == nil || !strings.Contains(err.Error(), "chown -R") {
			t.Errorf("%s not writable: want a message with the chown command, got %v", sub, err)
		}
	}
	// A log segment that is not writable counts too.
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "wal"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "wal", "00000001.seg"), []byte("x"), 0o400); err != nil {
		t.Fatal(err)
	}
	if err := PrepareDataDir(dir); err == nil || !strings.Contains(err.Error(), "chown -R") {
		t.Errorf("a read-only log segment: got %v", err)
	}
}

// On Railway the volume is root's and the platform has a setting for that:
// the message names it, and elsewhere names the chown instead.
func TestUnwritableMessageNamesTheRailwaySetting(t *testing.T) {
	on := unwritableMessage("/data", 65532, true)
	if !strings.Contains(on, "RAILWAY_RUN_UID=0") || strings.Contains(on, "chown") {
		t.Errorf("on Railway: %s", on)
	}
	off := unwritableMessage("/data", 65532, false)
	if !strings.Contains(off, "chown -R 65532:65532 /data") || strings.Contains(off, "RAILWAY") {
		t.Errorf("elsewhere: %s", off)
	}
	if os.Geteuid() == 0 || runtime.GOOS == "windows" {
		return
	}
	t.Setenv("RAILWAY_ENVIRONMENT", "production")
	dir := filepath.Join(t.TempDir(), "data")
	if err := PrepareDataDir(dir); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, 0o500); err != nil { //nolint:gosec // read-only on purpose
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(dir, 0o700) }) //nolint:gosec // so the temp dir can be removed
	if err := PrepareDataDir(dir); err == nil || !strings.Contains(err.Error(), "RAILWAY_RUN_UID=0") {
		t.Errorf("PrepareDataDir with RAILWAY_ENVIRONMENT set: %v", err)
	}
}
