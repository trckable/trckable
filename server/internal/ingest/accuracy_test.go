package ingest

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Accuracy scenarios (names start with TestAccuracy: CI runs them as a set and
// publishes how many there are and whether every one was exact).

// Without a cookie a visitor is a daily salted hash: the same person all day
// and a new one from UTC midnight. A visit that straddles midnight is two
// visitors, and one that fills a whole day is one.
func TestAccuracyCookielessVisitorsAcrossUTCMidnight(t *testing.T) {
	h, l := newHandler(t)
	body := `{"s":"tkb_test","k":"pv","u":"https://site.com/"}`
	at := func(ts time.Time, addr string) uint64 {
		h.Now = func() time.Time { return ts }
		req := httptest.NewRequest(http.MethodPost, "/api/e", strings.NewReader(body))
		req.Header.Set("User-Agent", chromeUA)
		req.RemoteAddr = addr
		h.ServeHTTP(httptest.NewRecorder(), req)
		e, _ := lastEvent(t, l)
		return e.Visitor
	}
	me := "203.0.113.77:5555"
	first := at(time.Date(2026, 9, 22, 0, 0, 5, 0, time.UTC), me)
	evening := at(time.Date(2026, 9, 22, 23, 58, 0, 0, time.UTC), me)
	morning := at(time.Date(2026, 9, 23, 0, 2, 0, 0, time.UTC), me)
	later := at(time.Date(2026, 9, 23, 23, 58, 0, 0, time.UTC), me)
	stranger := at(time.Date(2026, 9, 23, 12, 0, 0, 0, time.UTC), "198.51.100.9:4000")
	if first == 0 || morning == 0 {
		t.Fatal("no visitor id")
	}
	if first != evening {
		t.Errorf("one person, one UTC day, two visitors: %d and %d", first, evening)
	}
	if morning == evening {
		t.Errorf("a visit across UTC midnight is one visitor, want two")
	}
	if later != morning {
		t.Errorf("one person, one UTC day, two visitors: %d and %d", morning, later)
	}
	if stranger == morning {
		t.Errorf("two people behind two addresses are one visitor")
	}
}
