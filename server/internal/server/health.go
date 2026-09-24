package server

import (
	"context"
	"os"
	"syscall"
	"time"

	"github.com/trckable/trckable/server/internal/api"
)

// health gathers what Settings → Health shows. Everything here is read from
// what the server already tracks: no new counters, no extra work while idle.
func (s *Server) health(ctx context.Context) api.Health {
	committed, _ := s.log.Committed()
	h := api.Health{
		Version:   Version,
		UptimeS:   int64(time.Since(s.started).Seconds()),
		Analytics: "warming",
		Events: api.Flow{
			Accepted: int64(s.ingest.Stats.Accepted.Load()),
			Bots:     int64(s.ingest.Stats.Bots.Load()),
			Rejected: int64(s.ingest.Stats.Rejected.Load()),
		},
	}
	if w := s.writer.Load(); w != nil {
		h.Events.Lag = int64(committed) - int64(w.Applied())
		if w.Ready() {
			h.Analytics = "ready"
		}
	}
	if err, _ := s.writerErr.Load().(error); err != nil {
		h.Analytics = "error"
	}

	// Disk: what this instance has written, and how long the free space lasts
	// at the rate it is actually writing.
	if st := s.duck.Load(); st != nil {
		var events int64
		if err := st.DB.QueryRowContext(ctx, `SELECT count(*) FROM events`).Scan(&events); err == nil {
			h.Store.Events = events
		}
	}
	h.Store.BytesUsed = dirSize(s.cfg.DataDir)
	h.Store.BytesFree = freeSpace(s.cfg.DataDir)
	if h.Store.Events > 0 && h.Store.BytesUsed > 0 {
		h.Store.PerEvent = float64(h.Store.BytesUsed) / float64(h.Store.Events)
		// Events per day since boot, which is the only rate this process can
		// honestly claim to know.
		days := time.Since(s.started).Hours() / 24
		if days > 0.02 && h.Events.Accepted > 0 && h.Store.PerEvent > 0 {
			perDay := float64(h.Events.Accepted) / days
			if perDay > 0 {
				h.Store.DaysLeft = float64(h.Store.BytesFree) / (perDay * h.Store.PerEvent)
			}
		}
	}

	if at, size := s.LastBackup(); !at.IsZero() {
		h.Backup = api.Backup{At: at.Unix(), Bytes: size}
	}
	if s.remote != nil {
		h.Backup.Offsite, h.Backup.OffsiteDays = s.remote.Where(), s.cfg.BackupDays
		if st := s.offsite.Load(); st != nil {
			h.Backup.OffsiteAt, h.Backup.OffsiteErr = st.at, st.err
		}
	}

	if s.revenue != nil {
		p := &api.Pay{}
		s.ctl.DB.QueryRowContext(ctx, `SELECT count(*) FROM pay_connections`).Scan(&p.Connections)
		s.ctl.DB.QueryRowContext(ctx, `SELECT count(*) FROM pay_inbox WHERE processed_at IS NULL`).Scan(&p.Pending)
		s.ctl.DB.QueryRowContext(ctx, `SELECT coalesce(max(received_at), 0) FROM pay_inbox`).Scan(&p.LastEventAt)
		s.ctl.DB.QueryRowContext(ctx, `SELECT coalesce(max(last_sync_at), 0) FROM pay_connections`).Scan(&p.LastSyncAt)
		if p.Connections > 0 {
			h.Payments = p
		}
	}
	return h
}

// dirSize adds up the data directory, which is where every byte trckable
// keeps lives.
func dirSize(dir string) int64 {
	var total int64
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}
	for _, e := range entries {
		if info, err := e.Info(); err == nil {
			if e.IsDir() {
				total += dirSize(dir + "/" + e.Name())
			} else {
				total += info.Size()
			}
		}
	}
	return total
}

// freeSpace is what the volume has left, or 0 where that cannot be read.
func freeSpace(dir string) int64 {
	var st syscall.Statfs_t
	if err := syscall.Statfs(dir, &st); err != nil {
		return 0
	}
	return int64(st.Bavail) * int64(st.Bsize)
}
