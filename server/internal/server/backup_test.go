package server

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/backup"
	"github.com/trckable/trckable/server/internal/config"
)

// A start leaves a recent backup alone and waits for the daily one, counted
// from that backup; an old one, none, or a failure gets a backup as before.
func TestBootBackupSkipsARecentOne(t *testing.T) {
	now := time.Date(2026, 9, 23, 12, 0, 0, 0, time.UTC)
	s := &Server{cfg: config.Config{DataDir: t.TempDir()}}
	if err := os.MkdirAll(s.backupsDir(), 0o700); err != nil {
		t.Fatal(err)
	}
	write := func(age time.Duration) {
		t.Helper()
		p := filepath.Join(s.backupsDir(), "trckable-20260923-000000.tkb")
		if err := os.WriteFile(p, []byte("b"), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(p, now.Add(-age), now.Add(-age)); err != nil {
			t.Fatal(err)
		}
	}
	if got := s.firstBackupIn(now); got != backupBoot {
		t.Fatalf("no backup yet: %s", got)
	}

	write(time.Hour)
	if got, want := s.firstBackupIn(now), 23*time.Hour; got != want {
		t.Fatalf("an hour old: %s, want %s", got, want)
	}
	// The next daily backup is due 24 hours after the newest, not after boot.
	write(11*time.Hour + 59*time.Minute)
	if got, want := s.firstBackupIn(now), 12*time.Hour+time.Minute; got != want {
		t.Fatalf("just under twelve hours: %s, want %s", got, want)
	}
	write(12*time.Hour + time.Minute)
	if got := s.firstBackupIn(now); got != backupBoot {
		t.Fatalf("over twelve hours: %s", got)
	}
	write(-time.Hour)
	if got := s.firstBackupIn(now); got != backupBoot {
		t.Fatalf("a file from the future: %s", got)
	}

	write(time.Hour)
	failed := filepath.Join(s.backupsDir(), FailedFile)
	if err := os.WriteFile(failed, []byte("no space left on device"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := s.firstBackupIn(now); got != backupBoot {
		t.Fatalf("after a failed backup: %s", got)
	}
	os.Remove(failed)
	s.backupErr.Store(&backupFailure{at: now.Unix(), err: "x"})
	if got := s.firstBackupIn(now); got != backupBoot {
		t.Fatalf("after a failed backup (in memory): %s", got)
	}
	s.backupErr.Store(nil)

	// A failed off-site copy asks for another try; a bucket that is fine does not.
	s.remote, _ = backup.ParseRemote("https://key:secret@s3.example.com/bucket")
	s.offsite.Store(&offsiteStatus{at: now.Unix()})
	if got := s.firstBackupIn(now); got != 23*time.Hour {
		t.Fatalf("with a good off-site copy: %s", got)
	}
	s.offsite.Store(&offsiteStatus{at: now.Unix() - 3600, err: "403 Forbidden"})
	if got := s.firstBackupIn(now); got != backupBoot {
		t.Fatalf("after a failed off-site copy: %s", got)
	}
}
