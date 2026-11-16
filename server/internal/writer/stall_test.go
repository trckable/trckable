package writer

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"
)

// A maintenance job that never finishes by itself is cut at its deadline and
// the writer keeps applying the WAL.
func TestHungJobTimesOutAndApplyContinues(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w := New(e.log, e.store, Options{FlushEvery: 20 * time.Millisecond, JobTimeout: 100 * time.Millisecond})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Run(ctx) }()

	jobErr := make(chan error, 1)
	go func() {
		jobErr <- w.Do(context.Background(), func(ctx context.Context, _ *sql.Conn) error {
			<-ctx.Done() // a statement that hangs until it is told to stop
			return ctx.Err()
		})
	}()
	base := time.Now().Add(-time.Hour).UnixMilli()
	for i := uint64(1); i <= 3; i++ {
		e.append(t, pv("s1", i, i, base+int64(i)))
	}
	deadline := time.Now().Add(10 * time.Second)
	for w.Applied() < 3 {
		if time.Now().After(deadline) {
			t.Fatalf("applied stuck at %d", w.Applied())
		}
		time.Sleep(5 * time.Millisecond)
	}
	if err := <-jobErr; !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("job error = %v, want deadline exceeded", err)
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func stallWriter(committed uint64, applied uint64, opts Options) (*Writer, *int) {
	exits := 0
	opts.OnStall = func(error) { exits++ }
	w := New(nil, nil, opts)
	w.applied.Store(applied)
	w.committedFn = func() uint64 { return committed }
	return w, &exits
}

func TestWatchdogFiresOnFrozenAppliedWithLag(t *testing.T) {
	w, exits := stallWriter(100, 40, Options{StallAfter: 5 * time.Minute, StallExitAfter: 15 * time.Minute})
	start := time.Now()
	wt := &watch{lastApplied: 40, lastMove: start}
	w.watchCheck(wt, start.Add(4*time.Minute))
	if !w.Stalled().IsZero() {
		t.Fatal("stalled too early")
	}
	w.watchCheck(wt, start.Add(6*time.Minute))
	if w.Stalled().IsZero() {
		t.Fatal("not stalled after 6m with lag")
	}
	if *exits != 0 {
		t.Fatal("exited too early")
	}
	w.watchCheck(wt, start.Add(16*time.Minute))
	w.watchCheck(wt, start.Add(17*time.Minute))
	if *exits != 1 {
		t.Fatalf("exits = %d, want 1", *exits)
	}
	// Progress clears it.
	w.applied.Store(41)
	w.watchCheck(wt, start.Add(18*time.Minute))
	if !w.Stalled().IsZero() {
		t.Fatal("still stalled after progress")
	}
}

func TestWatchdogQuietWithoutLag(t *testing.T) {
	w, exits := stallWriter(40, 40, Options{StallAfter: time.Minute, StallExitAfter: 2 * time.Minute})
	start := time.Now()
	wt := &watch{lastApplied: 40, lastMove: start}
	w.watchCheck(wt, start.Add(time.Hour))
	if !w.Stalled().IsZero() || *exits != 0 {
		t.Fatal("an idle writer with nothing to apply is not stalled")
	}
}

func TestWatchdogExitCanBeOff(t *testing.T) {
	w, exits := stallWriter(100, 40, Options{StallAfter: time.Minute, StallExitAfter: -1})
	start := time.Now()
	wt := &watch{lastApplied: 40, lastMove: start}
	w.watchCheck(wt, start.Add(time.Hour))
	if w.Stalled().IsZero() || *exits != 0 {
		t.Fatal("stall must show but never exit when exit is off")
	}
}
