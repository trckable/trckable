package server

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"syscall"
	"time"

	"github.com/trckable/trckable/server/internal/web"
)

const (
	collectTimeout  = 2 * time.Second
	collectCacheFor = 5 * time.Second // a poll storm costs one check, not many
	minFreeBytes    = 256 << 20
	maxWriterLag    = 100000 // records the analytics writer may trail the log by
	healthProbeKey  = "health_probe"
)

// freeBytes is what the volume holding dir has left; a variable for tests.
var freeBytes = func(dir string) (int64, error) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(dir, &st); err != nil {
		return 0, err
	}
	return int64(st.Bavail) * int64(st.Bsize), nil //nolint:gosec // free blocks of a real volume
}

// queueState is the log's sticky error and its queue fill; a variable for tests.
var queueState = func(s *Server) (err error, waiting, capacity int) {
	waiting, capacity = s.log.Pending()
	return s.log.Err(), waiting, capacity
}

// writerApplied is how far the analytics writer has got, and whether it runs
// at all (it starts once the analytics store is open); a variable for tests.
var writerApplied = func(s *Server) (applied uint64, running bool) {
	if wr := s.writer.Load(); wr != nil {
		return wr.Applied(), true
	}
	return 0, false
}

type collectHealth struct {
	OK     bool            `json:"ok"`
	Checks map[string]bool `json:"checks"`
}

type collectCache struct {
	mu   sync.Mutex
	at   time.Time
	body []byte
	code int
}

// healthCollect answers whether trckable can take pageviews right now:
// the database accepts a write, the write-ahead log and the analytics writer
// are keeping up, the tracker script is served and the disk has room. The
// answer names the failing part and nothing else. It is unauthenticated, so
// the result is cached for a few seconds.
func (s *Server) healthCollect(w http.ResponseWriter, r *http.Request) {
	c := &s.collectCache
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.body == nil || time.Since(c.at) > collectCacheFor {
		ctx, cancel := context.WithTimeout(r.Context(), collectTimeout)
		h := s.collectChecks(ctx)
		cancel()
		c.code = http.StatusOK
		if !h.OK {
			c.code = http.StatusServiceUnavailable
		}
		c.body, _ = json.Marshal(h)
		c.at = time.Now()
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(c.code)
	_, _ = w.Write(c.body)
}

func (s *Server) collectChecks(ctx context.Context) collectHealth {
	ck := map[string]bool{}

	// A tiny write and read-back in the meta table, not in any site's stats.
	ck["database"] = false
	if err := s.ctl.SetMeta(ctx, healthProbeKey, time.Now().UTC().Format(time.RFC3339)); err == nil {
		if _, ok, err := s.ctl.Meta(ctx, healthProbeKey); err == nil && ok {
			ck["database"] = true
		}
	}
	if !ck["database"] {
		s.readyzLog("collect check: the database is not writable", ctx.Err())
	}

	// The log takes events (no sticky error, queue not full) and the writer
	// that turns them into stats is running and not far behind.
	err, waiting, capacity := queueState(s)
	ck["queue"] = err == nil && waiting < capacity
	ck["writer"] = false
	if applied, running := writerApplied(s); running && s.writerErr.Load() == nil {
		committed, _ := s.log.Committed()
		ck["writer"] = committed <= applied || committed-applied < maxWriterLag
	}

	ck["tracker"] = web.TrackerEmbedded()

	free, ferr := freeBytes(s.cfg.DataDir)
	ck["disk"] = ferr == nil && free >= minFreeBytes

	ok := true
	for _, v := range ck {
		ok = ok && v
	}
	return collectHealth{OK: ok, Checks: ck}
}
