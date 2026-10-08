package api

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFailReportNamesMemoryTrouble(t *testing.T) {
	w := httptest.NewRecorder()
	failReport(w, errors.New("breakdowns: Out of Memory Error: could not allocate block"))
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), `"code":"report_memory"`) {
		t.Fatalf("got %d %s", w.Code, w.Body)
	}
	w = httptest.NewRecorder()
	failReport(w, errors.New("kpis: bad"))
	if strings.Contains(w.Body.String(), "report_memory") {
		t.Fatalf("other errors keep no code: %s", w.Body)
	}
}
