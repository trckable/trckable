package sqlite

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/auth"
)

// ErrThreshold says a threshold alert needs a metric, a period and a number it can reach.
var ErrThreshold = errors.New("a threshold needs sales, revenue or visitors, a day, week, month or all time, and a number above zero")

// Alert is something worth being told about without opening the dashboard.
// There are four, because a fifth would be noise:
//
//	stopped   nothing has arrived for a while, and it should have
//	spike     today is far above the usual
//	customer  money came in: a new customer, an upgrade, a refund
//	disk      the volume is filling up
//
// A surge (the site far busier than usual right now) is the seventh, and
// weekly and milestone the others. A threshold is told when a count (sales,
// revenue or visitors) reaches a number within a day, week, month or all time:
// Threshold is the number, Metric and Period say what and over which stretch.
type Alert struct {
	ID        string  `json:"id"`
	SiteID    string  `json:"site_id"`
	Kind      string  `json:"kind"`
	Enabled   bool    `json:"enabled"`
	Target    string  `json:"target"`
	Threshold float64 `json:"threshold"`
	LastFired int64   `json:"last_fired"`
	Created   int64   `json:"created_at"`
	// Metric and Period belong to a threshold alert (alerts.Metrics, alerts.Periods).
	Metric string `json:"metric,omitempty"`
	Period string `json:"period,omitempty"`
	// FiredPeriod is the stretch a threshold last fired for ("2026-10-20",
	// "w:2026-10-19", "2026-10", "all"); the checker's own, never read from a request.
	FiredPeriod string `json:"-"`
}

// AlertKinds are the four, plus the weekly report, milestones reached, a
// traffic surge, a mention that brought visitors (opt-in) and a threshold reached, in the order the dashboard shows them.
var AlertKinds = []string{"stopped", "spike", "customer", "disk", "weekly", "milestone", "surge", "mention", "answer", "threshold"}

// Alerts lists a site's alerts.
func (s *Store) Alerts(ctx context.Context, site string) ([]Alert, error) {
	rows, err := s.DB.QueryContext(ctx,
		`SELECT id, site_id, kind, enabled, target, threshold, last_fired, created_at, metric, period, fired_period FROM alerts WHERE site_id = ? ORDER BY created_at`, site)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAlerts(rows)
}

// LiveAlerts lists every enabled alert across sites (for the checker), except
// those of a site whose alerts are snoozed right now: every sender reads this,
// so a snooze silences them all.
func (s *Store) LiveAlerts(ctx context.Context) ([]Alert, error) {
	rows, err := s.DB.QueryContext(ctx,
		`SELECT id, site_id, kind, enabled, target, threshold, last_fired, created_at, metric, period, fired_period FROM alerts
		WHERE enabled = 1 AND site_id NOT IN (SELECT id FROM sites WHERE alerts_muted_until > ?)`, time.Now().Unix())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAlerts(rows)
}

// OperatorTargets are where the installation's own problems go (a failed
// backup, a full disk): every destination of an enabled alert on the
// installation's sites.
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
		if err := rows.Scan(&a.ID, &a.SiteID, &a.Kind, &on, &a.Target, &a.Threshold, &a.LastFired, &a.Created, &a.Metric, &a.Period, &a.FiredPeriod); err != nil {
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
	// What a threshold counts belongs to that kind only, and it must be a rule
	// that can be met.
	if a.Kind == "threshold" {
		if !alerts.ValidThreshold(a.Metric, a.Period, a.Threshold) {
			return Alert{}, ErrThreshold
		}
	} else {
		a.Metric, a.Period = "", ""
	}
	if a.ID == "" {
		a.ID = auth.Token("alert_", 8)
		a.Created = time.Now().Unix()
	}
	// An existing alert is only updated from its own site: an id from
	// another site changes nothing and is reported as not found.
	res, err := s.DB.ExecContext(ctx, `
		INSERT INTO alerts (id, site_id, kind, enabled, target, threshold, last_fired, created_at, metric, period)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (id) DO UPDATE SET enabled = excluded.enabled, target = excluded.target, threshold = excluded.threshold,
			metric = excluded.metric, period = excluded.period,
			-- a changed rule may speak again for the period it is in
			fired_period = CASE WHEN alerts.metric = excluded.metric AND alerts.period = excluded.period AND alerts.threshold = excluded.threshold
				THEN alerts.fired_period ELSE '' END
		WHERE alerts.site_id = excluded.site_id`,
		a.ID, a.SiteID, a.Kind, boolInt(a.Enabled), a.Target, a.Threshold, a.LastFired, a.Created, a.Metric, a.Period)
	if err != nil {
		return a, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Alert{}, auth.ErrNotFound
	}
	return a, nil
}

// MarkFired records that an alert has just been sent, so it does not repeat.
// The caller must not send again soon when this fails.
func (s *Store) MarkFired(ctx context.Context, id string, at int64) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE alerts SET last_fired = ? WHERE id = ?`, at, id)
	return err
}

// MarkThresholdFired records that a threshold alert has spoken for a period
// (alerts.Window's key), so it stays quiet until the next one.
func (s *Store) MarkThresholdFired(ctx context.Context, id, key string, at int64) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE alerts SET last_fired = ?, fired_period = ? WHERE id = ?`, at, key, id)
	return err
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
