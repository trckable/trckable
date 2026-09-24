package server

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/backup"
)

// backupsDir is where nightly backups land inside the data volume. With
// TRCKABLE_BACKUP_S3 each one is also copied to a bucket somewhere else.
func (s *Server) backupsDir() string { return filepath.Join(s.cfg.DataDir, "backups") }

// KeepBackups is how many nightly files stay on disk. Old ones are removed so
// a small volume does not fill up with copies of itself. With an off-site
// bucket the history lives there, and two local copies are enough.
const (
	KeepBackups        = 7
	KeepBackupsOffsite = 2
)

// TriggerFile asks a running server for a backup now: `trckabled backup`
// creates it when the server holds the analytics store, and waits for the
// file the server writes. Anyone who can create it can already read the data
// directory, so it needs no other permission.
const TriggerFile = ".backup-now"

// runBackups writes one backup a few minutes after boot, then one a day, and
// one whenever the trigger file appears.
func (s *Server) runBackups(ctx context.Context) {
	timer := time.NewTimer(10 * time.Minute)
	defer timer.Stop()
	poll := time.NewTicker(3 * time.Second)
	defer poll.Stop()
	trigger := filepath.Join(s.backupsDir(), TriggerFile)
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			timer.Reset(24 * time.Hour)
		case <-poll.C:
			if _, err := os.Stat(trigger); err != nil {
				continue
			}
			os.Remove(trigger)
		}
		s.backupOnce(ctx)
	}
}

// backupOnce writes a backup, copies it off-site, and then lets go of what the
// backups made redundant: old local files, and write-ahead log segments the
// analytics store already holds.
func (s *Server) backupOnce(ctx context.Context) {
	prev, _ := s.LastBackup()
	res, err := s.Backup(ctx)
	if err != nil {
		if ctx.Err() == nil {
			slog.Warn("backup failed", "err", err)
		}
		return
	}
	slog.Info("backup written", "path", res.Path, "bytes", res.Bytes, "took", res.Took.Round(time.Millisecond))
	s.ship(ctx, res.Path)
	s.pruneBackups()
	s.pruneWAL(prev)
}

// pruneWAL removes log segments that are fully applied and older than the
// previous backup. Everything since that backup stays, so the newest backup
// plus the log still on disk is a point-in-time copy even if the newest file
// turns out to be damaged; everything before it is in the analytics store and
// in both backups. Without this the log grows for as long as the server runs.
func (s *Server) pruneWAL(prev time.Time) {
	w := s.writer.Load()
	if prev.IsZero() || w == nil {
		return
	}
	n, err := s.log.Prune(w.Applied(), prev)
	if err != nil {
		slog.Warn("could not trim the write-ahead log", "err", err)
	} else if n > 0 {
		slog.Info("write-ahead log trimmed", "segments", n)
	}
}

// Backup writes one encrypted backup now.
func (s *Server) Backup(ctx context.Context) (backup.Result, error) {
	st := backup.Store{DataDir: s.cfg.DataDir, Ctl: s.ctl.DB, Key: s.box.Derive("backup")}
	if d := s.duck.Load(); d != nil {
		st.Duck = d.DB
	}
	return backup.Run(ctx, st, s.backupsDir())
}

// offsiteStatus is how the last copy to the bucket went, for Settings → Health.
type offsiteStatus struct {
	at  int64 // unix seconds of the last copy that arrived
	err string
}

// ship copies one backup off this machine and trims what the bucket keeps.
// A failed copy is reported, never fatal: the local file is still there.
func (s *Server) ship(ctx context.Context, path string) {
	if s.remote == nil {
		return
	}
	prev := s.offsite.Load()
	st := &offsiteStatus{}
	if prev != nil {
		st.at = prev.at
	}
	if err := s.remote.Upload(ctx, path); err != nil {
		st.err = err.Error()
		slog.Warn("off-site backup failed", "to", s.remote.Where(), "err", err)
		s.offsite.Store(st)
		return
	}
	st.at = time.Now().Unix()
	s.offsite.Store(st)
	slog.Info("backup copied off-site", "to", s.remote.Where())
	keep := time.Duration(max(s.cfg.BackupDays, 1)) * 24 * time.Hour
	if n, err := s.remote.Prune(ctx, keep, time.Now()); err != nil {
		slog.Warn("could not trim off-site backups", "err", err)
	} else if n > 0 {
		slog.Info("old off-site backups removed", "count", n)
	}
}

// pruneBackups keeps the newest KeepBackups files.
func (s *Server) pruneBackups() {
	entries, err := os.ReadDir(s.backupsDir())
	if err != nil {
		return
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".tkb") {
			files = append(files, e.Name())
		}
	}
	backup.SortNewest(files)
	keep := KeepBackups
	if s.remote != nil {
		keep = KeepBackupsOffsite
	}
	for _, name := range files[min(len(files), keep):] {
		os.Remove(filepath.Join(s.backupsDir(), name))
	}
}

// LastBackup is when the newest backup was written, and how big it is.
func (s *Server) LastBackup() (at time.Time, size int64) {
	entries, err := os.ReadDir(s.backupsDir())
	if err != nil {
		return time.Time{}, 0
	}
	for _, e := range entries {
		info, err := e.Info()
		if err != nil || e.IsDir() || !strings.HasSuffix(e.Name(), ".tkb") {
			continue
		}
		if info.ModTime().After(at) {
			at, size = info.ModTime(), info.Size()
		}
	}
	return at, size
}
