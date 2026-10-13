package server

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Every stretch a site was down or quiet is kept (sqlite incidents.go), for
// all sites, not only the ones with alerts on. It is looked for on every
// round of the alerts loop and follows the dashboard's badge exactly: an
// incident opens when the badge would say Down or Quiet and closes when
// visits are back.

// stoppedHours is how long without a visit before tracking counts as stopped:
// the same number as STOPPED_HOURS in dashboard/src/features/sitestatus/status.ts.
const stoppedHours = 6

// weekSecs and the history an estimate needs.
const (
	weekSecs        = 7 * 24 * 3600
	estimateWeeks   = 4
	estimateMinimum = 2
)

// troubleOf is what the badge would show for a site: "down" (a look after the
// last visit found no answer), "quiet" (no visits for the threshold and
// nothing known wrong), or "" (a site with visits, or none yet). It is
// statusOf in status.ts; both are tested against the same cases.
func troubleOf(last int64, c sqlite.SiteCheck, now int64) string {
	if last == 0 || now-last < stoppedHours*3600 {
		return ""
	}
	if c.At > last && c.Error != "" {
		return "down"
	}
	return "quiet"
}

// history is what an incident asks of the analytics store.
type history interface {
	// FirstEventAfter is the time (unix seconds) of the site's first event
	// after `after`, 0 when it has none.
	FirstEventAfter(ctx context.Context, site string, after int64) (int64, error)
	// FirstEvent is the time of the site's first event, 0 when it has none.
	FirstEvent(ctx context.Context, site string) (int64, error)
	// Visits counts the visits (sessions) that began in [from, to).
	Visits(ctx context.Context, site string, from, to int64) (int64, error)
}

// expectedVisits is the visits a stretch would normally have brought: the
// average of the same stretch of the week over the four weeks before it.
// Weeks from before the site's first event do not count, and with fewer than
// two weeks of history it says nothing (nil) rather than guess.
func expectedVisits(ctx context.Context, h history, site string, start, end int64) (*int64, error) {
	first, err := h.FirstEvent(ctx, site)
	if err != nil || first == 0 {
		return nil, err
	}
	var sum, weeks int64
	for k := int64(1); k <= estimateWeeks; k++ {
		from, to := start-k*weekSecs, end-k*weekSecs
		if from < first {
			break
		}
		n, err := h.Visits(ctx, site, from, to)
		if err != nil {
			return nil, err
		}
		sum += n
		weeks++
	}
	if weeks < estimateMinimum {
		return nil, nil
	}
	avg := (sum + weeks/2) / weeks
	return &avg, nil
}

// stepIncident brings one site's record up to date with what the badge would
// show now. It may be called as often as wanted, and again after a restart:
// at most one incident is open, and a start already recorded is not recorded
// twice. h may be nil (the analytics store is not ready): an incident then
// opens but does not close, and closes on a later round.
func stepIncident(ctx context.Context, st *sqlite.Store, h history, site string, last int64, c sqlite.SiteCheck, now int64) error {
	trouble := troubleOf(last, c, now)
	open, err := st.OpenIncident(ctx, site)
	if err != nil {
		return err
	}
	switch {
	case trouble != "" && open == nil:
		cause := "no visits"
		if trouble == "down" {
			cause = c.Error
		}
		_, err = st.StartIncident(ctx, site, trouble, last+stoppedHours*3600, cause)
		return err
	case trouble == "down" && open.Kind == "quiet":
		return st.MarkIncidentDown(ctx, open.ID, c.Error)
	case trouble == "" && open != nil:
		if h == nil {
			return nil
		}
		return closeIncident(ctx, st, h, *open, last)
	}
	return nil
}

// closeIncident ends an incident when visits are back. The end is the first
// visit after the silence (the last visit before it is a threshold before the
// start), or the latest visit when that cannot be told.
func closeIncident(ctx context.Context, st *sqlite.Store, h history, in sqlite.Incident, last int64) error {
	ended := last
	if first, err := h.FirstEventAfter(ctx, in.Site, in.StartedAt-stoppedHours*3600); err != nil {
		return err
	} else if first > 0 {
		ended = first
	}
	ended = max(ended, in.StartedAt)
	exp, err := expectedVisits(ctx, h, in.Site, in.StartedAt, ended)
	if err != nil {
		return err
	}
	return st.EndIncident(ctx, in.ID, ended, exp)
}

// checkIncidents is the incidents round of the alerts loop.
func (s *Server) checkIncidents(ctx context.Context) {
	sites, err := s.ctl.AllSites(ctx)
	if err != nil {
		slog.Warn("incident check failed", "err", err)
		return
	}
	var h history
	if st := s.duck.Load(); st != nil {
		h = duckHistory{st.DB}
	}
	now := time.Now().Unix()
	for _, site := range sites {
		if ctx.Err() != nil {
			return
		}
		c, err := s.ctl.CheckOf(ctx, site.ID)
		if err != nil {
			slog.Warn("incident check failed", "site", site.ID, "err", err)
			continue
		}
		siteCtx, cancel := context.WithTimeout(ctx, siteWork)
		err = stepIncident(siteCtx, s.ctl, h, site.ID, site.LastEventAt, c, now)
		cancel()
		if err != nil && ctx.Err() == nil {
			slog.Warn("incident check failed", "site", site.ID, "err", err)
		}
	}
}

// duckHistory reads the analytics store.
type duckHistory struct{ db *sql.DB }

func (d duckHistory) FirstEventAfter(ctx context.Context, site string, after int64) (int64, error) {
	return d.first(ctx, `SELECT min(ts) FROM events WHERE site_id = ? AND ts > ?`, site, time.Unix(after, 0).UTC())
}

func (d duckHistory) FirstEvent(ctx context.Context, site string) (int64, error) {
	return d.first(ctx, `SELECT min(start) FROM sessions WHERE site_id = ?`, site)
}

func (d duckHistory) first(ctx context.Context, q string, args ...any) (int64, error) {
	var t *time.Time
	if err := d.db.QueryRowContext(ctx, q, args...).Scan(&t); err != nil || t == nil {
		return 0, err
	}
	return t.Unix(), nil
}

func (d duckHistory) Visits(ctx context.Context, site string, from, to int64) (int64, error) {
	var n int64
	err := d.db.QueryRowContext(ctx, `SELECT count(*) FROM sessions WHERE site_id = ? AND start >= ? AND start < ?`,
		site, time.Unix(from, 0).UTC(), time.Unix(to, 0).UTC()).Scan(&n)
	return n, err
}
