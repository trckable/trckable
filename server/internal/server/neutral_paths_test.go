package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/config"
)

// The neutral paths a first-party proxy forwards to: /s/x.js is the same
// script as /js/t.js, and /s/e takes visits like /api/e (a visit for a site
// that does not exist is refused by the same handler, not a 404 of the mux).
func TestNeutralPathsServeTheSameThings(t *testing.T) {
	s := newTestServer(t, config.Config{})
	plain, neutral := httptest.NewRecorder(), httptest.NewRecorder()
	s.http.Handler.ServeHTTP(plain, httptest.NewRequest(http.MethodGet, "/js/t.js", nil))
	s.http.Handler.ServeHTTP(neutral, httptest.NewRequest(http.MethodGet, "/s/x.js", nil))
	if neutral.Code != http.StatusOK || neutral.Body.String() != plain.Body.String() || neutral.Header().Get("Cache-Control") != plain.Header().Get("Cache-Control") {
		t.Fatalf("/s/x.js: %d, differs from /js/t.js", neutral.Code)
	}

	// /js/x.js is not a script: it is what it always was.
	x := httptest.NewRecorder()
	s.http.Handler.ServeHTTP(x, httptest.NewRequest(http.MethodGet, "/js/x.js", nil))
	if x.Code != http.StatusNotFound {
		t.Errorf("/js/x.js: %d, want 404", x.Code)
	}

	// Heatmap reports have the same neutral path as /api/h: same handler, same answer.
	for _, path := range []string{"/api/h", "/s/h"} {
		w := httptest.NewRecorder()
		s.http.Handler.ServeHTTP(w, httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{}`)))
		if w.Code != http.StatusBadRequest {
			t.Errorf("POST %s with nothing in it: %d, want the handler's 400", path, w.Code)
		}
	}

	for _, path := range []string{"/api/e", "/s/e"} {
		w := httptest.NewRecorder()
		s.http.Handler.ServeHTTP(w, httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"s":"tkb_nosuch","k":"pv","u":"https://site.com/"}`)))
		if w.Code != http.StatusBadRequest {
			t.Errorf("POST %s for an unknown site: %d, want the handler's 400", path, w.Code)
		}
	}
}
