package server

import (
	"context"
	"time"
)

// runChecks looks for every site's snippet from the outside once a day (the
// first time a few minutes after boot), so an install that stopped working
// shows up in the site picker and on its dashboard without anyone opening
// Verify. Each check is one GET of the homepage, plus its scripts when the
// id is not in the page itself.
func (s *Server) runChecks(ctx context.Context) {
	wait := 5 * time.Minute
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
		if s.api != nil {
			s.api.VerifyAll(ctx)
		}
		wait = 24 * time.Hour
	}
}
