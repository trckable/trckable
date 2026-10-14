package sqlite

import (
	"context"
	"database/sql"
	"errors"
)

// DownAfter is how many failed probes in a row make a site down: one failure
// is a blip, two are an outage.
const DownAfter = 2

// SiteProbe is the last light look at a site's homepage (server/uptime.go).
type SiteProbe struct {
	At        int64  `json:"at"`               // unix seconds; 0 when never probed
	Status    int    `json:"status,omitempty"` // the final HTTP status, 0 when nothing answered
	Error     string `json:"error,omitempty"`  // in plain words; empty when the page answered
	Failures  int    `json:"failures"`         // failed probes in a row
	DownSince int64  `json:"down_since,omitempty"`
}

// Down says whether enough probes in a row failed.
func (p SiteProbe) Down() bool { return p.Failures >= DownAfter }

// RecordProbe keeps a probe's outcome (errText empty: the page answered) and
// returns the state before and after, so the caller can tell the moment a
// site went down or came back. DownSince is the time of the first failure of
// the run.
func (s *Store) RecordProbe(ctx context.Context, site string, at int64, status int, errText string) (before, after SiteProbe, err error) {
	if before, err = s.ProbeOf(ctx, site); err != nil {
		return
	}
	after = SiteProbe{At: at, Status: status, Error: errText}
	if errText != "" {
		after.Failures = before.Failures + 1
		after.DownSince = before.DownSince
		if before.Failures == 0 || after.DownSince == 0 {
			after.DownSince = at
		}
	}
	_, err = s.DB.ExecContext(ctx, `INSERT INTO site_probe (site_id, probed_at, status, error, failures, down_since) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(site_id) DO UPDATE SET probed_at = excluded.probed_at, status = excluded.status, error = excluded.error,
			failures = excluded.failures, down_since = excluded.down_since`,
		site, after.At, after.Status, after.Error, after.Failures, after.DownSince)
	return
}

// ProbeOf returns a site's last probe, or a zero one when it was never probed.
func (s *Store) ProbeOf(ctx context.Context, site string) (SiteProbe, error) {
	var p SiteProbe
	err := s.DB.QueryRowContext(ctx, `SELECT probed_at, status, error, failures, down_since FROM site_probe WHERE site_id = ?`, site).
		Scan(&p.At, &p.Status, &p.Error, &p.Failures, &p.DownSince)
	if errors.Is(err, sql.ErrNoRows) {
		return SiteProbe{}, nil
	}
	return p, err
}
