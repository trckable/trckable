package writer

import (
	"context"
	"path/filepath"
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

func (e *env) count(t *testing.T, q string) int64 {
	t.Helper()
	var n int64
	if err := e.store.DB.QueryRow(q).Scan(&n); err != nil {
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
			rows.Scan(&id)
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
	err := e.store.DB.QueryRow(`SELECT count(*), any_value(channel), any_value(entry_page), any_value(exit_page),
		any_value(country), coalesce(sum(pvs),0), coalesce(sum(goals),0), coalesce(sum(engaged_ms),0) FROM sessions`).
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
