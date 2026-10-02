package sqlite

import (
	"context"
	"database/sql"
	"errors"

	"github.com/trckable/trckable/server/internal/auth"
)

// DefaultAlerts turns on what a new site should be telling its owner without
// being asked: the weekly report, and "tracking stopped". It does so only for a
// site with no alerts yet, only where there is somewhere to send them, and
// never for a site that already has settings, so it can run for every new site
// and change nothing that someone chose.
//
// Where they go: the destination the account already uses for its other sites
// (a Slack or Discord webhook someone set up is a decision, and the next site
// follows it), else the account's first owner by email when this server can
// send email. With neither there is nothing to send to, nothing is created, and
// the dashboard offers the weekly email as a switch instead.
func (s *Store) DefaultAlerts(ctx context.Context, account, site string, mail bool) (bool, error) {
	var have int
	if err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM alerts WHERE site_id = ?`, site).Scan(&have); err != nil || have > 0 {
		return false, err
	}
	target, err := s.defaultTarget(ctx, account, mail)
	if err != nil || target == "" {
		return false, err
	}
	for _, kind := range []string{"weekly", "stopped"} {
		if _, err := s.SaveAlert(ctx, Alert{SiteID: site, Kind: kind, Enabled: true, Target: target}); err != nil {
			return false, err
		}
	}
	return true, nil
}

// DefaultAlertsForAccount does the same for every site of an account that has
// no alerts yet: the sites a server was started with exist before its first
// owner does.
func (s *Store) DefaultAlertsForAccount(ctx context.Context, account string, mail bool) error {
	sites, err := s.ListSites(ctx, account)
	if err != nil {
		return err
	}
	for _, st := range sites {
		if _, err := s.DefaultAlerts(ctx, account, st.ID, mail); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) defaultTarget(ctx context.Context, account string, mail bool) (string, error) {
	var target string
	err := s.DB.QueryRowContext(ctx, `
		SELECT a.target FROM alerts a JOIN sites s ON s.id = a.site_id
		WHERE s.account_id = ? AND a.enabled = 1 AND a.target != ''
		ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1`, account).Scan(&target)
	if err == nil {
		return target, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	if !mail {
		return "", nil
	}
	owner, err := holderOf(ctx, s.DB, account)
	if err != nil || owner == "" {
		return "", err
	}
	var email string
	if err := s.DB.QueryRowContext(ctx, `SELECT email FROM users WHERE id = ?`, owner).Scan(&email); err != nil {
		return "", err
	}
	return "mailto:" + email, nil
}

// AlertByID is one alert with the site's domain, for the page an email's
// unsubscribe link opens.
func (s *Store) AlertByID(ctx context.Context, id string) (Alert, string, error) {
	var a Alert
	var domain string
	var on int
	err := s.DB.QueryRowContext(ctx, `SELECT a.id, a.site_id, a.kind, a.enabled, a.target, a.threshold, a.last_fired, a.created_at, s.domain
		FROM alerts a JOIN sites s ON s.id = a.site_id WHERE a.id = ?`, id).
		Scan(&a.ID, &a.SiteID, &a.Kind, &on, &a.Target, &a.Threshold, &a.LastFired, &a.Created, &domain)
	a.Enabled = on == 1
	if errors.Is(err, sql.ErrNoRows) {
		return a, "", auth.ErrNotFound
	}
	return a, domain, err
}

// SetAlertEnabled switches one alert on or off, and only that one.
func (s *Store) SetAlertEnabled(ctx context.Context, id string, on bool) error {
	res, err := s.DB.ExecContext(ctx, `UPDATE alerts SET enabled = ? WHERE id = ?`, boolInt(on), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return nil
}
