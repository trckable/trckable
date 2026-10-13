package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"
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
			slog.Error("retention pass failed", "err", err)
		}
		if err := s.pruneNotices(ctx); err != nil && ctx.Err() == nil {
			slog.Warn("payment notice pass failed", "err", err)
		}
		s.ctl.PruneSalts(ctx) // old cookieless salts go even on a day with no visits
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
	return pruneEach(ctx, plan, time.Now(), w.PruneBefore, func(site string, days int, removed int64) {
		slog.Info("retention", "site", site, "days", days, "rows", removed)
		s.api.PurgeSite(site) // reports must not serve what was just deleted
	})
}

// pruneEach prunes every site in the plan. A site that fails does not stop the
// others: the errors are collected, with the site ids, and returned together.
func pruneEach(ctx context.Context, plan map[string]int, now time.Time, prune func(context.Context, string, int64) (int64, error), done func(site string, days int, removed int64)) error {
	sites := make([]string, 0, len(plan))
	for site := range plan {
		sites = append(sites, site)
	}
	sort.Strings(sites)
	var errs []error
	for _, site := range sites {
		if ctx.Err() != nil {
			break
		}
		days := plan[site]
		removed, err := prune(ctx, site, now.AddDate(0, 0, -days).UnixMilli())
		if err != nil {
			errs = append(errs, fmt.Errorf("site %s: %w", site, err))
			continue
		}
		if removed > 0 {
			done(site, days, removed)
		}
	}
	return errors.Join(errs...)
}

// pruneNotices empties the raw payment notices that are past their time: the
// provider's own copy of who paid. The ledger keeps the money.
func (s *Server) pruneNotices(ctx context.Context) error {
	plan, err := s.ctl.RetentionPlan(ctx)
	if err != nil {
		return err
	}
	n, err := s.revenue.PruneNotices(ctx, s.cfg.NoticeDays, plan)
	if n > 0 {
		slog.Info("retention", "payment notices emptied", n)
	}
	return err
}
