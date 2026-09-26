package writer

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"testing"
	"time"
)

// siteList stands in for the control database's sites table.
type siteList struct {
	mu sync.Mutex
	on map[string]bool
}

func (l *siteList) set(site string, exists bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.on[site] = exists
}

func (l *siteList) exists(_ context.Context, ids []string) (map[string]bool, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := map[string]bool{}
	for _, id := range ids {
		if l.on[id] {
			out[id] = true
		}
	}
	return out, nil
}

// start runs a writer until stop is called.
func (e *env) start(t *testing.T, opts Options) (w *Writer, stop func()) {
	t.Helper()
	w = New(e.log, e.store, opts)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Run(ctx) }()
	return w, func() {
		cancel()
		if err := <-done; err != nil {
			t.Fatal(err)
		}
	}
}

func waitApplied(t *testing.T, w *Writer, target uint64) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for w.Applied() < target {
		if time.Now().After(deadline) {
			t.Fatalf("writer stuck at %d, want %d", w.Applied(), target)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// A deleted site's events can still be in the WAL: queued behind other work
// when the purge runs, sent by a request that checked the site just before
// it went, or waiting for a restart. None of them may come back, a site
// added again for the same domain (a new id) starts empty, and every other
// site keeps exactly what it sent.
func TestDeletedSiteQueuedEventsAreDropped(t *testing.T) {
	dir := t.TempDir()
	e := newEnv(t, dir)
	sites := &siteList{on: map[string]bool{"gone": true, "kept": true}}
	base := time.Now().Add(-10 * time.Minute).UnixMilli()
	var id uint64
	add := func(site string, n int) {
		for i := 0; i < n; i++ {
			id++
			e.append(t, pv(site, uint64(i%7+1), id, base+int64(id)))
		}
	}
	count := func(site string) int64 {
		return e.count(t, `SELECT count(*) FROM events WHERE site_id = '`+site+`'`)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	add("gone", 50)
	add("kept", 50)
	w, stop := e.start(t, Options{FlushEvery: 20 * time.Millisecond, Sites: sites.exists})
	waitApplied(t, w, 100)

	// Hold the writer in a maintenance job so new events wait in the WAL,
	// and queue the purge behind it: the purge runs first, then the queued
	// events. This is the order that used to bring them back.
	started, release := make(chan struct{}), make(chan struct{})
	go w.Do(ctx, func(context.Context, *sql.Conn) error { close(started); <-release; return nil })
	<-started
	add("gone", 30)
	add("kept", 30)
	purged := make(chan error, 1)
	go func() { _, _, err := w.PurgeSite(ctx, "gone"); purged <- err }()
	for len(w.jobs) == 0 {
		time.Sleep(time.Millisecond)
	}
	close(release)
	if err := <-purged; err != nil {
		t.Fatal(err)
	}
	waitApplied(t, w, 160)
	// The site still existed when they were applied, so they are there.
	if n := count("gone"); n != 30 {
		t.Fatalf("events applied between the purge and the delete: %d, want 30", n)
	}

	// The site row goes, then the delete sweeps once more.
	sites.set("gone", false)
	if _, _, err := w.PurgeSite(ctx, "gone"); err != nil {
		t.Fatal(err)
	}
	if n := count("gone"); n != 0 {
		t.Fatalf("after the sweep: %d rows, want 0", n)
	}
	// A request that saw the site just before it went appends afterwards.
	add("gone", 20)
	add("kept", 20)
	waitApplied(t, w, 200)
	if n := count("gone"); n != 0 {
		t.Fatalf("late events came back: %d rows", n)
	}
	if open, _ := w.OpenSessions("gone"); len(open) != 0 {
		t.Fatalf("the deleted site still has %d open sessions in memory", len(open))
	}
	stop()

	// Events still queued at a restart are replayed from the WAL and dropped
	// there too. The same domain added again is a new site with a new id.
	add("gone", 25)
	add("kept", 25)
	sites.set("again", true)
	add("again", 10)
	e.close()
	e = newEnv(t, dir)
	defer e.close()
	w, stop = e.start(t, Options{FlushEvery: 20 * time.Millisecond, CloseAfter: time.Millisecond, Sites: sites.exists})
	waitApplied(t, w, 260)
	// CloseAfter of a millisecond writes every session: none may be the
	// deleted site's.
	deadline := time.Now().Add(10 * time.Second)
	for e.count(t, `SELECT count(*) FROM sessions WHERE site_id = 'again'`) == 0 {
		if time.Now().After(deadline) {
			t.Fatal("sessions were never written")
		}
		time.Sleep(5 * time.Millisecond)
	}
	stop()

	for site, want := range map[string]int64{"gone": 0, "kept": 125, "again": 10} {
		if n := count(site); n != want {
			t.Errorf("%s: %d rows, want %d", site, n, want)
		}
	}
	if n := e.count(t, `SELECT count(*) FROM sessions WHERE site_id = 'gone'`); n != 0 {
		t.Errorf("sessions written for the deleted site: %d", n)
	}
	if n := e.count(t, `SELECT count(*) - count(DISTINCT event_id) FROM events`); n != 0 {
		t.Errorf("%d events stored twice", n)
	}
	if n := e.count(t, `SELECT hwm FROM ingest_state`); n != 260 {
		t.Errorf("hwm = %d, want 260: dropped records still count as applied", n)
	}
}

// When the sites cannot be looked up, nothing is dropped: a deleted site's
// leftovers can be deleted again, a live site's lost traffic cannot be
// brought back.
func TestSiteLookupFailureKeepsEvents(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	base := time.Now().Add(-10 * time.Minute).UnixMilli()
	for i := uint64(1); i <= 20; i++ {
		e.append(t, pv("s1", i%3+1, i, base+int64(i)))
	}
	broken := func(context.Context, []string) (map[string]bool, error) { return nil, errors.New("database is locked") }
	w, stop := e.start(t, Options{FlushEvery: 20 * time.Millisecond, Sites: broken})
	waitApplied(t, w, 20)
	stop()
	if n := e.count(t, `SELECT count(*) FROM events`); n != 20 {
		t.Fatalf("rows = %d, want 20", n)
	}
}
