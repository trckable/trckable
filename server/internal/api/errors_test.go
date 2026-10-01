package api

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A 500 tells the client nothing about the failure: the detail is logged.
func TestServerErrorsAreGenericOnTheWire(t *testing.T) {
	const detail = "sqlite: disk I/O error at /data/trckable.db"
	w := httptest.NewRecorder()
	fail(w, http.StatusInternalServerError, detail)
	if w.Code != http.StatusInternalServerError || strings.Contains(w.Body.String(), "sqlite") || strings.Contains(w.Body.String(), "/data") {
		t.Errorf("fail(500): %d %s", w.Code, w.Body)
	}
	w = httptest.NewRecorder()
	serverError(w, errors.New(detail))
	if w.Code != http.StatusInternalServerError || strings.Contains(w.Body.String(), "sqlite") || strings.Contains(w.Body.String(), "/data") {
		t.Errorf("serverError: %d %s", w.Code, w.Body)
	}
	w = httptest.NewRecorder()
	fail(w, http.StatusConflict, "that name is taken")
	if !strings.Contains(w.Body.String(), "that name is taken") {
		t.Errorf("a 409 keeps its message: %s", w.Body)
	}
}
