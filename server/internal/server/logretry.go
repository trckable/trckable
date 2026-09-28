package server

import (
	"context"
	"log/slog"
	"time"
)

// runLogRetry takes events again after a full disk: every 30 seconds, while
// the write-ahead log refuses, it lets the next append try. If the disk is
// still full that append fails the same way, and nothing is lost either way:
// the tracker keeps what it could not send. A failed fsync is not retried.
func (s *Server) runLogRetry(ctx context.Context) {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if s.log.Err() != nil && s.log.Retry() {
				slog.Info("write-ahead log: trying again after a failed write")
			}
		}
	}
}
