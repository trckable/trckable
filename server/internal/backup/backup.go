// Package backup writes one encrypted file that can bring a trckable back:
// the control plane (accounts, sites, settings, the payment ledger), the
// analytics store, and the write-ahead log that covers the minutes since.
//
// Backups hold secrets and visitor data, so they are always encrypted with
// the instance's own key (derived from TRCKABLE_SECRET). A backup without
// that key is noise — which is the point, because backups end up in object
// storage someone else runs.
package backup

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Magic marks a trckable backup and its format version. The file ends with
// an HMAC-SHA256 tag over everything before it, so a copy changed in someone
// else's bucket is refused instead of restored.
const (
	Magic   = "TRCKABLE-BACKUP-1\n"
	tagSize = sha256.Size
)

// macKey is the tag's own key, derived from the encryption key so callers
// keep passing one key.
func macKey(key []byte) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte("trckable backup integrity"))
	return m.Sum(nil)
}

// Store is what a backup reads from.
type Store struct {
	DataDir string
	Ctl     *sql.DB // SQLite control plane
	Duck    *sql.DB // analytics store (nil while it is warming up)
	Key     []byte  // 32 bytes, derived from the instance secret
	// Progress is told which stage is starting, so a backup of millions of
	// rows is never a silent wait. Optional.
	Progress Step
}

// Result describes a finished backup.
type Result struct {
	Path  string
	Bytes int64
	Took  time.Duration
}

// Run writes an encrypted backup into dir.
// Step is called as each stage of a backup starts, so a long one says what it
// is doing rather than sitting silent. Leave it nil and nothing is reported.
type Step func(what string)

func (s Store) step(what string) {
	if s.Progress != nil {
		s.Progress(what)
	}
}

func Run(ctx context.Context, s Store, dir string) (Result, error) {
	started := time.Now()
	if len(s.Key) != 32 {
		return Result{}, fmt.Errorf("backup needs the instance key")
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return Result{}, err
	}
	path := filepath.Join(dir, "trckable-"+started.UTC().Format("20060102-150405")+".tkb")

	// A consistent copy of each store, made the way each one prefers.
	tmp, err := os.MkdirTemp(s.DataDir, "backup-")
	if err != nil {
		return Result{}, err
	}
	defer os.RemoveAll(tmp)

	s.step("copying accounts, sites and payments")
	if _, err := s.Ctl.ExecContext(ctx, `VACUUM INTO ?`, filepath.Join(tmp, "control.db")); err != nil {
		return Result{}, fmt.Errorf("copy control plane: %w", err)
	}
	if s.Duck != nil {
		s.step("exporting visits and sessions")
		// Parquet, not a file copy: it restores into any later DuckDB version.
		out := filepath.Join(tmp, "analytics")
		if _, err := s.Duck.ExecContext(ctx, fmt.Sprintf(`EXPORT DATABASE '%s' (FORMAT PARQUET)`, strings.ReplaceAll(out, "'", "''"))); err != nil {
			return Result{}, fmt.Errorf("export analytics: %w", err)
		}
	}

	s.step("compressing and encrypting")
	// Written under a temporary name and renamed when complete, so nothing
	// that looks for *.tkb ever sees half a backup.
	part := path + ".part"
	f, err := os.OpenFile(part, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return Result{}, err
	}
	defer f.Close()
	done := false
	defer func() {
		if !done {
			os.Remove(part)
		}
	}()
	// Everything written from here on is also fed to the tag.
	mac := hmac.New(sha256.New, macKey(s.Key))
	w := io.MultiWriter(f, mac)
	if _, err := io.WriteString(w, Magic); err != nil {
		return Result{}, err
	}
	// One random nonce for the file, then one stream: a backup is written
	// once and read once.
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return Result{}, err
	}
	if _, err := w.Write(nonce); err != nil {
		return Result{}, err
	}
	block, err := aes.NewCipher(s.Key)
	if err != nil {
		return Result{}, err
	}
	enc := cipher.StreamWriter{S: cipher.NewCTR(block, nonce), W: w}
	gz := gzip.NewWriter(enc)
	tw := tar.NewWriter(gz)

	if err := addTree(tw, tmp, ""); err != nil {
		return Result{}, err
	}
	// The WAL covers everything since those copies were made.
	if err := addTree(tw, filepath.Join(s.DataDir, "wal"), "wal"); err != nil && !os.IsNotExist(err) {
		return Result{}, err
	}
	for _, err := range []error{tw.Close(), gz.Close()} {
		if err != nil {
			return Result{}, err
		}
	}
	if _, err := f.Write(mac.Sum(nil)); err != nil {
		return Result{}, err
	}
	if err := f.Sync(); err != nil {
		return Result{}, err
	}
	info, err := f.Stat()
	if err != nil {
		return Result{}, err
	}
	if err := os.Rename(part, path); err != nil {
		return Result{}, err
	}
	done = true
	return Result{Path: path, Bytes: info.Size(), Took: time.Since(started)}, nil
}

func addTree(tw *tar.Writer, dir, prefix string) error {
	return filepath.Walk(dir, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(dir, p)
		if err != nil {
			return err
		}
		if prefix != "" {
			rel = filepath.Join(prefix, rel)
		}
		f, err := os.Open(p)
		if err != nil {
			return err
		}
		defer f.Close()
		if err := tw.WriteHeader(&tar.Header{Name: rel, Mode: 0o600, Size: info.Size(), ModTime: info.ModTime()}); err != nil {
			return err
		}
		// Exactly the size the header promised. The write-ahead log keeps
		// growing while visits arrive; copying to the end of a file that grew
		// broke every backup of a busy site ("archive/tar: write too long").
		// A record cut off at that point is dropped when the log is reopened,
		// and the full record is in the next backup.
		_, err = io.CopyN(tw, f, info.Size())
		return err
	})
}

// Restore unpacks a backup into an empty directory. Restoring is deliberate:
// it never writes over a data directory that already holds something.
func Restore(path, dir string, key []byte) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	magic := make([]byte, len(Magic))
	if _, err := io.ReadFull(f, magic); err != nil || string(magic) != Magic {
		return fmt.Errorf("that is not a trckable backup")
	}
	// Check the whole file before unpacking any of it: a restore that stops
	// half way through a tampered file has already written to disk.
	if info.Size() < int64(len(Magic)+16+tagSize) {
		return fmt.Errorf("the backup is cut short")
	}
	end := info.Size() - tagSize
	mac := hmac.New(sha256.New, macKey(key))
	if _, err := io.Copy(mac, io.NewSectionReader(f, 0, end)); err != nil {
		return err
	}
	tag := make([]byte, tagSize)
	if _, err := f.ReadAt(tag, end); err != nil {
		return err
	}
	if !hmac.Equal(tag, mac.Sum(nil)) {
		return fmt.Errorf("wrong key, or the file was changed after it was written")
	}
	// The body is everything between the header and the tag.
	body := io.NewSectionReader(f, int64(len(Magic)), end-int64(len(Magic)))
	nonce := make([]byte, 16)
	if _, err := io.ReadFull(body, nonce); err != nil {
		return err
	}
	if entries, err := os.ReadDir(dir); err == nil && len(entries) > 0 {
		return fmt.Errorf("%s is not empty — restore into an empty directory", dir)
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	gz, err := gzip.NewReader(cipher.StreamReader{S: cipher.NewCTR(block, nonce), R: body})
	if err != nil {
		return fmt.Errorf("wrong key, or the file is damaged")
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	for {
		h, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return fmt.Errorf("wrong key, or the file is damaged")
		}
		// A backup only holds files trckable wrote; a path leaving the
		// directory means a damaged or hostile file.
		clean := filepath.Clean(h.Name)
		if strings.HasPrefix(clean, "..") || filepath.IsAbs(clean) {
			return fmt.Errorf("refusing to restore %q", h.Name)
		}
		target := filepath.Join(dir, clean)
		if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if err != nil {
			return err
		}
		if _, err := io.Copy(out, tr); err != nil {
			out.Close()
			return err
		}
		if err := out.Close(); err != nil {
			return err
		}
	}
}
