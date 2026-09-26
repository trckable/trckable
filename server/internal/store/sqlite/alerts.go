package sqlite

import (
	"context"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// Alert is something worth being told about without opening the dashboard.
// There are four, because a fifth would be noise:
//
//	stopped   nothing has arrived for a while, and it should have
//	spike     today is far above the usual
//	customer  someone paid
//	disk      the volume is filling up
type Alert struct {
	ID        string  `json:"id"`
	SiteID    string  `json:"site_id"`
	Kind      string  `json:"kind"`
	Enabled   bool    `json:"enabled"`
	Target    string  `json:"target"`
	Threshold float64 `json:"threshold"`
	LastFired int64   `json:"last_fired"`
	Created   int64   `json:"created_at"`
}

// AlertKinds are the four, plus the weekly report, in the order the dashboard
// shows them.
var AlertKinds = []string{"stopped", "spike", "customer", "disk", "weekly"}

// Alerts lists a site's alerts.
func (s *Store) Alerts(ctx context.Context, site string) ([]Alert, error) {
	rows, err := s.DB.QueryContext(ctx,
		`SELECT id, site_id, kind, enabled, target, threshold, last_fired, created_at FROM alerts WHERE site_id = ? ORDER BY created_at`, site)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAlerts(rows)
}

// LiveAlerts lists every enabled alert across sites (for the checker).
func (s *Store) LiveAlerts(ctx context.Context) ([]Alert, error) {
	rows, err := s.DB.QueryContext(ctx,
		`SELECT id, site_id, kind, enabled, target, threshold, last_fired, created_at FROM alerts WHERE enabled = 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAlerts(rows)
}

// OperatorTargets are where the installation's own problems go (a failed
// backup, a full disk): every destination of an enabled alert on the
// operator's sites. Customers' destinations never hear about the server they
// run on.
func (s *Store) OperatorTargets(ctx context.Context) ([]string, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT DISTINCT a.target FROM alerts a JOIN sites s ON s.id = a.site_id
		WHERE a.enabled = 1 AND a.target != '' AND s.account_id = ? ORDER BY a.target`, DefaultAccount)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func scanAlerts(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
}) ([]Alert, error) {
	out := []Alert{}
	for rows.Next() {
		var a Alert
		var on int
		if err := rows.Scan(&a.ID, &a.SiteID, &a.Kind, &on, &a.Target, &a.Threshold, &a.LastFired, &a.Created); err != nil {
			return nil, err
		}
		a.Enabled = on == 1
		out = append(out, a)
	}
	return out, rows.Err()
}

// SaveAlert adds or replaces one alert for a site and kind.
func (s *Store) SaveAlert(ctx context.Context, a Alert) (Alert, error) {
	a.Kind = strings.TrimSpace(a.Kind)
	a.Target = strings.TrimSpace(a.Target)
	valid := false
	for _, k := range AlertKinds {
		valid = valid || k == a.Kind
	}
	if !valid || a.Target == "" {
		return Alert{}, auth.ErrNotFound
	}
	if a.ID == "" {
		a.ID = auth.Token("alert_", 8)
		a.Created = time.Now().Unix()
	}
	// An existing alert is only updated from its own site: an id from
	// another site changes nothing and is reported as not found.
	res, err := s.DB.ExecContext(ctx, `
		INSERT INTO alerts (id, site_id, kind, enabled, target, threshold, last_fired, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (id) DO UPDATE SET enabled = excluded.enabled, target = excluded.target, threshold = excluded.threshold
		WHERE alerts.site_id = excluded.site_id`,
		a.ID, a.SiteID, a.Kind, boolInt(a.Enabled), a.Target, a.Threshold, a.LastFired, a.Created)
	if err != nil {
		return a, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Alert{}, auth.ErrNotFound
	}
	return a, nil
}

// MarkFired records that an alert has just been sent, so it does not repeat.
func (s *Store) MarkFired(ctx context.Context, id string, at int64) {
	s.DB.ExecContext(ctx, `UPDATE alerts SET last_fired = ? WHERE id = ?`, at, id)
}

// DeleteAlert removes one alert.
func (s *Store) DeleteAlert(ctx context.Context, site, id string) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM alerts WHERE site_id = ? AND id = ?`, site, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return nil
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
