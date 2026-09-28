package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestServerTimingHeader(t *testing.T) {
	h := withTiming(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if got := rec.Header().Get("Server-Timing"); !strings.HasPrefix(got, "app;dur=") || rec.Code != http.StatusTeapot {
		t.Fatalf("Server-Timing = %q, code %d", got, rec.Code)
	}
	var _ http.Flusher = &timedWriter{} // live streams still flush
}
