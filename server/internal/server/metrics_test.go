package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/trckable/trckable/server/internal/config"
)

// /metrics is off without an API token and refuses anyone without it.
func TestMetricsNeedTheAPIToken(t *testing.T) {
	get := func(s *Server, bearer string) int {
		r := httptest.NewRequest(http.MethodGet, "/metrics", nil)
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		w := httptest.NewRecorder()
		s.metrics(w, r)
		return w.Code
	}
	if code := get(&Server{cfg: config.Config{}}, ""); code != http.StatusNotFound {
		t.Errorf("no token configured: %d", code)
	}
	s := &Server{cfg: config.Config{APIToken: "tkb_test_token_0123456789"}} //nolint:gosec // a test value
	if code := get(s, ""); code != http.StatusUnauthorized {
		t.Errorf("no bearer: %d", code)
	}
	if code := get(s, "wrong"); code != http.StatusUnauthorized {
		t.Errorf("wrong bearer: %d", code)
	}
}
