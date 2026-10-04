package server

import (
	"context"
	"log/slog"
	"time"

	"github.com/trckable/trckable/server/internal/writer"
)

// botFlushEvery is how often the bots turned away are written to the store.
const botFlushEvery = time.Minute

// flushBots writes what ingest has counted since the last time. The counts
// are handed over once: a write that fails gives them back, so the next flush
// carries them, and nothing is counted twice.
func (s *Server) flushBots(ctx context.Context) {
	w := s.writer.Load()
	if w == nil {
		return // no store yet: the counts wait
	}
	s.flushHeat(ctx, w) // the heatmaps' counters go out with the bot counts, on the same clock
	rows := s.ingest.Bots.Drain()
	if len(rows) == 0 {
		return
	}
	days := make([]writer.BotDay, len(rows))
	for i, r := range rows {
		days[i] = writer.BotDay{Site: r.Site, Day: r.Day, Kind: r.Kind, N: r.N}
	}
	if err := w.AddBots(ctx, days); err != nil {
		s.ingest.Bots.Restore(rows)
		slog.Warn("could not write the bot counts, will try again", "err", err)
	}
}

// flushBotsEvery flushes once a minute until ctx ends. The last flush, at
// shutdown, is the caller's: it must run before the writer stops.
func (s *Server) flushBotsEvery(ctx context.Context) {
	t := time.NewTicker(botFlushEvery)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			fctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			s.flushBots(fctx)
			cancel()
		case <-ctx.Done():
			return
		}
	}
}

// heatChunk is how many counters are written in one transaction: a busy
// minute can hold tens of thousands, and one transaction that big is memory
// the store does not need to ask for.
const heatChunk = 2000

// flushHeat writes what the heatmaps script reported since the last time, the
// same way: handed over once, and given back when a write fails (the chunk
// that failed and everything after it, never what was already written).
func (s *Server) flushHeat(ctx context.Context, w *writer.Writer) {
	rows := s.ingest.Heats.Drain()
	for len(rows) > 0 {
		n := min(heatChunk, len(rows))
		out := make([]writer.HeatRow, n)
		for i, r := range rows[:n] {
			out[i] = writer.HeatRow{Site: r.Site, Day: r.Day, Path: r.Path, Width: r.Width, Kind: r.Kind, El: r.El, CX: r.CX, CY: r.CY, N: r.N, X: r.X, Y: r.Y, W: r.W, H: r.H}
		}
		if err := w.AddHeat(ctx, out); err != nil {
			s.ingest.Heats.Restore(rows)
			slog.Warn("could not write the heatmap counts, will try again", "err", err)
			return
		}
		rows = rows[n:]
	}
}
