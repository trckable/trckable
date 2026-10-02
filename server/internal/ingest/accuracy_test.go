package ingest

import (
	"fmt"
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

// A visit made while the server was down arrives hours later and says how old
// it is: it is stored on the day it happened, not on the day it arrived. The
// server is back at three in the morning (UTC); a two-hour-old visit is last
// night, a twenty-hour-old one is yesterday afternoon, and one older than any
// tracker keeps an event (25 hours) is refused rather than put on a day it was
// never on.
func TestAccuracyEventsAfterALongOutageAreOnTheirOwnDay(t *testing.T) {
	h, l := newHandler(t)
	h.Now = func() time.Time { return time.Date(2026, 9, 22, 3, 0, 0, 0, time.UTC) }
	for _, tc := range []struct {
		age  time.Duration
		day  string
		code int
	}{
		{0, "2026-09-22", http.StatusAccepted},
		{2 * time.Hour, "2026-09-22", http.StatusAccepted},
		{3*time.Hour + time.Second, "2026-09-21", http.StatusAccepted},
		{20 * time.Hour, "2026-09-21", http.StatusAccepted},
		{24 * time.Hour, "2026-09-21", http.StatusAccepted},
		{25 * time.Hour, "2026-09-21", http.StatusAccepted},
		{25*time.Hour + time.Millisecond, "", http.StatusBadRequest},
		{72 * time.Hour, "", http.StatusBadRequest},
	} {
		body := fmt.Sprintf(`{"s":"tkb_test","k":"pv","u":"https://site.com/","a":%d}`, tc.age.Milliseconds())
		if w := post(h, body, chromeUA); w.Code != tc.code {
			t.Errorf("age %v: status %d, want %d", tc.age, w.Code, tc.code)
			continue
		}
		if tc.code != http.StatusAccepted {
			continue
		}
		e, _ := lastEvent(t, l)
		if got := time.UnixMilli(e.TS).UTC().Format("2006-01-02"); got != tc.day {
			t.Errorf("age %v: stored on %s, want %s", tc.age, got, tc.day)
		}
	}
}
