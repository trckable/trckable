package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/config"
)

var errTest = errors.New("test")

func collectGet(t *testing.T, s *Server) (int, collectHealth, string) {
	t.Helper()
	s.collectCache = collectCache{} // no cached answer from an earlier call
	code, body := get(s, "/healthz/collect", "")
	var h collectHealth
	if err := json.Unmarshal([]byte(body), &h); err != nil {
		t.Fatalf("not JSON: %q", body)
	}
	return code, h, body
}

// writerUp stands in for the analytics writer, which only starts when the
// server runs.
func writerUp(t *testing.T, applied uint64, running bool) {
	t.Helper()
	old := writerApplied
	writerApplied = func(*Server) (uint64, bool) { return applied, running }
	t.Cleanup(func() { writerApplied = old })
}

func TestHealthCollectOK(t *testing.T) {
	s := newTestServer(t, config.Config{})
	writerUp(t, 0, true)
	code, h, body := collectGet(t, s)
	if code != http.StatusOK || !h.OK {
		t.Fatalf("healthy server: %d %s", code, body)
	}
	for _, k := range []string{"database", "queue", "writer", "tracker", "disk"} {
		if !h.Checks[k] {
			t.Errorf("check %s not ok: %s", k, body)
		}
	}
	if strings.Contains(body, s.cfg.DataDir) {
		t.Errorf("body shows the data directory: %s", body)
	}
}

func TestHealthCollectFailures(t *testing.T) {
	t.Run("database", func(t *testing.T) {
		s := newTestServer(t, config.Config{})
		writerUp(t, 0, true)
		_ = s.ctl.Close()
		code, h, body := collectGet(t, s)
		if code != http.StatusServiceUnavailable || h.OK || h.Checks["database"] {
			t.Fatalf("closed database: %d %s", code, body)
		}
	})
	t.Run("queue", func(t *testing.T) {
		s := newTestServer(t, config.Config{})
		writerUp(t, 0, true)
		old := queueState
		queueState = func(*Server) (int, int, error) { return 0, 10, errTest }
		t.Cleanup(func() { queueState = old })
		code, h, body := collectGet(t, s)
		if code != http.StatusServiceUnavailable || h.Checks["queue"] {
			t.Fatalf("failing log: %d %s", code, body)
		}
	})
	t.Run("writer", func(t *testing.T) {
		s := newTestServer(t, config.Config{})
		writerUp(t, 0, true)
		s.writerErr.Store(errTest)
		code, h, body := collectGet(t, s)
		if code != http.StatusServiceUnavailable || h.Checks["writer"] {
			t.Fatalf("writer error: %d %s", code, body)
		}
	})
	t.Run("writer not running", func(t *testing.T) {
		s := newTestServer(t, config.Config{})
		writerUp(t, 0, false)
		code, h, body := collectGet(t, s)
		if code != http.StatusServiceUnavailable || h.Checks["writer"] {
			t.Fatalf("no writer: %d %s", code, body)
		}
	})
	t.Run("disk", func(t *testing.T) {
		s := newTestServer(t, config.Config{})
		writerUp(t, 0, true)
		old := freeBytes
		freeBytes = func(string) (int64, error) { return 1 << 20, nil }
		t.Cleanup(func() { freeBytes = old })
		code, h, body := collectGet(t, s)
		if code != http.StatusServiceUnavailable || h.Checks["disk"] || !h.Checks["database"] {
			t.Fatalf("low disk: %d %s", code, body)
		}
	})
}
