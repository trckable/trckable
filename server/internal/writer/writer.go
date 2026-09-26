// Package writer is the single goroutine that moves events from the WAL into
// DuckDB, exactly once, and maintains the sessions rollup.
//
// Guarantees (plan §5.2):
//   - Records are read from the WAL in seq order. Each transaction holds the
//     events, every session that closed, the WAL high-water mark and the
//     sessions watermark — a crash keeps all or none. On boot we resume at hwm+1.
//   - Retried events are dropped by event_id (dedupe window).
//   - Sessions are assigned here, deterministically, and rolled up in memory
//     while open; each is written once, DefaultCloseAfter after its last event.
package writer

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	duckdb "github.com/duckdb/duckdb-go/v2"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/wal"
)

// Options tune batching.
type Options struct {
	BatchMax   int              // max records per transaction (default 5000)
	FlushEvery time.Duration    // max time a record waits before commit (default 1s)
	IdleClose  time.Duration    // how often idle sessions are closed without traffic (default 1m)
	Now        func() time.Time // clock (tests); default time.Now
	CloseAfter time.Duration    // idle time before a session is written (default 60m; tests only)
	// Sites reports which of the given site ids still exist. Events for any
	// other site are dropped: a deleted site's events can still be queued in
	// the WAL, and without this they would be written back after its purge.
	// Nil keeps every event.
	Sites func(ctx context.Context, ids []string) (map[string]bool, error)
}

// Writer applies WAL records to DuckDB.
type Writer struct {
	log   *wal.Log
	store *duck.Store
	opts  Options
	now   func() time.Time

	sess    *sessionizer
	dd      *dedupe
	pending []wal.Record // records peeked at startup, committed first

	jobs chan maintenance // rare maintenance run on the writer's connection
	// wake interrupts the idle wait so a queued job runs at once instead of
	// waiting for the next event or the idle timer.
	wakeMu sync.Mutex
	wake   context.CancelFunc

	applied atomic.Uint64 // hwm, readable from other goroutines (health, pruning)
	ready   atomic.Bool   // sessions restored; snapshots are complete

	// OnCommit, if set, is called after each committed batch with the stored
	// events (used by realtime). It must not block.
	OnCommit func([]event.Event)
}

// New creates a writer. Call Run to start it.
func New(log *wal.Log, store *duck.Store, opts Options) *Writer {
	if opts.BatchMax <= 0 {
		opts.BatchMax = 5000
	}
	if opts.FlushEvery <= 0 {
		opts.FlushEvery = time.Second
	}
	if opts.IdleClose <= 0 {
		opts.IdleClose = time.Minute
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	return &Writer{
		log:   log,
		store: store,
		opts:  opts,
		now:   now,
		sess:  newSessionizer(opts.CloseAfter.Milliseconds()),
		dd:    newDedupe(30*60*1000, 4_000_000),
		jobs:  make(chan maintenance, 8),
	}
}

// Applied returns the highest WAL seq committed to DuckDB.
func (w *Writer) Applied() uint64 { return w.applied.Load() }

// Ready reports whether the writer has restored its state after boot.
func (w *Writer) Ready() bool { return w.ready.Load() }

// OpenSessions returns a copy of the site's sessions not yet written to the
// sessions table (so reports include live visits). ok is false until the
// writer has restored state after boot.
func (w *Writer) OpenSessions(site string) (s []Session, ok bool) {
	if !w.ready.Load() {
		return nil, false
	}
	return w.sess.snapshot(site), true
}

// Run replays anything not yet applied, then tails the WAL until ctx is done.
// When ctx is cancelled it drains what is already committed to the WAL
// (without waiting for more), commits it, and returns.
// Do runs a job on the writer's connection (the only one allowed to write to
// DuckDB) and waits for it. Used for maintenance such as purging a deleted
// site's data.
func (w *Writer) Do(ctx context.Context, job func(ctx context.Context, conn *sql.Conn) error) error {
	done := make(chan error, 1)
	select {
	case w.jobs <- maintenance{job: job, done: done}:
		w.interrupt() // the writer may be parked waiting for events
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// interrupt ends an idle wait, if there is one.
func (w *Writer) interrupt() {
	w.wakeMu.Lock()
	cancel := w.wake
	w.wakeMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (w *Writer) setWake(cancel context.CancelFunc) {
	w.wakeMu.Lock()
	w.wake = cancel
	w.wakeMu.Unlock()
}

type maintenance struct {
	job  func(ctx context.Context, conn *sql.Conn) error
	done chan error
}

func (w *Writer) Run(ctx context.Context) error {
	hwm, err := w.store.HWM(ctx)
	if err != nil {
		return fmt.Errorf("read hwm: %w", err)
	}
	w.applied.Store(hwm)

	rd, err := w.log.NewReader(hwm + 1)
	if err != nil {
		return err
	}
	defer rd.Close()

	if first, _ := rd.TryRead(1); len(first) > 0 {
		w.pending = first
	}
	conn, err := w.store.DB.Conn(context.Background())
	if err != nil {
		return err
	}
	defer conn.Close()

	if err := w.restore(ctx, conn); err != nil {
		return fmt.Errorf("restore state: %w", err)
	}
	w.ready.Store(true)

	for {
		// Maintenance first: it is rare, and it must not wait behind traffic.
		for {
			select {
			case m := <-w.jobs:
				m.done <- m.job(context.Background(), conn)
				continue
			default:
			}
			break
		}
		batch, err := w.collect(ctx, rd)
		if len(batch) > 0 {
			// Never abandon a batch that is already out of the WAL reader.
			if cerr := w.commit(context.Background(), conn, batch); cerr != nil {
				return cerr
			}
		} else if err == nil {
			// Quiet: close idle sessions so they reach the sessions table.
			if cerr := w.commit(context.Background(), conn, nil); cerr != nil {
				return cerr
			}
		}
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return w.drain(conn, rd)
			}
			return err
		}
	}
}

// collect returns the next batch; an empty batch with a nil error means the
// IdleClose interval passed without traffic.
func (w *Writer) collect(ctx context.Context, rd *wal.Reader) ([]wal.Record, error) {
	batch := w.pending
	w.pending = nil
	if len(batch) == 0 {
		ictx, cancel := context.WithTimeout(ctx, w.opts.IdleClose)
		w.setWake(cancel) // Do() can end this wait early
		recs, err := rd.Next(ictx, w.opts.BatchMax)
		w.setWake(nil)
		cancel()
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			// Deadline: nothing arrived. Canceled with the outer context still
			// alive: a maintenance job is waiting. Both mean "no records".
			if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
				return nil, nil
			}
			return nil, err
		}
		batch = recs
	}
	deadline := time.Now().Add(w.opts.FlushEvery)
	for len(batch) < w.opts.BatchMax {
		wait := time.Until(deadline)
		if wait <= 0 {
			break
		}
		cctx, cancel := context.WithTimeout(ctx, wait)
		recs, err := rd.Next(cctx, w.opts.BatchMax-len(batch))
		cancel()
		batch = append(batch, recs...)
		if err != nil {
			if ctx.Err() != nil {
				return batch, ctx.Err()
			}
			break // flush timer expired
		}
	}
	return batch, nil
}

// drain commits everything already durable in the WAL, then returns.
func (w *Writer) drain(conn *sql.Conn, rd *wal.Reader) error {
	for {
		recs, err := rd.TryRead(w.opts.BatchMax)
		if err != nil {
			return err
		}
		if len(recs) == 0 {
			return nil
		}
		if err := w.commit(context.Background(), conn, recs); err != nil {
			return err
		}
	}
}

// decoded is a WAL record read back into its event.
type decoded struct {
	seq uint64
	e   event.Event
}

// importedAlready returns which imported event ids in a batch are already in
// the store. It looks only inside the batch's own time range, so the scan is
// a few row groups, not the table; a batch with nothing imported costs
// nothing.
func (w *Writer) importedAlready(ctx context.Context, conn *sql.Conn, batch []decoded) (map[uint64]bool, error) {
	var ids []string
	var lo, hi int64
	for _, d := range batch {
		if !d.e.Imported || d.e.EventID == 0 {
			continue
		}
		if len(ids) == 0 || d.e.TS < lo {
			lo = d.e.TS
		}
		if d.e.TS > hi {
			hi = d.e.TS
		}
		ids = append(ids, strconv.FormatUint(d.e.EventID, 10))
	}
	if len(ids) == 0 {
		return nil, nil
	}
	// The ids are numbers written by this code, so they go into the query as
	// a list; the times are parameters.
	q := `SELECT event_id FROM events WHERE ts >= ? AND ts <= ? AND event_id IN (` + strings.Join(ids, ",") + `)`
	rows, err := conn.QueryContext(ctx, q, time.UnixMilli(lo).UTC(), time.UnixMilli(hi).UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	have := map[uint64]bool{}
	for rows.Next() {
		var id uint64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		have[id] = true
	}
	return have, rows.Err()
}

// liveSites returns which sites in a batch still exist, or nil to keep every
// event. It asks the control database every batch rather than caching the
// answer: a cache could still say "exists" just after a delete, and that is
// the moment that matters. If the question cannot be answered, events are
// kept: writing a deleted site's leftovers is recoverable (delete it again),
// dropping a live site's traffic is not.
func (w *Writer) liveSites(ctx context.Context, batch []decoded) map[string]bool {
	if w.opts.Sites == nil || len(batch) == 0 {
		return nil
	}
	seen := map[string]bool{}
	var ids []string
	for _, d := range batch {
		if !seen[d.e.Site] {
			seen[d.e.Site] = true
			ids = append(ids, d.e.Site)
		}
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	live, err := w.opts.Sites(ctx, ids)
	if err != nil {
		slog.Warn("writer: could not check which sites exist; keeping the batch", "err", err)
		return nil
	}
	for _, id := range ids {
		if !live[id] {
			slog.Info("writer: dropping queued events of a deleted site", "site", id)
		}
	}
	return live
}

// row is one event ready to append, with its WAL seq and assigned session.
type row struct {
	seq     uint64
	session uint64
	e       event.Event
}

func (w *Writer) commit(ctx context.Context, conn *sql.Conn, batch []wal.Record) error {
	return w.commitAt(ctx, conn, batch, w.now().UnixMilli())
}

// commitAt commits batch and closes sessions idle relative to closeAt (ms).
func (w *Writer) commitAt(ctx context.Context, conn *sql.Conn, batch []wal.Record, closeAt int64) error {
	rows := make([]row, 0, len(batch))
	var closed []*Session
	nowMs := w.now().UnixMilli()
	all := make([]decoded, 0, len(batch))
	for _, r := range batch {
		var e event.Event
		if err := event.Unmarshal(r.Payload, &e); err != nil {
			// A record we cannot decode is a bug; skip it rather than wedge ingest.
			slog.Error("writer: undecodable wal record", "seq", r.Seq, "err", err)
			continue
		}
		all = append(all, decoded{r.Seq, e})
	}
	live := w.liveSites(ctx, all)
	fresh := make([]decoded, 0, len(all))
	for _, d := range all {
		// A deleted site's events are skipped like any other record: the
		// high-water mark still moves past them in this same transaction, so
		// a replay after a crash asks again and gets the same answer.
		if live != nil && !live[d.e.Site] {
			continue
		}
		if w.dd.seen(d.e.EventID, nowMs) {
			continue
		}
		fresh = append(fresh, d)
	}
	// Imported history is older than the in-memory window, and a second
	// import always comes after a restart: its ids are checked against what
	// is stored, so importing the same file twice changes nothing.
	have, err := w.importedAlready(ctx, conn, fresh)
	if err != nil {
		return err
	}
	for _, d := range fresh {
		if d.e.Imported && have[d.e.EventID] {
			continue
		}
		e := d.e
		id, prev := w.sess.assign(&e)
		if prev != nil {
			closed = append(closed, prev)
		}
		rows = append(rows, row{seq: d.seq, session: id, e: e})
	}
	idle, watermark := w.sess.closeIdle(closeAt)
	closed = append(closed, idle...)
	if len(batch) == 0 && len(closed) == 0 {
		return nil
	}

	if _, err := conn.ExecContext(ctx, "BEGIN TRANSACTION"); err != nil {
		return err
	}
	err = conn.Raw(func(dc any) error {
		if len(rows) > 0 {
			app, err := duckdb.NewAppenderFromConn(dc.(driver.Conn), "", "events")
			if err != nil {
				return err
			}
			for i := range rows {
				if err := appendRow(app, &rows[i]); err != nil {
					app.Close()
					return err
				}
			}
			if err := app.Close(); err != nil {
				return err
			}
		}
		return appendSessions(dc.(driver.Conn), closed)
	})
	if err == nil {
		if len(batch) > 0 {
			_, err = conn.ExecContext(ctx, "UPDATE ingest_state SET hwm = ?, sessions_w = ? WHERE id = 1",
				batch[len(batch)-1].Seq, time.UnixMilli(watermark).UTC())
		} else {
			_, err = conn.ExecContext(ctx, "UPDATE ingest_state SET sessions_w = ? WHERE id = 1", time.UnixMilli(watermark).UTC())
		}
	}
	if err != nil {
		_, _ = conn.ExecContext(ctx, "ROLLBACK")
		for _, s := range closed { // keep them open; they will be retried
			w.sess.restore(s)
		}
		return fmt.Errorf("writer commit: %w", err)
	}
	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		return fmt.Errorf("writer commit: %w", err)
	}
	if len(batch) > 0 {
		w.applied.Store(batch[len(batch)-1].Seq)
	}
	if w.OnCommit != nil && len(rows) > 0 {
		out := make([]event.Event, len(rows))
		for i := range rows {
			out[i] = rows[i].e
		}
		w.OnCommit(out)
	}
	return nil
}

func appendSessions(dc driver.Conn, ss []*Session) error {
	if len(ss) == 0 {
		return nil
	}
	app, err := duckdb.NewAppenderFromConn(dc, "", "sessions")
	if err != nil {
		return err
	}
	for _, s := range ss {
		if s.Pageviews == 0 {
			continue // goal-only sessions (server-side events) are not visits
		}
		if err := AppendSession(app, s); err != nil {
			app.Close()
			return err
		}
	}
	return app.Close()
}

// AppendSession writes one session row in the sessions table's column order
// (also used by the query layer for live sessions).
func AppendSession(app *duckdb.Appender, s *Session) error {
	var firstSeen any
	if s.FirstSeen > 0 {
		firstSeen = time.UnixMilli(s.FirstSeen).UTC()
	}
	return app.AppendRow(
		s.Site, s.ID, s.Visitor,
		time.UnixMilli(s.Start).UTC(), time.UnixMilli(s.Last).UTC(), firstSeen,
		nz(s.Channel), nz(s.Referrer), nz(s.EntryPage), nz(s.ExitPage),
		nz(s.Campaign), nz(s.Source), nz(s.Medium),
		nz(s.Country), nz(s.Region), nz(s.City),
		nz(s.Device), nz(s.Browser), nz(s.OS), nz(s.Language),
		s.Pageviews, s.Goals, s.EngagedMs(), s.DurationS(),
	)
}

func appendRow(app *duckdb.Appender, r *row) error {
	e := &r.e
	var props any
	if len(e.Props) > 0 {
		b, _ := json.Marshal(e.Props)
		props = string(b)
	}
	var firstSeen any
	if e.FirstSeen > 0 {
		firstSeen = time.UnixMilli(e.FirstSeen).UTC()
	}
	return app.AppendRow(
		r.seq,
		e.Site,
		time.UnixMilli(e.TS).UTC(),
		e.Kind,
		nzU64(e.EventID),
		e.Visitor,
		firstSeen,
		r.session,
		nzU64(e.Pageview),
		nz(e.Hostname), nz(e.Path),
		nz(e.RefHost), nz(e.RefURL), nz(e.Channel),
		nz(e.UTMSource), nz(e.UTMMedium), nz(e.UTMCampaign), nz(e.UTMTerm), nz(e.UTMContent),
		nz(e.Country), nz(e.Region), nz(e.City),
		nz(e.Browser), nz(e.OS), nz(e.Device), nz(e.Language),
		nzU16(e.Screen),
		nz(e.Goal), props,
		nzU32(e.EngagedMs), nzU8(e.ScrollPct),
		nzU32(e.LCPms), nzU32(e.CLS1k), nzU32(e.INPms),
		nzTrue(e.Imported),
	)
}

// restore rebuilds open sessions and the dedupe window after a restart.
//
// Every session with an event before the stored watermark W is already in the
// sessions table, so only events at or after W are aggregated. Sessions found
// there that are already written (anti-join on last >= W) are skipped; the
// rest are re-opened in memory — or written immediately if they went idle
// while the server was down.
func (w *Writer) restore(ctx context.Context, conn *sql.Conn) error {
	var wm time.Time
	if err := conn.QueryRowContext(ctx, `SELECT sessions_w FROM ingest_state WHERE id = 1`).Scan(&wm); err != nil {
		return err
	}
	rows, err := conn.QueryContext(ctx, `
		WITH ev AS (SELECT * FROM events WHERE ts >= ?),
		done AS (SELECT session_id FROM sessions WHERE last >= ?)
		SELECT site_id, session_id, any_value(visitor_id),
		       epoch_ms(min(ts)), epoch_ms(max(ts)), coalesce(epoch_ms(min(first_seen)), 0),
		       coalesce(arg_min(channel, ts) FILTER (kind = 1), ''), coalesce(arg_min(referrer_host, ts) FILTER (kind = 1), ''),
		       coalesce(arg_min(path, ts) FILTER (kind = 1), ''), coalesce(arg_max(path, ts) FILTER (kind = 1), ''),
		       coalesce(epoch_ms(max(ts) FILTER (kind = 1)), 0),
		       coalesce(arg_min(utm_campaign, ts) FILTER (kind = 1), ''), coalesce(arg_min(utm_source, ts) FILTER (kind = 1), ''),
		       coalesce(arg_min(utm_medium, ts) FILTER (kind = 1), ''),
		       coalesce(any_value(country), ''), coalesce(any_value(region), ''), coalesce(any_value(city), ''),
		       coalesce(any_value(device), ''), coalesce(any_value(browser), ''), coalesce(any_value(os), ''),
		       coalesce(any_value(language), ''),
		       count(*) FILTER (kind = 1), count(*) FILTER (kind = 2)
		FROM ev WHERE session_id NOT IN (SELECT session_id FROM done)
		GROUP BY site_id, session_id`, wm, wm)
	if err != nil {
		return err
	}
	recovered := map[uint64]*Session{}
	for rows.Next() {
		s := &Session{}
		if err := rows.Scan(&s.Site, &s.ID, &s.Visitor, &s.Start, &s.Last, &s.FirstSeen,
			&s.Channel, &s.Referrer, &s.EntryPage, &s.ExitPage, &s.lastPV,
			&s.Campaign, &s.Source, &s.Medium, &s.Country, &s.Region, &s.City,
			&s.Device, &s.Browser, &s.OS, &s.Language, &s.Pageviews, &s.Goals); err != nil {
			rows.Close()
			return err
		}
		recovered[s.ID] = s
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(recovered) > 0 {
		eng, err := conn.QueryContext(ctx, `
			SELECT session_id, pageview_id, max(engaged_ms) FROM events
			WHERE ts >= ? AND kind = 3 AND pageview_id IS NOT NULL GROUP BY ALL`, wm)
		if err != nil {
			return err
		}
		for eng.Next() {
			var sid, pv uint64
			var ms uint32
			if err := eng.Scan(&sid, &pv, &ms); err != nil {
				eng.Close()
				return err
			}
			if s := recovered[sid]; s != nil {
				if s.eng == nil {
					s.eng = map[uint64]uint32{}
				}
				s.eng[pv] = ms
			}
		}
		eng.Close()
	}
	for _, s := range recovered {
		w.sess.restore(s)
	}
	// Sessions that went idle while we were down are written now. "Idle" is
	// measured from the first WAL record still to replay (not the wall clock):
	// those records may continue a recovered session.
	closeAt := w.now().UnixMilli()
	if len(w.pending) > 0 {
		var e event.Event
		if event.Unmarshal(w.pending[0].Payload, &e) == nil && e.TS < closeAt {
			closeAt = e.TS
		}
	}
	if err := w.commitAt(ctx, conn, nil, closeAt); err != nil {
		return err
	}
	if len(recovered) > 0 {
		slog.Info("writer: recovered open sessions", "count", len(recovered))
	}

	// Dedupe window: recent event ids.
	since := w.now().Add(-90 * time.Minute).UTC()
	ids, err := conn.QueryContext(ctx, `SELECT event_id FROM events WHERE ts >= ? AND event_id IS NOT NULL`, since)
	if err != nil {
		return err
	}
	defer ids.Close()
	nowMs := w.now().UnixMilli()
	for ids.Next() {
		var id uint64
		if err := ids.Scan(&id); err != nil {
			return err
		}
		w.dd.seen(id, nowMs)
	}
	return ids.Err()
}

func nz(s string) any {
	if s == "" {
		return nil
	}
	return s
}
func nzU64(v uint64) any {
	if v == 0 {
		return nil
	}
	return v
}
func nzU32(v uint32) any {
	if v == 0 {
		return nil
	}
	return v
}
func nzU16(v uint16) any {
	if v == 0 {
		return nil
	}
	return v
}
func nzTrue(v bool) any {
	if !v {
		return nil
	}
	return true
}

func nzU8(v uint8) any {
	if v == 0 {
		return nil
	}
	return v
}

// PurgeSite removes every analytics row for a site. It runs inside the writer,
// on the connection that owns the tables, so it can never race an ingest
// batch. Payments and settings live in SQLite and are deleted there.
//
// Deleting a site calls it twice: before the site row goes (to count what is
// removed, and to refuse early when the store is not ready), and again once
// it is gone, to sweep what the writer applied in between. From then on
// Options.Sites says the site does not exist, and its queued events are
// dropped.
func (w *Writer) PurgeSite(ctx context.Context, site string) (events, sessions int64, err error) {
	err = w.Do(ctx, func(ctx context.Context, conn *sql.Conn) error {
		for i, table := range []string{"events", "sessions"} {
			res, err := conn.ExecContext(ctx, `DELETE FROM `+table+` WHERE site_id = ?`, site)
			if err != nil {
				return fmt.Errorf("purge %s: %w", table, err)
			}
			n, _ := res.RowsAffected()
			if i == 0 {
				events = n
			} else {
				sessions = n
			}
		}
		// Drop what the sessionizer still holds for that site, so a half-open
		// session cannot write itself back after the delete.
		w.sess.forget(site)
		return nil
	})
	return events, sessions, err
}

// PruneBefore removes a site's events and sessions older than cutoff (a
// millisecond timestamp), for the site's own retention setting. Like
// PurgeSite, it runs on the writer's connection.
func (w *Writer) PruneBefore(ctx context.Context, site string, cutoffMs int64) (int64, error) {
	var removed int64
	err := w.Do(ctx, func(ctx context.Context, conn *sql.Conn) error {
		// Both tables keep a TIMESTAMP: events by when they happened,
		// sessions by when they started.
		for _, q := range []string{
			`DELETE FROM events WHERE site_id = ? AND ts < make_timestamp(?)`,
			`DELETE FROM sessions WHERE site_id = ? AND start < make_timestamp(?)`,
		} {
			res, err := conn.ExecContext(ctx, q, site, cutoffMs*1000) // DuckDB counts microseconds
			if err != nil {
				return fmt.Errorf("prune: %w", err)
			}
			if n, err := res.RowsAffected(); err == nil {
				removed += n
			}
		}
		return nil
	})
	return removed, err
}

// ErasePerson removes every row this site holds for one visitor. Like the
// other maintenance, it runs on the writer's connection, so it cannot race an
// ingest batch — and it drops the visitor's open session too, or a half-open
// one would write itself back after the delete.
//
// Money is not touched here: a payment is a business record the owner may be
// required to keep. The caller unlinks it instead, so it stops pointing at a
// person.
func (w *Writer) ErasePerson(ctx context.Context, site string, visitor uint64) (events, sessions int64, err error) {
	id := strconv.FormatUint(visitor, 10) // unsigned 64-bit: our own id, never user input
	err = w.Do(ctx, func(ctx context.Context, conn *sql.Conn) error {
		for i, table := range []string{"events", "sessions"} {
			res, err := conn.ExecContext(ctx, `DELETE FROM `+table+` WHERE site_id = ? AND visitor_id = `+id, site)
			if err != nil {
				return fmt.Errorf("erase person from %s: %w", table, err)
			}
			n, _ := res.RowsAffected()
			if i == 0 {
				events = n
			} else {
				sessions = n
			}
		}
		// An open visit is still a visit: count it with the written ones.
		sessions += w.sess.forgetVisitor(site, visitor)
		return nil
	})
	return events, sessions, err
}
