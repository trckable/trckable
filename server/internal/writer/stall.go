package writer

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"runtime/pprof"
	"time"
)

// A DuckDB statement that never returns freezes the writer without an error:
// events keep landing in the WAL (durable) but nothing is counted. The
// watchdog notices that the applied mark stopped while the WAL holds more,
// says so in the log with what the writer was doing, reports it to /readyz
// (Stalled) and, after StallExitAfter, ends the process so the host restarts
// it. A restart is safe: the hwm moves in the same transaction as the events,
// so the WAL replays from the last committed batch, and event ids drop any
// event that was already stored.

const (
	defaultJobTimeout      = 2 * time.Minute // small maintenance: bot counts, heat, imported days
	defaultHeavyJobTimeout = 4 * time.Minute // purge, prune, erase: still under StallAfter
	defaultStepSlow        = time.Minute
	defaultStallAfter      = 5 * time.Minute
	defaultStallRepeat     = 10 * time.Minute
	defaultStallExitAfter  = 15 * time.Minute
	defaultWatchEvery      = 10 * time.Second
	maxStackDump           = 64 << 10
)

// stepInfo is what the writer is doing right now.
type stepInfo struct {
	name  string
	since time.Time
}

// setStep records the writer's current step. A step that took longer than
// StepSlow is logged when it ends, with its name.
func (w *Writer) setStep(name string) {
	now := time.Now()
	prev := w.step.Swap(&stepInfo{name: name, since: now})
	if prev != nil && now.Sub(prev.since) >= w.opts.StepSlow && prev.name != "idle" && prev.name != "waiting for events" {
		slog.Error("writer: a step was slow", "step", prev.name, "took", now.Sub(prev.since).Round(time.Second))
	}
}

func (w *Writer) currentStep() (string, time.Duration) {
	if s := w.step.Load(); s != nil {
		return s.name, time.Since(s.since).Round(time.Second)
	}
	return "starting", 0
}

// Stalled returns since when the writer has made no progress while the WAL
// holds records it has not applied, or the zero time.
func (w *Writer) Stalled() time.Time {
	if ns := w.stalledSince.Load(); ns != 0 {
		return time.Unix(0, ns)
	}
	return time.Time{}
}

type watch struct {
	lastApplied uint64
	lastMove    time.Time
	lastLogged  time.Time
	dumped      bool
	exited      bool
}

// watchdog runs until ctx ends.
func (w *Writer) watchdog(ctx context.Context) {
	wt := &watch{lastApplied: w.applied.Load(), lastMove: time.Now()}
	t := time.NewTicker(w.opts.WatchEvery)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-t.C:
			w.watchCheck(wt, now)
		}
	}
}

// watchCheck is one look at the applied mark.
func (w *Writer) watchCheck(wt *watch, now time.Time) {
	applied := w.applied.Load()
	committed := w.committed()
	if applied != wt.lastApplied || committed <= applied {
		*wt = watch{lastApplied: applied, lastMove: now}
		w.stalledSince.Store(0)
		return
	}
	stalledFor := now.Sub(wt.lastMove)
	if stalledFor < w.opts.StallAfter {
		return
	}
	w.stalledSince.Store(wt.lastMove.UnixNano())
	step, stepFor := w.currentStep()
	if wt.lastLogged.IsZero() || now.Sub(wt.lastLogged) >= w.opts.StallRepeat {
		wt.lastLogged = now
		slog.Error("writer stalled: events wait in the WAL and are not counted",
			"applied", applied, "committed", committed, "lag", committed-applied,
			"stalled_for", stalledFor.Round(time.Second), "step", step, "step_for", stepFor)
		if !wt.dumped {
			wt.dumped = true
			slog.Error("writer stalled: goroutine stacks", "stacks", stacks())
		}
	}
	if w.opts.StallExitAfter > 0 && stalledFor >= w.opts.StallExitAfter && !wt.exited {
		wt.exited = true
		err := fmt.Errorf("writer made no progress for %s (step %q)", stalledFor.Round(time.Second), step)
		slog.Error("writer stalled for too long; exiting so the next start replays the WAL", "err", err)
		if w.opts.OnStall != nil {
			w.opts.OnStall(err)
		}
	}
}

func (w *Writer) committed() uint64 {
	if w.committedFn != nil {
		return w.committedFn()
	}
	c, _ := w.log.Committed()
	return c
}

func stacks() string {
	var buf bytes.Buffer
	_ = pprof.Lookup("goroutine").WriteTo(&buf, 2)
	if buf.Len() > maxStackDump {
		buf.Truncate(maxStackDump)
		buf.WriteString("\n... truncated")
	}
	return buf.String()
}
