package backup

import (
	"archive/tar"
	"bytes"
	"context"
	"database/sql"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

// A backup round-trips, and only with the right key.
func TestBackupRestoreRoundTrip(t *testing.T) {
	dir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(dir, "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE sites (id TEXT, domain TEXT); INSERT INTO sites VALUES ('tkb_1', 'example.com')`); err != nil {
		t.Fatal(err)
	}
	// A WAL segment, so the backup carries the minutes since the copy.
	if err := os.MkdirAll(filepath.Join(dir, "wal"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "wal", "000001.wal"), []byte("events"), 0o600); err != nil {
		t.Fatal(err)
	}

	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	out := t.TempDir()
	res, err := Run(context.Background(), Store{DataDir: dir, Ctl: db, Key: key}, out)
	if err != nil {
		t.Fatal(err)
	}
	if res.Bytes == 0 {
		t.Fatal("empty backup")
	}

	// The wrong key must fail, and must not leave a half-restored directory.
	wrong := make([]byte, 32)
	into := t.TempDir()
	if err := Restore(res.Path, into, wrong); err == nil {
		t.Fatal("restored with the wrong key")
	}

	// A copy changed in the bucket is refused before anything is written.
	raw, err := os.ReadFile(res.Path)
	if err != nil {
		t.Fatal(err)
	}
	tampered := append([]byte(nil), raw...)
	tampered[len(tampered)/2] ^= 1
	bad := filepath.Join(t.TempDir(), "tampered.tkb")
	os.WriteFile(bad, tampered, 0o600)
	into = t.TempDir()
	if err := Restore(bad, into, key); err == nil || !strings.Contains(err.Error(), "changed") {
		t.Fatalf("tampered backup: %v", err)
	}
	if entries, _ := os.ReadDir(into); len(entries) != 0 {
		t.Fatal("a tampered backup left files behind")
	}

	good := t.TempDir()
	if err := Restore(res.Path, good, key); err != nil {
		t.Fatalf("restore: %v", err)
	}
	restored, err := sql.Open("sqlite", filepath.Join(good, "control.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	var domain string
	if err := restored.QueryRow(`SELECT domain FROM sites`).Scan(&domain); err != nil {
		t.Fatal(err)
	}
	if domain != "example.com" {
		t.Fatalf("restored domain: %q", domain)
	}
	if b, err := os.ReadFile(filepath.Join(good, "wal", "000001.wal")); err != nil || string(b) != "events" {
		t.Fatalf("wal segment: %q %v", b, err)
	}
}

// Restoring never writes over a directory that already holds something.
func TestRestoreRefusesNonEmpty(t *testing.T) {
	dir := t.TempDir()
	db, _ := sql.Open("sqlite", filepath.Join(dir, "x.db"))
	defer db.Close()
	db.Exec(`CREATE TABLE t (a int)`)
	key := make([]byte, 32)
	res, err := Run(context.Background(), Store{DataDir: dir, Ctl: db, Key: key}, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	busy := t.TempDir()
	os.WriteFile(filepath.Join(busy, "something"), []byte("x"), 0o600)
	if err := Restore(res.Path, busy, key); err == nil {
		t.Fatal("restored into a directory that was not empty")
	}
}

// growing appends to a file the first time anything is written through it:
// a write-ahead log receiving visits while the backup copies it.
type growing struct {
	w    io.Writer
	path string
	done bool
}

func (g *growing) Write(p []byte) (int, error) {
	if !g.done {
		g.done = true
		f, err := os.OpenFile(g.path, os.O_APPEND|os.O_WRONLY, 0o600)
		if err != nil {
			return 0, err
		}
		f.Write(bytes.Repeat([]byte("more visits "), 1000))
		f.Close()
	}
	return g.w.Write(p)
}

// A log that grows during the copy is copied as it was when listed, and the
// backup does not fail.
func TestBackupWhileTheLogGrows(t *testing.T) {
	dir := t.TempDir()
	seg := filepath.Join(dir, "000001.wal")
	if err := os.WriteFile(seg, []byte("the first visits"), 0o600); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	tw := tar.NewWriter(&growing{w: &out, path: seg})
	if err := addTree(tw, dir, "wal"); err != nil {
		t.Fatalf("a growing log broke the backup: %v", err)
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	tr := tar.NewReader(&out)
	h, err := tr.Next()
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(tr)
	if h.Size != int64(len("the first visits")) || string(got) != "the first visits" {
		t.Fatalf("copied %d bytes: %q", h.Size, got)
	}
}
