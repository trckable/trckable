package server

import (
	"errors"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/config"
)

// While the writer cannot commit,  and the health alert names it.
func TestReadyzFailsWhileWriterCannotCommit(t *testing.T) {
	s := newTestServer(t, config.Config{})
	if code, _ := get(s, "/readyz", ""); code != http.StatusOK {
		t.Fatalf("healthy: %d", code)
	}
	old := writerFailing
	writerFailing = func(*Server) error { return errors.New("disk I/O") }
	t.Cleanup(func() { writerFailing = old })
	if code, body := get(s, "/readyz", ""); code != http.StatusOK {
		t.Fatalf("failing writer: %d %s", code, body)
	} else if !strings.Contains(body, "degraded") || !strings.Contains(body, "disk I/O") {
		t.Fatalf("failing writer not named: %s", body)
	}
	if s.problems()[problemWriter] == "" {
		t.Fatal("writer failure is not a health problem")
	}
}

// A panic in a background goroutine exits non-zero instead of dying silently.
func TestGuardedGoroutineExitsOnPanic(t *testing.T) {
	s := newTestServer(t, config.Config{})
	var code atomic.Int32
	s.exit = func(c int) { code.Store(int32(c)) } // #nosec G115 -- small exit codes
	s.goGuarded("test", func() { panic("boom") })
	deadline := time.Now().Add(5 * time.Second)
	for code.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if code.Load() != 1 {
		t.Fatalf("exit code %d, want 1", code.Load())
	}
}
