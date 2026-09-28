package api

import (
	"net/http"
	"strconv"
	"time"
)

// withTiming adds a Server-Timing header to every API answer: the time the
// server spent before its first byte, so the browser's network panel (and
// the speed budget in bench/speed) can tell server time from the network.
func withTiming(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h.ServeHTTP(&timedWriter{ResponseWriter: w, start: time.Now()}, r)
	})
}

type timedWriter struct {
	http.ResponseWriter
	start time.Time
	sent  bool
}

func (t *timedWriter) stamp() {
	if t.sent {
		return
	}
	t.sent = true
	ms := float64(time.Since(t.start).Microseconds()) / 1000
	t.Header().Set("Server-Timing", "app;dur="+strconv.FormatFloat(ms, 'f', 1, 64))
}

func (t *timedWriter) WriteHeader(code int) {
	t.stamp()
	t.ResponseWriter.WriteHeader(code)
}

func (t *timedWriter) Write(b []byte) (int, error) {
	t.stamp()
	return t.ResponseWriter.Write(b)
}

// Flush keeps live streams streaming through the wrapper.
func (t *timedWriter) Flush() {
	t.stamp()
	if f, ok := t.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Unwrap lets http.ResponseController reach the real writer.
func (t *timedWriter) Unwrap() http.ResponseWriter { return t.ResponseWriter }
