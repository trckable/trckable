package server

import (
	"context"
	"log/slog"
	"time"
)

// retention deletes events and sessions older than each site's chosen limit.
// A site keeps everything unless its owner sets a number, and the work runs on
// the writer's own connection, so it can never race an ingest batch.
//
// It runs a few minutes after boot and then once a day: a retention promise is
// about days, so an hour either way changes nothing, and a deploy loop never
// turns into a delete loop.
func (s *Server) runRetention(ctx context.Context) {
	timer := time.NewTimer(5 * time.Minute)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
		if err := s.pruneOnce(ctx); err != nil && ctx.Err() == nil {
			slog.Warn("retention pass failed", "err", err)
		}
		timer.Reset(24 * time.Hour)
	}
}

func (s *Server) pruneOnce(ctx context.Context) error {
	plan, err := s.ctl.RetentionPlan(ctx)
	if err != nil || len(plan) == 0 {
		return err
	}
	w := s.writer.Load()
	if w == nil || !w.Ready() {
		return nil // still warming up: the next pass will do it
	}
	for site, days := range plan {
		cutoff := time.Now().AddDate(0, 0, -days).UnixMilli()
		removed, err := w.PruneBefore(ctx, site, cutoff)
		if err != nil {
			return err
		}
		if removed > 0 {
			slog.Info("retention", "site", site, "days", days, "rows", removed)
			s.api.PurgeSite(site) // reports must not serve what was just deleted
		}
	}
	return nil
}
