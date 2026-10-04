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
