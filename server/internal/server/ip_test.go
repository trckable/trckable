package server

import (
	"net/http/httptest"
	"testing"

	"github.com/trckable/trckable/server/internal/config"
)

// Railway's real header layout, captured from a live deploy on 2026-09-22.
func TestRailwayUsesXRealIP(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "100.64.0.3:17914"
	r.Header.Set("X-Forwarded-For", "80.78.64.1, 89.222.123.194") // client, CDN edge
	r.Header.Set("X-Real-IP", "80.78.64.1")

	if got := ipResolver(config.Config{TrustProxy: "auto", OnRailway: true})(r); got != "80.78.64.1" {
		t.Fatalf("railway: got %s, want the client IP", got)
	}
	if got := ipResolver(config.Config{TrustProxy: "auto"})(r); got != "100.64.0.3" {
		t.Fatalf("no proxy: got %s, want the TCP peer", got)
	}
	if got := ipResolver(config.Config{TrustProxy: "header:X-Real-IP"})(r); got != "80.78.64.1" {
		t.Fatalf("explicit header: got %s", got)
	}
}
