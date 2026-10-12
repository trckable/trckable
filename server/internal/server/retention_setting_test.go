package server

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// "Keep visits for 30 days · Older visits are deleted daily. Nothing else is
// touched." The setting goes in through the API the dashboard uses, the daily
// pass reads it, and a site that kept nothing special loses nothing.
func TestKeepVisitsForDeletesOlderVisitsOnly(t *testing.T) {
	const token = "tkb_test_api_0123456789" //nolint:gosec // a test value
	s := newTestServer(t, config.Config{APIToken: token})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- s.Run(ctx) }()
	defer func() {
		cancel()
		<-done
	}()

	kept, _ := s.ctl.CreateSite(ctx, sqlite.DefaultAccount, "kept.example", "")
	trimmed, _ := s.ctl.CreateSite(ctx, sqlite.DefaultAccount, "trimmed.example", "")

	now := time.Now()
	var id uint64
	add := func(site string, ago time.Duration) {
		id++
		ev := event.Event{Site: site, Kind: event.KindPageview, EventID: id, TS: now.Add(-ago).UnixMilli(), Visitor: id, Path: "/"}
		b, _ := ev.Marshal()
		if _, err := s.log.Append(ctx, b); err != nil {
			t.Fatal(err)
		}
	}
	day := 24 * time.Hour
	for _, site := range []string{kept, trimmed} {
		add(site, 90*day)
		add(site, 40*day)
		add(site, 20*day)
		add(site, time.Hour)
	}

	// "30 days", chosen the way the dashboard does: the site's config, saved whole.
	put := func(site string, body string) int {
		r := httptest.NewRequest(http.MethodPut, "/api/v1/sites/"+site+"/config", bytes.NewBufferString(body))
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Trckable-Request", "1")
		w := httptest.NewRecorder()
		s.http.Handler.ServeHTTP(w, r)
		return w.Code
	}
	if code := put(trimmed, `{"retention_days":30,"week_start":1}`); code != http.StatusOK {
		t.Fatalf("saving 30 days: %d", code)
	}
	if code := put(trimmed, `{"retention_days":3}`); code != http.StatusBadRequest {
		t.Fatalf("fewer than 7 days was accepted: %d", code)
	}

	deadline := time.Now().Add(20 * time.Second)
	for {
		if w := s.writer.Load(); w != nil && w.Ready() && w.Applied() >= 8 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the writer did not take the events in")
		}
		time.Sleep(20 * time.Millisecond)
	}

	count := func(site string) int {
		var n int
		if err := s.duck.Load().DB.QueryRowContext(ctx, `SELECT count(*) FROM events WHERE site_id = ?`, site).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if err := s.pruneOnce(ctx); err != nil {
		t.Fatal(err)
	}
	if n := count(trimmed); n != 2 {
		t.Fatalf("a site that keeps 30 days has %d visits, want the 20-day-old and the recent one", n)
	}
	if n := count(kept); n != 4 {
		t.Fatalf("a site that keeps everything lost visits: %d of 4 left", n)
	}

	// Back to "Keep everything": the plan is empty, nothing else is deleted later.
	if code := put(trimmed, `{"retention_days":0,"week_start":1}`); code != http.StatusOK {
		t.Fatalf("saving keep everything: %d", code)
	}
	plan, _ := s.ctl.RetentionPlan(ctx)
	if len(plan) != 0 {
		t.Fatalf("a plan remains after Keep everything: %v", plan)
	}
}
