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
func (s *Store) RecordProbe(ctx context.Context, site string, at int64, status, ms int, errText string) (before, after SiteProbe, err error) {
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
	if err != nil {
		return
	}
	if _, err = s.DB.ExecContext(ctx, `INSERT OR REPLACE INTO site_probe_log (site_id, probed_at, status, ms, error) VALUES (?, ?, ?, ?, ?)`,
		site, at, status, ms, errText); err != nil {
		return
	}
	_, err = s.DB.ExecContext(ctx, `DELETE FROM site_probe_log WHERE site_id = ? AND probed_at <
		COALESCE((SELECT MIN(probed_at) FROM (SELECT probed_at FROM site_probe_log WHERE site_id = ? ORDER BY probed_at DESC LIMIT ?)), 0)`,
		site, site, probeLogKept)
	return
}

// probeLogKept is how many probes per site are kept for the status panel.
const probeLogKept = 20

// ProbeLogEntry is one look at a site's homepage, as the panel lists it.
type ProbeLogEntry struct {
	At     int64  `json:"at"`
	Status int    `json:"status,omitempty"`
	Ms     int    `json:"ms,omitempty"`
	Error  string `json:"error,omitempty"`
}

// ProbeLog returns a site's latest probes, newest first.
func (s *Store) ProbeLog(ctx context.Context, site string, limit int) ([]ProbeLogEntry, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT probed_at, status, ms, error FROM site_probe_log WHERE site_id = ? ORDER BY probed_at DESC LIMIT ?`, site, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ProbeLogEntry{}
	for rows.Next() {
		var e ProbeLogEntry
		if err := rows.Scan(&e.At, &e.Status, &e.Ms, &e.Error); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
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

// DownProbes returns the last probe of every site in an account that is down
// (enough failures in a row), by site id.
func (s *Store) DownProbes(ctx context.Context, account string) (map[string]SiteProbe, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT p.site_id, p.probed_at, p.status, p.error, p.failures, p.down_since
		FROM site_probe p JOIN sites s ON s.id = p.site_id WHERE s.account_id = ? AND p.failures >= ?`, account, DownAfter)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]SiteProbe{}
	for rows.Next() {
		var id string
		var p SiteProbe
		if err := rows.Scan(&id, &p.At, &p.Status, &p.Error, &p.Failures, &p.DownSince); err != nil {
			return nil, err
		}
		out[id] = p
	}
	return out, rows.Err()
}
