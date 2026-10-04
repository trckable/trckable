package writer

import (
	"context"
	"database/sql"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/wal"
)

type env struct {
	dir   string
	log   *wal.Log
	store *duck.Store
}

func newEnv(t *testing.T, dir string) *env {
	t.Helper()
	l, err := wal.Open(filepath.Join(dir, "wal"), wal.Options{NoSync: true})
	if err != nil {
		t.Fatal(err)
	}
	s, err := duck.Open(context.Background(), filepath.Join(dir, "a.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	return &env{dir: dir, log: l, store: s}
}

func (e *env) close() { e.log.Close(); e.store.Close() }

func (e *env) append(t *testing.T, ev event.Event) {
	t.Helper()
	b, _ := ev.Marshal()
	if _, err := e.log.Append(context.Background(), b); err != nil {
		t.Fatal(err)
	}
}

// runUntil starts a writer and stops it once hwm reaches target.
func (e *env) runUntil(t *testing.T, target uint64) {
	t.Helper()
	w := New(e.log, e.store, Options{FlushEvery: 20 * time.Millisecond})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Run(ctx) }()
	deadline := time.Now().Add(10 * time.Second)
	for w.Applied() < target {
		if time.Now().After(deadline) {
			t.Fatalf("writer stuck at %d, want %d", w.Applied(), target)
		}
		time.Sleep(5 * time.Millisecond)
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func (e *env) count(t *testing.T, q string, args ...any) int64 {
	t.Helper()
	var n int64
	if err := e.store.DB.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func pv(site string, visitor, id uint64, ts int64) event.Event {
	return event.Event{Site: site, Kind: event.KindPageview, EventID: id, TS: ts, Visitor: visitor, Path: "/"}
}

func TestExactlyOnceAcrossRestartsWithRetries(t *testing.T) {
	dir := t.TempDir()
	e := newEnv(t, dir)
	base := time.Now().Add(-time.Hour).UnixMilli()

	// 1,000 unique events plus 200 retries of already-sent ids.
	for i := uint64(1); i <= 1000; i++ {
		e.append(t, pv("s1", i%50+1, i, base+int64(i)))
		if i%5 == 0 {
			e.append(t, pv("s1", i%50+1, i, base+int64(i))) // retry
		}
	}
	e.runUntil(t, 1200)

	// Writer stops; more traffic arrives (including retries of old ids).
	for i := uint64(1001); i <= 1500; i++ {
		e.append(t, pv("s1", i%50+1, i, base+int64(i)))
	}
	for i := uint64(10); i <= 100; i += 10 {
		e.append(t, pv("s1", i%50+1, i, base+int64(i))) // late retries across the restart
	}
	e.runUntil(t, 1710)

	if n := e.count(t, `SELECT count(*) FROM events`); n != 1500 {
		t.Fatalf("rows = %d, want 1500", n)
	}
	if n := e.count(t, `SELECT count(DISTINCT event_id) FROM events`); n != 1500 {
		t.Fatalf("distinct event ids = %d, want 1500", n)
	}
	if n := e.count(t, `SELECT hwm FROM ingest_state`); n != 1710 {
		t.Fatalf("hwm = %d, want 1710", n)
	}
	e.close()

	// Reopen everything (like a process restart): nothing is re-applied.
	e = newEnv(t, dir)
	defer e.close()
	e.append(t, pv("s1", 1, 5000, base+5000))
	e.runUntil(t, 1711)
	if n := e.count(t, `SELECT count(*) FROM events`); n != 1501 {
		t.Fatalf("rows after reopen = %d, want 1501", n)
	}
}

func TestSessionsAreDeterministicOnReplay(t *testing.T) {
	gap := SessionTimeout + 1000
	base := time.Now().Add(-5 * time.Hour).UnixMilli()
	evs := []event.Event{
		pv("s1", 7, 1, base),
		pv("s1", 7, 2, base+60_000),     // same session
		pv("s1", 7, 3, base+60_000+gap), // new session
		pv("s1", 8, 4, base+1000),       // other visitor
		pv("s2", 7, 5, base+2000),       // same visitor id, other site
	}
	ids := func(dir string) []uint64 {
		e := newEnv(t, dir)
		defer e.close()
		for _, ev := range evs {
			e.append(t, ev)
		}
		e.runUntil(t, uint64(len(evs)))
		rows, err := e.store.DB.Query(`SELECT session_id FROM events ORDER BY seq`)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var out []uint64
		for rows.Next() {
			var id uint64
			if err := rows.Scan(&id); err != nil {
				t.Fatal(err)
			}
			out = append(out, id)
		}
		return out
	}
	a, b := ids(t.TempDir()), ids(t.TempDir())
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("session ids differ on replay at %d: %v vs %v", i, a, b)
		}
	}
	if a[0] != a[1] || a[1] == a[2] || a[0] == a[3] || a[0] == a[4] {
		t.Fatalf("unexpected session grouping: %v", a)
	}
}

// Sessions continue correctly across a restart: state is rebuilt from the DB.
func TestSessionContinuesAcrossRestart(t *testing.T) {
	dir := t.TempDir()
	base := time.Now().Add(-10 * time.Minute).UnixMilli()
	e := newEnv(t, dir)
	e.append(t, pv("s1", 42, 1, base))
	e.runUntil(t, 1)
	e.close()

	e = newEnv(t, dir)
	defer e.close()
	e.append(t, pv("s1", 42, 2, base+5*60_000)) // 5 minutes later: same session
	e.runUntil(t, 2)
	if n := e.count(t, `SELECT count(DISTINCT session_id) FROM events`); n != 1 {
		t.Fatalf("sessions = %d, want 1", n)
	}
}

// runAt starts a writer whose clock reads now(), and stops it once hwm reaches target.
func (e *env) runAt(t *testing.T, target uint64, now func() time.Time) *Writer {
	t.Helper()
	w := New(e.log, e.store, Options{FlushEvery: 20 * time.Millisecond, IdleClose: 50 * time.Millisecond})
	w.now = now
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Run(ctx) }()
	deadline := time.Now().Add(10 * time.Second)
	for w.Applied() < target || !w.ready.Load() {
		if time.Now().After(deadline) {
			t.Fatalf("writer stuck at %d, want %d", w.Applied(), target)
		}
		time.Sleep(5 * time.Millisecond)
	}
	time.Sleep(150 * time.Millisecond) // let an idle-close tick run
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	return w
}

func visit(base int64) []event.Event {
	return []event.Event{
		{Site: "s1", Kind: event.KindPageview, EventID: 1, TS: base, Visitor: 9, Path: "/", Channel: "Search", RefHost: "google.com", Country: "DE", Device: "Desktop"},
		{Site: "s1", Kind: event.KindPageview, EventID: 2, TS: base + 60_000, Visitor: 9, Path: "/pricing", Channel: "Direct"},
		{Site: "s1", Kind: event.KindEngagement, EventID: 3, TS: base + 70_000, Visitor: 9, Pageview: 2, EngagedMs: 40_000},
		{Site: "s1", Kind: event.KindEngagement, EventID: 4, TS: base + 90_000, Visitor: 9, Pageview: 2, EngagedMs: 55_000},
		{Site: "s1", Kind: event.KindGoal, EventID: 5, TS: base + 95_000, Visitor: 9, Goal: "signup"},
	}
}

type sessRow struct {
	n                             int64
	channel, entry, exit, country string
	pvs, goals                    int64
	engaged                       int64
}

func (e *env) session(t *testing.T) sessRow {
	t.Helper()
	var r sessRow
	err := e.store.DB.QueryRow(`SELECT count(*), coalesce(any_value(channel), ''), coalesce(any_value(entry_page), ''), coalesce(any_value(exit_page), ''),
		coalesce(any_value(country), ''), coalesce(sum(pvs),0), coalesce(sum(goals),0), coalesce(sum(engaged_ms),0) FROM sessions`).
		Scan(&r.n, &r.channel, &r.entry, &r.exit, &r.country, &r.pvs, &r.goals, &r.engaged)
	if err != nil && r.n != 0 {
		t.Fatal(err)
	}
	return r
}

func TestSessionIsWrittenOnceWithItsRollup(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	base := time.Now().Add(-3 * time.Hour).UnixMilli()
	for _, ev := range visit(base) {
		e.append(t, ev)
	}
	// Clock just after the visit: the session stays open (snapshot only).
	w := e.runAt(t, 5, func() time.Time { return time.UnixMilli(base + 5*60_000) })
	if n := e.count(t, `SELECT count(*) FROM sessions`); n != 0 {
		t.Fatalf("session written while still open: %d", n)
	}
	open, ok := w.OpenSessions("s1")
	if !ok || len(open) != 1 || open[0].Pageviews != 2 {
		t.Fatalf("open snapshot: ok=%v %+v", ok, open)
	}
	// Clock 2 hours later: the session is closed and written, exactly once.
	e.runAt(t, 5, func() time.Time { return time.UnixMilli(base + 2*3600_000) })
	e.runAt(t, 5, func() time.Time { return time.UnixMilli(base + 3*3600_000) })
	r := e.session(t)
	if r.n != 1 {
		t.Fatalf("sessions rows = %d, want exactly 1", r.n)
	}
	if r.channel != "Search" || r.entry != "/" || r.exit != "/pricing" || r.country != "DE" {
		t.Fatalf("rollup dims: %+v (entry pageview must decide the source)", r)
	}
	if r.pvs != 2 || r.goals != 1 || r.engaged != 55_000 {
		t.Fatalf("rollup counts: %+v (engagement is the max running total)", r)
	}
}

// A restart while the session is open must recover it from the events and
// still write it exactly once — with every event counted.
func TestOpenSessionSurvivesRestart(t *testing.T) {
	dir := t.TempDir()
	base := time.Now().Add(-3 * time.Hour).UnixMilli()
	ev := visit(base)
	e := newEnv(t, dir)
	for _, x := range ev[:3] {
		e.append(t, x)
	}
	e.runAt(t, 3, func() time.Time { return time.UnixMilli(base + 2*60_000) })
	e.close() // "crash" with the session open in memory only

	e = newEnv(t, dir)
	defer e.close()
	for _, x := range ev[3:] {
		e.append(t, x)
	}
	e.runAt(t, 5, func() time.Time { return time.UnixMilli(base + 2*60_000 + 60_000) })
	if n := e.count(t, `SELECT count(*) FROM sessions`); n != 0 {
		t.Fatalf("written too early: %d", n)
	}
	e.runAt(t, 5, func() time.Time { return time.UnixMilli(base + 4*3600_000) })
	r := e.session(t)
	if r.n != 1 || r.pvs != 2 || r.goals != 1 || r.engaged != 55_000 || r.channel != "Search" {
		t.Fatalf("after restart: %+v", r)
	}
	if n := e.count(t, `SELECT count(DISTINCT session_id) FROM events`); n != 1 {
		t.Fatalf("events split across %d sessions", n)
	}
}

// Replaying WAL records after a long outage must continue the recovered
// session, not close it early by wall-clock time and split the visit.
func TestRecoveryDoesNotSplitAVisitStillInTheWAL(t *testing.T) {
	dir := t.TempDir()
	base := time.Now().Add(-10 * time.Hour).UnixMilli()
	ev := visit(base)
	e := newEnv(t, dir)
	e.append(t, ev[0])
	e.runAt(t, 1, func() time.Time { return time.UnixMilli(base + 60_000) })
	e.close()

	// While down, more of the visit reached the WAL but was never applied.
	e = newEnv(t, dir)
	defer e.close()
	for _, x := range ev[1:] {
		e.append(t, x)
	}
	// Server comes back hours later.
	e.runAt(t, 5, func() time.Time { return time.UnixMilli(base + 8*3600_000) })
	r := e.session(t)
	if r.n != 1 || r.pvs != 2 || r.exit != "/pricing" {
		t.Fatalf("visit split or incomplete after outage: %+v", r)
	}
}

// Deleting a site must remove its rows from the analytics store, and only its
// rows. The purge runs on the writer's connection while it is idle, which is
// exactly when a person clicks "delete" — so this also proves the writer wakes
// up for maintenance instead of waiting for the next visit.
func TestPurgeSiteRemovesOnlyThatSite(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	base := time.Now().Add(-2 * time.Hour).UnixMilli()
	for i, ev := range []event.Event{
		pv("gone", 1, 1, base),
		pv("gone", 1, 2, base+1000),
		pv("stays", 2, 3, base),
	} {
		_ = i
		e.append(t, ev)
	}

	w := New(e.log, e.store, Options{FlushEvery: 20 * time.Millisecond, CloseAfter: time.Millisecond})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Run(ctx) }()
	deadline := time.Now().Add(10 * time.Second)
	for w.Applied() < 3 || e.count(t, `SELECT count(*) FROM sessions`) < 2 {
		if time.Now().After(deadline) {
			t.Fatalf("writer stuck at %d", w.Applied())
		}
		time.Sleep(5 * time.Millisecond)
	}

	// The writer is now parked waiting for events: a purge must still run
	// promptly (the default idle wait is a minute).
	pctx, pcancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer pcancel()
	if _, _, err := w.PurgeSite(pctx, "gone"); err != nil {
		t.Fatalf("purge: %v", err)
	}
	if n := e.count(t, `SELECT count(*) FROM events WHERE site_id = 'gone'`); n != 0 {
		t.Fatalf("events left for the deleted site: %d", n)
	}
	if n := e.count(t, `SELECT count(*) FROM sessions WHERE site_id = 'gone'`); n != 0 {
		t.Fatalf("sessions left for the deleted site: %d", n)
	}
	if n := e.count(t, `SELECT count(*) FROM events WHERE site_id = 'stays'`); n != 1 {
		t.Fatalf("other site's events: %d, want 1", n)
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

// Retention deletes what is past a site's limit and nothing else.
func TestPruneBeforeKeepsRecentRows(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	now := time.Now()
	old := now.Add(-40 * 24 * time.Hour).UnixMilli()
	recent := now.Add(-2 * time.Hour).UnixMilli()
	e.append(t, pv("s1", 1, 1, old))
	e.append(t, pv("s1", 2, 2, recent))
	e.append(t, pv("s2", 3, 3, old))

	w := New(e.log, e.store, Options{FlushEvery: 20 * time.Millisecond, CloseAfter: time.Millisecond})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Run(ctx) }()
	deadline := time.Now().Add(10 * time.Second)
	for w.Applied() < 3 {
		if time.Now().After(deadline) {
			t.Fatalf("writer stuck at %d", w.Applied())
		}
		time.Sleep(5 * time.Millisecond)
	}

	cutoff := now.Add(-30 * 24 * time.Hour).UnixMilli()
	pctx, pcancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer pcancel()
	if _, err := w.PruneBefore(pctx, "s1", cutoff); err != nil {
		t.Fatalf("prune: %v", err)
	}
	if n := e.count(t, `SELECT count(*) FROM events WHERE site_id = 's1'`); n != 1 {
		t.Fatalf("s1 events after pruning: %d, want 1 (the recent one)", n)
	}
	if n := e.count(t, `SELECT count(*) FROM events WHERE site_id = 's2'`); n != 1 {
		t.Fatalf("another site lost rows: %d", n)
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

// Importing the same history twice, with a restart in between as an import
// needs, stores it once: old ids are outside the in-memory window, so they
// are checked against what is stored.
func TestImportingTwiceStoresOnce(t *testing.T) {
	dir := t.TempDir()
	e := newEnv(t, dir)
	old := time.Now().Add(-90 * 24 * time.Hour).UnixMilli()
	imported := func(i uint64) event.Event {
		ev := pv("s1", i%20+1, 1_000_000+i, old+int64(i)*60_000) //nolint:gosec // i is a small loop counter
		ev.Imported = true
		return ev
	}
	for i := uint64(1); i <= 300; i++ {
		e.append(t, imported(i))
	}
	e.runUntil(t, 300)
	if n := e.count(t, `SELECT count(*) FROM events`); n != 300 {
		t.Fatalf("first import: %d rows", n)
	}
	e.close()

	e = newEnv(t, dir)
	defer e.close()
	for i := uint64(1); i <= 300; i++ {
		e.append(t, imported(i))
	}
	e.append(t, imported(301)) // one new row in the second file
	e.runUntil(t, 601)
	if n := e.count(t, `SELECT count(*) FROM events`); n != 301 {
		t.Fatalf("after importing the same file again: %d rows, want 301", n)
	}
}

// A job queued in the moment between Run checking for jobs and arming the
// idle wait must still run at once, not after the next event or IdleClose.
func TestJobQueuedWhileParkingRunsAtOnce(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w := New(e.log, e.store, Options{FlushEvery: 20 * time.Millisecond, IdleClose: time.Hour})
	ran := make(chan struct{})
	var once sync.Once
	w.parking = func() {
		once.Do(func() {
			w.jobs <- maintenance{job: func(context.Context, *sql.Conn) error { close(ran); return nil }, done: make(chan error, 1)}
			w.interrupt()
		})
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Run(ctx) }()
	defer func() {
		cancel()
		if err := <-done; err != nil {
			t.Error(err)
		}
	}()
	select {
	case <-ran:
	case <-time.After(5 * time.Second):
		t.Fatal("the job waited for the idle timer")
	}
}

// A page read for longer than the session timeout reports its engaged time
// only when it is hidden, long after the last event. That report belongs to the
// visit its page view opened: it must extend it, not start a visit of its own
// (which has no page view and would be dropped, taking the time with it).
func TestLongReadKeepsItsTimeInItsOwnSession(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	base := time.Now().Add(-3 * time.Hour).UnixMilli()
	read := int64(35 * 60_000)
	e.append(t, event.Event{Site: "s1", Kind: event.KindPageview, EventID: 1, TS: base, Visitor: 9, Pageview: 100, Path: "/docs", Channel: "Search"})
	e.append(t, event.Event{Site: "s1", Kind: event.KindEngagement, EventID: 2, TS: base + read, Visitor: 9, Pageview: 100, EngagedMs: uint32(read)})
	e.runAt(t, 2, func() time.Time { return time.UnixMilli(base + read + 60_000) })
	e.runAt(t, 2, func() time.Time { return time.UnixMilli(base + 4*3600_000) })

	r := e.session(t)
	if r.n != 1 || r.pvs != 1 || r.engaged != read || r.channel != "Search" {
		t.Fatalf("long read: %+v, want one session with 1 pageview and %d ms engaged", r, read)
	}
	if n := e.count(t, `SELECT count(DISTINCT session_id) FROM events`); n != 1 {
		t.Fatalf("the report opened %d sessions, want 1", n)
	}
	if d := e.count(t, `SELECT cast(max(dur) AS BIGINT) FROM sessions`); d < read/1000 {
		t.Fatalf("session duration %d s, want at least %d", d, read/1000)
	}
}

// The same, when the server restarts while the page is being read: the
// recovered session still knows which page views are its own.
func TestLongReadAfterRestartKeepsItsTime(t *testing.T) {
	dir := t.TempDir()
	base := time.Now().Add(-3 * time.Hour).UnixMilli()
	read := int64(40 * 60_000)
	e := newEnv(t, dir)
	e.append(t, event.Event{Site: "s1", Kind: event.KindPageview, EventID: 1, TS: base, Visitor: 9, Pageview: 100, Path: "/docs"})
	e.runAt(t, 1, func() time.Time { return time.UnixMilli(base + 60_000) })
	e.close()

	e = newEnv(t, dir)
	defer e.close()
	e.append(t, event.Event{Site: "s1", Kind: event.KindEngagement, EventID: 2, TS: base + read, Visitor: 9, Pageview: 100, EngagedMs: uint32(read)})
	e.runAt(t, 2, func() time.Time { return time.UnixMilli(base + read + 60_000) })
	e.runAt(t, 2, func() time.Time { return time.UnixMilli(base + 4*3600_000) })
	if r := e.session(t); r.n != 1 || r.pvs != 1 || r.engaged != read {
		t.Fatalf("long read across a restart: %+v", r)
	}
}

// Only the visitor's own page views can reach back: a report for a page the
// open session never saw is not folded into it.
func TestEngagementForAnotherPageDoesNotStretchASession(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	base := time.Now().Add(-3 * time.Hour).UnixMilli()
	late := int64(35 * 60_000)
	e.append(t, event.Event{Site: "s1", Kind: event.KindPageview, EventID: 1, TS: base, Visitor: 9, Pageview: 100, Path: "/a"})
	e.append(t, event.Event{Site: "s1", Kind: event.KindEngagement, EventID: 2, TS: base + late, Visitor: 9, Pageview: 777, EngagedMs: 5000})
	e.runAt(t, 2, func() time.Time { return time.UnixMilli(base + late + 60_000) })
	e.runAt(t, 2, func() time.Time { return time.UnixMilli(base + 4*3600_000) })
	if r := e.session(t); r.n != 1 || r.engaged != 0 {
		t.Fatalf("a stranger's report was folded in: %+v", r)
	}
}

// The tracker keeps an unsent event for 24 hours. When the server comes back
// the visit arrives whole and old: one session, written at once, on the day it
// happened and not on the day it arrived.
func TestAccuracyAVisitMadeDuringALongOutageIsOneSessionOnItsOwnDay(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	base := time.Now().Add(-20 * time.Hour).UnixMilli()
	for _, ev := range visit(base) {
		ev.Late = true // the browser kept it back for twenty hours
		e.append(t, ev)
	}
	e.runAt(t, 5, func() time.Time { return time.UnixMilli(base + 20*3600_000) })
	if n := e.count(t, `SELECT count(*) FROM sessions`); n != 0 {
		t.Fatalf("the visit was written the moment it arrived (%d sessions): more of it may be on its way", n)
	}
	e.runAt(t, 5, func() time.Time { return time.UnixMilli(base + 21*3600_000 + 1) }) // an hour on

	if r := e.session(t); r.n != 1 || r.pvs != 2 || r.goals != 1 {
		t.Fatalf("a late visit: %+v, want one session with 2 page views and a goal", r)
	}
	if n := e.count(t, `SELECT count(*) FROM sessions WHERE epoch_ms(start) = ?`, base); n != 1 {
		t.Fatalf("the session does not start when the visit did")
	}
	if n := e.count(t, `SELECT count(*) FROM events WHERE epoch_ms(ts) BETWEEN ? AND ?`, base, base+95_000); n != 5 {
		t.Fatalf("%d events on the day of the visit, want 5", n)
	}
}

// A resend that comes a day after the first copy, across a restart, is
// stored once: the ids of what was stored are read back at boot.
func TestAccuracyAResendAfterADayAndARestartIsStoredOnce(t *testing.T) {
	dir := t.TempDir()
	base := time.Now().Add(-26 * time.Hour).UnixMilli()
	e := newEnv(t, dir)
	e.append(t, pv("s1", 1, 11, base))
	e.append(t, pv("s1", 2, 12, base+1000))
	e.runAt(t, 2, func() time.Time { return time.UnixMilli(base + 2000) })
	e.close()

	e = newEnv(t, dir)
	defer e.close()
	e.append(t, pv("s1", 1, 11, base))      // the same event, sent again 24 h later (age 24 h)
	e.append(t, pv("s1", 2, 12, base+1000)) // and the other
	e.append(t, pv("s1", 3, 13, base+500))  // one that never got through
	e.runAt(t, 5, func() time.Time { return time.UnixMilli(base + 24*3600_000 + 2000) })
	if n := e.count(t, `SELECT count(*) FROM events`); n != 3 {
		t.Fatalf("%d rows, want 3: the resends were stored again", n)
	}
}

// A visit's browser version and the width of its entry pageview survive a
// restart while the session is open, and are written with it.
func TestVersionAndScreenSurviveRestart(t *testing.T) {
	dir := t.TempDir()
	base := time.Now().Add(-3 * time.Hour).UnixMilli()
	first := event.Event{Site: "s1", Kind: event.KindPageview, EventID: 1, TS: base, Visitor: 9, Pageview: 1, Path: "/", Browser: "Chrome", BrowserVersion: "Chrome 130", Screen: 390}
	later := event.Event{Site: "s1", Kind: event.KindPageview, EventID: 2, TS: base + 60_000, Visitor: 9, Pageview: 2, Path: "/pricing", Browser: "Chrome", BrowserVersion: "Chrome 130", Screen: 1440}
	e := newEnv(t, dir)
	e.append(t, first)
	e.runAt(t, 1, func() time.Time { return time.UnixMilli(base + 30_000) })
	e.close() // the session is open in memory only

	e = newEnv(t, dir)
	defer e.close()
	e.append(t, later)
	e.runAt(t, 2, func() time.Time { return time.UnixMilli(base + 4*3600_000) })
	var version string
	var screen int
	if err := e.store.DB.QueryRow(`SELECT browser_version, screen FROM sessions`).Scan(&version, &screen); err != nil {
		t.Fatal(err)
	}
	if version != "Chrome 130" || screen != 390 {
		t.Fatalf("session: %q at %d px, want Chrome 130 at the entry's 390", version, screen)
	}
}
