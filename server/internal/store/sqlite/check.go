package sqlite

import (
	"context"
	"database/sql"
	"errors"
)

// SiteCheck is the last look this server took at a site from the outside:
// whether its snippet was on the homepage (or in a script it loads).
type SiteCheck struct {
	At    int64  `json:"at"`              // unix seconds
	Found string `json:"found,omitempty"` // site, other, none; empty when the page could not be read
	Via   string `json:"via,omitempty"`
	Error string `json:"error,omitempty"`
	// DownSince is when the first failed look after the last good one was
	// taken; 0 while the site answers.
	DownSince int64 `json:"down_since,omitempty"`
}

// SetCheck records a check, replacing the one before. A failed look starts
// the time the site has been down, a failed look after a failed one keeps it,
// and a good look clears it.
func (s *Store) SetCheck(ctx context.Context, site string, c SiteCheck) error {
	down := int64(0)
	if c.Error != "" {
		down = c.At
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO site_check (site_id, checked_at, found, via, error, down_since) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(site_id) DO UPDATE SET checked_at = excluded.checked_at, found = excluded.found, via = excluded.via, error = excluded.error,
			down_since = CASE
				WHEN excluded.error = '' THEN 0
				WHEN site_check.error != '' AND site_check.down_since > 0 THEN site_check.down_since
				ELSE excluded.down_since END`,
		site, c.At, c.Found, c.Via, c.Error, down)
	return err
}

// Checks returns the last check of every site in an account that has one.
func (s *Store) Checks(ctx context.Context, account string) (map[string]SiteCheck, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT c.site_id, c.checked_at, c.found, c.via, c.error, c.down_since
		FROM site_check c JOIN sites s ON s.id = c.site_id WHERE s.account_id = ?`, account)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]SiteCheck{}
	for rows.Next() {
		var id string
		var c SiteCheck
		if err := rows.Scan(&id, &c.At, &c.Found, &c.Via, &c.Error, &c.DownSince); err != nil {
			return nil, err
		}
		out[id] = c
	}
	return out, rows.Err()
}

// CheckOf returns a site's last check, or a zero one when it was never checked.
func (s *Store) CheckOf(ctx context.Context, site string) (SiteCheck, error) {
	var c SiteCheck
	err := s.DB.QueryRowContext(ctx, `SELECT checked_at, found, via, error, down_since FROM site_check WHERE site_id = ?`, site).Scan(&c.At, &c.Found, &c.Via, &c.Error, &c.DownSince)
	if errors.Is(err, sql.ErrNoRows) {
		return SiteCheck{}, nil
	}
	return c, err
}

// SiteToCheck is a site the daily install check may read, with its account
// and when it was last checked (0: never).
type SiteToCheck struct {
	ID, Domain, Account string
	CheckedAt           int64
}

// SitesToCheck lists every site with when it was last checked, the ones
// checked longest ago first.
func (s *Store) SitesToCheck(ctx context.Context) ([]SiteToCheck, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT s.id, s.domain, s.account_id, COALESCE(c.checked_at, 0)
		FROM sites s LEFT JOIN site_check c ON c.site_id = s.id
		ORDER BY COALESCE(c.checked_at, 0), s.created_at, s.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SiteToCheck
	for rows.Next() {
		var c SiteToCheck
		if err := rows.Scan(&c.ID, &c.Domain, &c.Account, &c.CheckedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// MuteAlerts snoozes a site's alerts until a time (unix seconds); 0 lifts it.
func (s *Store) MuteAlerts(ctx context.Context, site string, until int64) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE sites SET alerts_muted_until = ? WHERE id = ?`, until, site)
	return err
}

// MutedUntil says until when a site's alerts are snoozed (0: not).
func (s *Store) MutedUntil(ctx context.Context, site string) int64 {
	var until int64
	_ = s.DB.QueryRowContext(ctx, `SELECT alerts_muted_until FROM sites WHERE id = ?`, site).Scan(&until)
	return until
}
