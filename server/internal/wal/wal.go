// Package wal is trckable's durable, append-only write-ahead log.
//
// Every accepted event is written here (and fsynced) before the HTTP request
// is acknowledged. A single committer goroutine assigns monotonically
// increasing sequence numbers, so the on-disk order is exactly seq order.
// Group commit batches concurrent appends into one write+fsync.
//
// On-disk format: segment files named <firstSeq>.wal (20 zero-padded digits),
// each a sequence of records:
//
//	u32 payload length | u32 crc32c(seq ‖ payload) | u64 seq | payload
//
// A torn record at the tail of the last segment (crash mid-write) is detected
// by length/CRC/seq checks and truncated on Open.
package wal

import (
	"bufio"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	headerSize    = 16
	MaxRecordSize = 64 << 10 // payloads are small events; anything bigger is a bug
)

var (
	crcTable  = crc32.MakeTable(crc32.Castagnoli)
	ErrClosed = errors.New("wal: closed")
	ErrTooBig = errors.New("wal: record too large")
	// ErrLocked: another process has this log open (the server, while an
	// import runs). Stop it first, or import through the running server.
	ErrLocked = errors.New("wal: another trckabled has this data directory open")
)

// Options tune the log. Zero values pick safe defaults.
type Options struct {
	SegmentSize  int64         // rotate after this many bytes (default 64 MiB)
	SyncInterval time.Duration // optional linger to grow batches (default 0: adaptive, no linger)
	MaxBatch     int           // max records per group commit (default 4096)
	NoSync       bool          // tests/benchmarks only: skip fsync
}

type appendReq struct {
	payload []byte
	seq     uint64
	done    chan error
}

// Log is safe for concurrent Append. Readers may tail it concurrently.
type Log struct {
	dir  string
	opts Options
	lock *os.File // held while open: one writer per log

	reqs   chan *appendReq
	closed chan struct{}
	wg     sync.WaitGroup

	// sendMu makes "is the log open?" and "enqueue the request" atomic with
	// respect to Close, so no request can be enqueued after the committer's
	// final drain (it would never be answered).
	sendMu   sync.RWMutex
	isClosed bool

	mu        sync.Mutex
	f         *os.File
	size      int64
	nextSeq   uint64
	committed uint64        // highest seq that is written and fsynced
	notify    chan struct{} // closed and replaced on every commit
	err       error         // sticky write error: the log refuses further appends
	// retryable: the error was a write that was rolled back (a full disk),
	// so the file is as it was and Retry may try again. A failed fsync is
	// never retryable: what reached the disk is then unknown.
	retryable bool
}

// Open opens (or creates) the log in dir, repairing a torn tail.
func Open(dir string, opts Options) (*Log, error) {
	if opts.SegmentSize <= 0 {
		opts.SegmentSize = 64 << 20
	}
	if opts.MaxBatch <= 0 {
		opts.MaxBatch = 4096
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	lock, err := lockDir(dir)
	if err != nil {
		return nil, err
	}
	l := &Log{
		lock:   lock,
		dir:    dir,
		opts:   opts,
		reqs:   make(chan *appendReq, opts.MaxBatch),
		closed: make(chan struct{}),
		notify: make(chan struct{}),
	}
	segs, err := l.segments()
	if err != nil {
		return nil, err
	}
	l.nextSeq = 1
	if len(segs) > 0 {
		last := segs[len(segs)-1]
		lastSeq, validSize, err := scanSegment(filepath.Join(dir, segName(last)), last)
		if err != nil {
			return nil, err
		}
		f, err := os.OpenFile(filepath.Join(dir, segName(last)), os.O_RDWR, 0o600)
		if err != nil {
			return nil, err
		}
		if err := f.Truncate(validSize); err != nil { // drop a torn tail, if any
			f.Close()
			return nil, err
		}
		if _, err := f.Seek(validSize, io.SeekStart); err != nil {
			f.Close()
			return nil, err
		}
		l.f, l.size = f, validSize
		if lastSeq > 0 {
			l.nextSeq = lastSeq + 1
		} else {
			l.nextSeq = last
		}
	} else if err := l.rotate(); err != nil {
		return nil, err
	}
	l.committed = l.nextSeq - 1
	l.wg.Add(1)
	go l.commitLoop()
	return l, nil
}

// Append durably writes payload and returns its sequence number once it is
// fsynced (group-committed with concurrent appends).
func (l *Log) Append(ctx context.Context, payload []byte) (uint64, error) {
	wait, err := l.Enqueue(ctx, payload)
	if err != nil {
		return 0, err
	}
	return wait()
}

// Enqueue hands a record to the committer and returns a function that blocks
// until it is durable. Append is this, waited on immediately.
//
// It exists for bulk loads: one caller appending a million rows and waiting
// for each fsync gets no group commit at all, because there is never more
// than one record in flight. Enqueuing a batch first and waiting afterwards
// puts them in one fsync, and a single sender keeps them in file order.
// Records are only durable once the wait returns.
func (l *Log) Enqueue(ctx context.Context, payload []byte) (func() (uint64, error), error) {
	if len(payload) > MaxRecordSize {
		return nil, ErrTooBig
	}
	req := &appendReq{payload: payload, done: make(chan error, 1)}
	l.sendMu.RLock()
	if l.isClosed {
		l.sendMu.RUnlock()
		return nil, ErrClosed
	}
	select {
	case l.reqs <- req:
		l.sendMu.RUnlock()
	case <-ctx.Done():
		l.sendMu.RUnlock()
		return nil, ctx.Err()
	}
	// Once enqueued, the committer always answers: it drains the queue before
	// exiting, and nothing can be enqueued after Close begins.
	return func() (uint64, error) {
		err := <-req.done
		return req.seq, err
	}, nil
}

func (l *Log) commitLoop() {
	defer l.wg.Done()
	batch := make([]*appendReq, 0, l.opts.MaxBatch)
	buf := make([]byte, 0, 1<<20)
	timer := time.NewTimer(time.Hour)
	timer.Stop()
	for {
		batch = batch[:0]
		select {
		case r := <-l.reqs:
			batch = append(batch, r)
		case <-l.closed:
			l.drain(batch, buf)
			return
		}
		// Adaptive group commit: take everything already queued (requests pile
		// up naturally while the previous fsync runs), then commit at once.
		// Quiet sites get minimum latency; busy sites get big batches.
		// An optional linger trades latency for fewer fsyncs.
		if l.opts.SyncInterval > 0 {
			timer.Reset(l.opts.SyncInterval)
		}
	gather:
		for len(batch) < l.opts.MaxBatch {
			select {
			case r := <-l.reqs:
				batch = append(batch, r)
				continue
			default:
			}
			if l.opts.SyncInterval <= 0 {
				break
			}
			select {
			case r := <-l.reqs:
				batch = append(batch, r)
			case <-timer.C:
				break gather
			case <-l.closed:
				break gather
			}
		}
		if l.opts.SyncInterval > 0 && !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
		buf = l.commit(batch, buf)
	}
}

// drain commits whatever is still queued at shutdown so no accepted request is lost.
func (l *Log) drain(batch []*appendReq, buf []byte) {
	for {
		select {
		case r := <-l.reqs:
			batch = append(batch, r)
			if len(batch) == l.opts.MaxBatch {
				buf = l.commit(batch, buf)
				batch = batch[:0]
			}
		default:
			if len(batch) > 0 {
				l.commit(batch, buf)
			}
			return
		}
	}
}

func (l *Log) commit(batch []*appendReq, buf []byte) []byte {
	l.mu.Lock()
	err := l.err
	l.mu.Unlock()
	if err != nil {
		for _, r := range batch {
			r.done <- err
		}
		return buf
	}

	buf = buf[:0]
	seq := l.nextSeq
	for _, r := range batch {
		r.seq = seq
		buf = appendRecord(buf, seq, r.payload)
		seq++
	}
	err, rolledBack := l.writeAndSync(buf)

	l.mu.Lock()
	if err != nil {
		l.err = fmt.Errorf("wal: write failed, refusing further appends: %w", err)
		l.retryable = rolledBack
		err = l.err
	} else {
		l.nextSeq = seq
		l.committed = seq - 1
		close(l.notify)
		l.notify = make(chan struct{})
	}
	l.mu.Unlock()

	for _, r := range batch {
		r.done <- err
	}
	if err == nil && l.size >= l.opts.SegmentSize {
		if rerr := l.rotate(); rerr != nil {
			l.mu.Lock()
			l.err = fmt.Errorf("wal: rotate failed: %w", rerr)
			l.mu.Unlock()
		}
	}
	return buf
}

// writeFile is the one write the log makes; tests swap it to fill the disk.
var writeFile = func(f *os.File, b []byte) (int, error) { return f.Write(b) }

func (l *Log) writeAndSync(buf []byte) (err error, rolledBack bool) {
	if _, err := writeFile(l.f, buf); err != nil {
		// Roll back a partial write so the file stays well-formed.
		terr := l.f.Truncate(l.size)
		_, serr := l.f.Seek(l.size, io.SeekStart)
		return err, terr == nil && serr == nil
	}
	if !l.opts.NoSync {
		if err := l.f.Sync(); err != nil {
			return err, false
		}
	}
	l.size += int64(len(buf))
	return nil, false
}

// Retry clears a write error that was rolled back (a full disk), so the next
// append tries again; if the disk is still full it fails the same way. It
// reports whether the log accepts appends again.
func (l *Log) Retry() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.err == nil {
		return true
	}
	if !l.retryable {
		return false
	}
	l.err, l.retryable = nil, false
	return true
}

func appendRecord(buf []byte, seq uint64, payload []byte) []byte {
	var h [headerSize]byte
	binary.LittleEndian.PutUint32(h[0:4], uint32(len(payload)))
	binary.LittleEndian.PutUint64(h[8:16], seq)
	crc := crc32.Update(0, crcTable, h[8:16])
	crc = crc32.Update(crc, crcTable, payload)
	binary.LittleEndian.PutUint32(h[4:8], crc)
	buf = append(buf, h[:]...)
	return append(buf, payload...)
}

// rotate starts a new segment named after the next sequence number.
func (l *Log) rotate() error {
	if l.f != nil {
		if !l.opts.NoSync {
			if err := l.f.Sync(); err != nil {
				return err
			}
		}
		if err := l.f.Close(); err != nil {
			return err
		}
	}
	f, err := os.OpenFile(filepath.Join(l.dir, segName(l.nextSeq)), os.O_CREATE|os.O_RDWR|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	l.f, l.size = f, 0
	return syncDir(l.dir, l.opts.NoSync)
}

// Committed returns the highest durable sequence number, and a channel that
// is closed on the next commit (for tailing readers).
func (l *Log) Committed() (uint64, <-chan struct{}) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.committed, l.notify
}

// Err reports a sticky write error (e.g. disk full). While set, appends fail
// and readiness should report unhealthy.
func (l *Log) Err() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.err
}

// Close stops accepting appends, commits everything already queued, and
// fsyncs the active segment.
func (l *Log) Close() error {
	l.sendMu.Lock() // waits for in-progress enqueues; blocks new ones
	if l.isClosed {
		l.sendMu.Unlock()
		return nil
	}
	l.isClosed = true
	l.sendMu.Unlock()
	close(l.closed)
	l.wg.Wait()
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.f == nil {
		return nil
	}
	if !l.opts.NoSync {
		_ = l.f.Sync()
	}
	err := l.f.Close()
	l.f = nil
	if l.lock != nil {
		l.lock.Close() // closing the file releases the lock
		l.lock = nil
	}
	return err
}

// Prune deletes whole segments whose records are all <= appliedSeq and whose
// files were last modified before keepSince. The active segment is never deleted.
func (l *Log) Prune(appliedSeq uint64, keepSince time.Time) (removed int, err error) {
	segs, err := l.segments()
	if err != nil {
		return 0, err
	}
	for i := 0; i+1 < len(segs); i++ { // skip the last (active) segment
		lastSeqInSeg := segs[i+1] - 1
		if lastSeqInSeg > appliedSeq {
			break
		}
		p := filepath.Join(l.dir, segName(segs[i]))
		st, err := os.Stat(p)
		if err != nil {
			return removed, err
		}
		if st.ModTime().After(keepSince) {
			break
		}
		if err := os.Remove(p); err != nil {
			return removed, err
		}
		removed++
	}
	return removed, nil
}

// SizeBytes returns the total on-disk size of all segments.
func (l *Log) SizeBytes() int64 {
	segs, _ := l.segments()
	var total int64
	for _, s := range segs {
		if st, err := os.Stat(filepath.Join(l.dir, segName(s))); err == nil {
			total += st.Size()
		}
	}
	return total
}

func (l *Log) segments() ([]uint64, error) {
	entries, err := os.ReadDir(l.dir)
	if err != nil {
		return nil, err
	}
	var out []uint64
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".wal") {
			continue
		}
		n, err := strconv.ParseUint(strings.TrimSuffix(name, ".wal"), 10, 64)
		if err != nil {
			continue
		}
		out = append(out, n)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out, nil
}

func segName(firstSeq uint64) string { return fmt.Sprintf("%020d.wal", firstSeq) }

// scanSegment validates records in order and returns the last good seq and the
// byte offset just past it.
func scanSegment(path string, firstSeq uint64) (lastSeq uint64, validSize int64, err error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()
	r := bufio.NewReaderSize(f, 1<<20)
	want := firstSeq
	var off int64
	for {
		seq, payload, n, rerr := readRecord(r)
		if rerr != nil || seq != want {
			_ = payload
			return lastSeq, off, nil // stop at first torn/invalid record
		}
		lastSeq = seq
		want++
		off += int64(n)
	}
}

func readRecord(r *bufio.Reader) (seq uint64, payload []byte, n int, err error) {
	var h [headerSize]byte
	if _, err = io.ReadFull(r, h[:]); err != nil {
		return 0, nil, 0, err
	}
	size := binary.LittleEndian.Uint32(h[0:4])
	if size > MaxRecordSize {
		return 0, nil, 0, errors.New("wal: corrupt length")
	}
	payload = make([]byte, size)
	if _, err = io.ReadFull(r, payload); err != nil {
		return 0, nil, 0, err
	}
	seq = binary.LittleEndian.Uint64(h[8:16])
	crc := crc32.Update(0, crcTable, h[8:16])
	crc = crc32.Update(crc, crcTable, payload)
	if crc != binary.LittleEndian.Uint32(h[4:8]) {
		return 0, nil, 0, errors.New("wal: checksum mismatch")
	}
	return seq, payload, headerSize + int(size), nil
}

func syncDir(dir string, noSync bool) error {
	if noSync {
		return nil
	}
	d, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer d.Close()
	return d.Sync()
}
