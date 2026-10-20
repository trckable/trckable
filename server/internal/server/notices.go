package server

import (
	"context"
	"time"
)

// noticesEvery is how often the outbox is looked at for messages whose time
// has come (internal/notice): the first retry of a failed send is a minute after it.
const noticesEvery = time.Minute

// runNotices tries again every notice and alert that could not be delivered,
// from the outbox, so one that was lost to a failing mail server or a busy
// database still arrives.
func (s *Server) runNotices(ctx context.Context) {
	t := time.NewTicker(noticesEvery)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.notices.Drain(ctx)
		}
	}
}
