package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/trckable/trckable/server/internal/config"
)

// /metrics is open unless TRCKABLE_METRICS_TOKEN is set, and then it refuses
// anyone without that bearer token.
func TestMetricsTokenIsOptional(t *testing.T) {
	allowed := func(cfg config.Config, bearer string) bool {
		r := httptest.NewRequest(http.MethodGet, "/metrics", nil)
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		return (&Server{cfg: cfg}).metricsAllowed(r)
	}
	if !allowed(config.Config{}, "") {
		t.Error("no token configured: refused")
	}
	locked := config.Config{MetricsToken: "tkb_test_token_0123456789"} //nolint:gosec // a test value
	if allowed(locked, "") || allowed(locked, "wrong") {
		t.Error("a token is set: an open or wrong bearer was let in")
	}
	if !allowed(locked, "tkb_test_token_0123456789") {
		t.Error("the right bearer was refused")
	}
}
