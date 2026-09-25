package wal

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"testing"
	"time"
)

func mustOpen(t *testing.T, dir string, opts Options) *Log {
	t.Helper()
	l, err := Open(dir, opts)
	if err != nil {
		t.Fatal(err)
	}
	return l
}

func readAll(t *testing.T, l *Log, from uint64, want int) []Record {
	t.Helper()
	recs, err := tryReadAll(l, from, want)
	if err != nil {
		t.Fatal(err)
	}
	return recs
}

// tryReadAll is readAll for the tests that read on their own goroutine: a
// t.Fatal there would only stop that goroutine, and the test would hang on a
// channel nobody sends to instead of saying what went wrong.
//
// The deadline is per read, not for the whole run. A reader tailing a live
// log is only as fast as the appends it is waiting for, and one fsync per
// record on a loaded machine is slow but not wrong — what would be wrong is a
// reader that stops making progress while records are already committed.
func tryReadAll(l *Log, from uint64, want int) ([]Record, error) {
	rd, err := l.NewReader(from)
	if err != nil {
		return nil, err
	}
	defer rd.Close()
	var out []Record
	for len(out) < want {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		recs, err := rd.Next(ctx, 1000)
		cancel()
		if err != nil {
			committed, _ := l.Committed()
			return out, fmt.Errorf("read made no progress for 20s after %d of %d records (next %d, committed %d): %w",
				len(out), want, rd.next, committed, err)
		}
		out = append(out, recs...)
	}
	return out, nil
}

func TestConcurrentAppendsAreOrderedAndComplete(t *testing.T) {
	dir := t.TempDir()
	l := mustOpen(t, dir, Options{SegmentSize: 64 << 10, SyncInterval: time.Millisecond})
	const writers, per = 16, 500
	var wg sync.WaitGroup
	seen := make([]map[uint64]string, writers)
	for w := 0; w < writers; w++ {
		seen[w] = map[uint64]string{}
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			for i := 0; i < per; i++ {
				p := fmt.Sprintf("w%d-%d", w, i)
				seq, err := l.Append(context.Background(), []byte(p))
				if err != nil {
					t.Error(err)
					return
				}
				seen[w][seq] = p
			}
		}(w)
	}
	wg.Wait()

	recs := readAll(t, l, 1, writers*per)
	for i, r := range recs {
		if r.Seq != uint64(i+1) {
			t.Fatalf("record %d has seq %d", i, r.Seq)
		}
	}
	for w := range seen {
		for seq, p := range seen[w] {
			if string(recs[seq-1].Payload) != p {
				t.Fatalf("seq %d: got %q want %q", seq, recs[seq-1].Payload, p)
			}
		}
	}
	if err := l.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestReopenContinuesSequence(t *testing.T) {
	dir := t.TempDir()
	l := mustOpen(t, dir, Options{SegmentSize: 4 << 10})
	for i := 0; i < 300; i++ {
		if _, err := l.Append(context.Background(), []byte(fmt.Sprintf("a%d", i))); err != nil {
			t.Fatal(err)
		}
	}
	l.Close()

	l = mustOpen(t, dir, Options{SegmentSize: 4 << 10})
	seq, err := l.Append(context.Background(), []byte("after"))
	if err != nil {
		t.Fatal(err)
	}
	if seq != 301 {
		t.Fatalf("seq after reopen = %d, want 301", seq)
	}
	recs := readAll(t, l, 295, 7)
	if string(recs[6].Payload) != "after" || recs[0].Seq != 295 {
		t.Fatalf("unexpected tail: first=%d last=%q", recs[0].Seq, recs[6].Payload)
	}
	l.Close()
}

// A crash mid-write leaves garbage after the last full record. Open must
// truncate it, keep every complete record, and continue the sequence.
func TestTornTailIsRepaired(t *testing.T) {
	dir := t.TempDir()
	l := mustOpen(t, dir, Options{})
	for i := 0; i < 10; i++ {
		if _, err := l.Append(context.Background(), []byte("ok")); err != nil {
			t.Fatal(err)
		}
	}
	l.Close()

	segs, _ := filepath.Glob(filepath.Join(dir, "*.wal"))
	f, err := os.OpenFile(segs[len(segs)-1], os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	// A header claiming a 100-byte payload, followed by only 3 bytes.
	f.Write([]byte{100, 0, 0, 0, 1, 2, 3, 4, 11, 0, 0, 0, 0, 0, 0, 0, 'x', 'y', 'z'})
	f.Close()

	l = mustOpen(t, dir, Options{})
	seq, err := l.Append(context.Background(), []byte("new"))
	if err != nil {
		t.Fatal(err)
	}
	if seq != 11 {
		t.Fatalf("seq = %d, want 11", seq)
	}
	recs := readAll(t, l, 1, 11)
	if string(recs[10].Payload) != "new" {
		t.Fatalf("last payload %q", recs[10].Payload)
	}
	l.Close()
}

func TestCorruptRecordStopsAtLastGood(t *testing.T) {
	dir := t.TempDir()
	l := mustOpen(t, dir, Options{})
	for i := 0; i < 5; i++ {
		l.Append(context.Background(), []byte("abcd"))
	}
	l.Close()
	segs, _ := filepath.Glob(filepath.Join(dir, "*.wal"))
	b, _ := os.ReadFile(segs[0])
	b[len(b)-1] ^= 0xff // flip a byte in the last record's payload
	os.WriteFile(segs[0], b, 0o600)

	l = mustOpen(t, dir, Options{})
	seq, _ := l.Append(context.Background(), []byte("x"))
	if seq != 5 { // record 5 was corrupt and dropped; 5 is reused
		t.Fatalf("seq = %d, want 5", seq)
	}
	l.Close()
}

func TestReaderTailsLiveAppends(t *testing.T) {
	dir := t.TempDir()
	l := mustOpen(t, dir, Options{SegmentSize: 2 << 10, SyncInterval: time.Millisecond})
	defer l.Close()
	type result struct {
		recs []Record
		err  error
	}
	done := make(chan result, 1)
	go func() {
		recs, err := tryReadAll(l, 1, 1000)
		done <- result{recs, err}
	}()
	for i := 0; i < 1000; i++ {
		if _, err := l.Append(context.Background(), []byte(fmt.Sprintf("%04d", i))); err != nil {
			t.Fatal(err)
		}
	}
	r := <-done
	if r.err != nil {
		t.Fatal(r.err)
	}
	recs := r.recs
	for i, r := range recs {
		if string(r.Payload) != fmt.Sprintf("%04d", i) {
			t.Fatalf("record %d = %q", i, r.Payload)
		}
	}
}

func TestPruneKeepsUnappliedAndActive(t *testing.T) {
	dir := t.TempDir()
	l := mustOpen(t, dir, Options{SegmentSize: 1 << 10})
	defer l.Close()
	for i := 0; i < 500; i++ {
		l.Append(context.Background(), []byte("0123456789"))
	}
	before, _ := filepath.Glob(filepath.Join(dir, "*.wal"))
	removed, err := l.Prune(250, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	after, _ := filepath.Glob(filepath.Join(dir, "*.wal"))
	if removed == 0 || len(after) != len(before)-removed {
		t.Fatalf("removed=%d before=%d after=%d", removed, len(before), len(after))
	}
	// Everything from 251 on must still be readable.
	recs := readAll(t, l, 251, 250)
	if recs[0].Seq != 251 {
		t.Fatalf("first seq %d", recs[0].Seq)
	}
}

func BenchmarkAppendParallel(b *testing.B) {
	l, _ := Open(b.TempDir(), Options{})
	defer l.Close()
	payload := make([]byte, 300)
	b.SetParallelism(64)
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			if _, err := l.Append(context.Background(), payload); err != nil {
				b.Fatal(err)
			}
		}
	})
}

// Appends racing with Close must all return (success or ErrClosed), and every
// successful append must be durable after reopen.
func TestAppendRacingCloseNeverHangs(t *testing.T) {
	for round := 0; round < 50; round++ {
		dir := t.TempDir()
		l := mustOpen(t, dir, Options{NoSync: true})
		var wg sync.WaitGroup
		var mu sync.Mutex
		var ok []uint64
		for w := 0; w < 32; w++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for i := 0; i < 200; i++ {
					seq, err := l.Append(context.Background(), []byte("x"))
					if err == ErrClosed {
						return
					}
					if err != nil {
						t.Error(err)
						return
					}
					mu.Lock()
					ok = append(ok, seq)
					mu.Unlock()
				}
			}()
		}
		time.Sleep(time.Duration(round%5) * time.Millisecond)
		l.Close()
		done := make(chan struct{})
		go func() { wg.Wait(); close(done) }()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Fatalf("round %d: appends hung after Close", round)
		}
		l = mustOpen(t, dir, Options{NoSync: true})
		committed, _ := l.Committed()
		for _, s := range ok {
			if s > committed {
				t.Fatalf("round %d: acked seq %d lost (committed %d)", round, s, committed)
			}
		}
		l.Close()
	}
}

// A bulk load enqueues a batch and waits afterwards. One sender means file
// order is kept, and nothing is durable until the wait returns.
func TestEnqueueKeepsOrderAndDurability(t *testing.T) {
	dir := t.TempDir()
	log, err := Open(dir, Options{})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	const n = 3000
	waits := make([]func() (uint64, error), 0, n)
	for i := range n {
		wait, err := log.Enqueue(ctx, fmt.Appendf(nil, "record-%d", i))
		if err != nil {
			t.Fatal(err)
		}
		waits = append(waits, wait)
	}
	for i, wait := range waits {
		seq, err := wait()
		if err != nil {
			t.Fatal(err)
		}
		if seq != uint64(i+1) {
			t.Fatalf("record %d got seq %d: a batch was reordered", i, seq)
		}
	}
	if err := log.Close(); err != nil {
		t.Fatal(err)
	}

	// Everything the waits returned for is on disk, in the order it went in.
	reopened, err := Open(dir, Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	recs := readAll(t, reopened, 1, n)
	for i, r := range recs {
		if want := fmt.Sprintf("record-%d", i); string(r.Payload) != want {
			t.Fatalf("record %d is %q, want %q", i, r.Payload, want)
		}
	}
}

// A full disk refuses appends; once there is room again the log takes them,
// and what was written before and after reads back whole.
func TestFullDiskIsNotForever(t *testing.T) {
	dir := t.TempDir()
	l, err := Open(dir, Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	ctx := context.Background()
	if _, err := l.Append(ctx, []byte("before")); err != nil {
		t.Fatal(err)
	}
	was := writeFile
	full := true
	writeFile = func(f *os.File, b []byte) (int, error) {
		if full {
			n, _ := f.Write(b[:len(b)/2]) // half of it lands, then the disk is full
			return n, syscall.ENOSPC
		}
		return was(f, b)
	}
	defer func() { writeFile = was }()

	if _, err := l.Append(ctx, []byte("while full")); err == nil {
		t.Fatal("an append on a full disk must fail")
	}
	if l.Err() == nil {
		t.Fatal("the log must refuse while the disk is full")
	}
	full = false
	if !l.Retry() {
		t.Fatal("a rolled-back write must be retryable")
	}
	if _, err := l.Append(ctx, []byte("after")); err != nil {
		t.Fatalf("after room came back: %v", err)
	}
	if err := l.Close(); err != nil {
		t.Fatal(err)
	}
	// Read everything back: two whole records, nothing torn in between.
	l2, err := Open(dir, Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer l2.Close()
	rd, err := l2.NewReader(0)
	if err != nil {
		t.Fatal(err)
	}
	recs, err := rd.TryRead(10)
	if err != nil {
		t.Fatal(err)
	}
	if len(recs) != 2 || string(recs[0].Payload) != "before" || string(recs[1].Payload) != "after" {
		t.Fatalf("read back %d records: %v", len(recs), recs)
	}
}
