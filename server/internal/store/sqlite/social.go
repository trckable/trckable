package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// SocialAccount is one of the team's own social accounts (Channels). The
// tokens are kept sealed and never leave the server; only the handle and how
// the last pull went are shown back.
type SocialAccount struct {
	ID         string `json:"id"`
	AccountID  string `json:"-"`
	Platform   string `json:"platform"`
	ExternalID string `json:"-"`
	// AppUserID is the app-scoped id a platform's removal call carries.
	AppUserID  string `json:"-"`
	Handle     string `json:"handle"`
	AccessEnc  string `json:"-"`
	RefreshEnc string `json:"-"`
	Expires    int64  `json:"-"`
	Created    int64  `json:"created_at"`
	LastOK     int64  `json:"last_ok_at,omitempty"`
	// LastError is a short code (denied, expired, failed, limited), never a
	// platform's own words.
	LastError string `json:"error,omitempty"`
}

// SocialDay is one account's views on one day.
type SocialDay struct {
	Day   string `json:"day"` // YYYY-MM-DD, the platform's own day (UTC)
	Views int64  `json:"views"`
}

// SocialDayRow is a SocialDay with the account it belongs to.
type SocialDayRow struct {
	SocialID string
	Platform string
	SocialDay
}

const socialCols = `id, account_id, platform, external_id, app_user_id, handle, access_enc, refresh_enc, expires_at, created_at, last_ok_at, last_error`

func scanSocial(row interface{ Scan(...any) error }) (SocialAccount, error) {
	var a SocialAccount
	var ok sql.NullInt64
	err := row.Scan(&a.ID, &a.AccountID, &a.Platform, &a.ExternalID, &a.AppUserID, &a.Handle, &a.AccessEnc, &a.RefreshEnc, &a.Expires, &a.Created, &ok, &a.LastError)
	a.LastOK = ok.Int64
	return a, err
}

func (s *Store) socialList(ctx context.Context, where string, args ...any) ([]SocialAccount, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+socialCols+` FROM social_accounts `+where+` ORDER BY platform, created_at, id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SocialAccount
	for rows.Next() {
		a, err := scanSocial(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// SocialAccountsOf lists a team's connected accounts.
func (s *Store) SocialAccountsOf(ctx context.Context, account string) ([]SocialAccount, error) {
	return s.socialList(ctx, `WHERE account_id = ?`, account)
}

// SocialAccountsAll lists every connected account, for the daily pull.
func (s *Store) SocialAccountsAll(ctx context.Context) ([]SocialAccount, error) {
	return s.socialList(ctx, ``)
}

// SocialAccountOf returns one account of the team, or auth.ErrNotFound.
func (s *Store) SocialAccountOf(ctx context.Context, account, id string) (SocialAccount, error) {
	a, err := scanSocial(s.DB.QueryRowContext(ctx, `SELECT `+socialCols+` FROM social_accounts WHERE account_id = ? AND id = ?`, account, id))
	if errors.Is(err, sql.ErrNoRows) {
		return a, auth.ErrNotFound
	}
	return a, err
}

// SocialIDOf is the id the team's account on a platform already has, so
// connecting it again replaces its tokens instead of adding a second row.
func (s *Store) SocialIDOf(ctx context.Context, account, platform, external string) (string, bool) {
	var id string
	err := s.DB.QueryRowContext(ctx, `SELECT id FROM social_accounts WHERE account_id = ? AND platform = ? AND external_id = ?`, account, platform, external).Scan(&id)
	return id, err == nil
}

// SocialSave adds an account or replaces the tokens and handle of the one
// with this id, and clears whatever error it had.
func (s *Store) SocialSave(ctx context.Context, a SocialAccount) error {
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO social_accounts (id, account_id, platform, external_id, app_user_id, handle, access_enc, refresh_enc, expires_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET handle = excluded.handle, app_user_id = excluded.app_user_id, access_enc = excluded.access_enc,
			refresh_enc = excluded.refresh_enc, expires_at = excluded.expires_at, last_error = ''`,
		a.ID, a.AccountID, a.Platform, a.ExternalID, a.AppUserID, a.Handle, a.AccessEnc, a.RefreshEnc, a.Expires, time.Now().Unix())
	return err
}

// SocialPruneBefore deletes an account's days older than day.
func (s *Store) SocialPruneBefore(ctx context.Context, id, day string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM social_daily WHERE social_id = ? AND day < ?`, id, day)
	return err
}

// SocialSetTokens stores refreshed tokens.
func (s *Store) SocialSetTokens(ctx context.Context, id, accessEnc, refreshEnc string, expires int64) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE social_accounts SET access_enc = ?, refresh_enc = ?, expires_at = ? WHERE id = ?`, accessEnc, refreshEnc, expires, id)
	return err
}

// SocialStatus records how the last pull went: a code on failure, nothing on
// success.
func (s *Store) SocialStatus(ctx context.Context, id, code string) error {
	if code == "" {
		_, err := s.DB.ExecContext(ctx, `UPDATE social_accounts SET last_ok_at = ?, last_error = '' WHERE id = ?`, time.Now().Unix(), id)
		return err
	}
	_, err := s.DB.ExecContext(ctx, `UPDATE social_accounts SET last_error = ? WHERE id = ?`, code, id)
	return err
}

// SocialSaveDays writes days, replacing what an earlier pull wrote for them.
func (s *Store) SocialSaveDays(ctx context.Context, id, platform string, days []SocialDay) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, d := range days {
		if _, err := tx.ExecContext(ctx, `INSERT OR REPLACE INTO social_daily (social_id, platform, day, views) VALUES (?, ?, ?, ?)`, id, platform, d.Day, d.Views); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// SocialDaysOf returns the team's days from..to (inclusive), oldest first.
func (s *Store) SocialDaysOf(ctx context.Context, account, from, to string) ([]SocialDayRow, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT d.social_id, d.platform, d.day, d.views FROM social_daily d
		JOIN social_accounts a ON a.id = d.social_id
		WHERE a.account_id = ? AND d.day >= ? AND d.day <= ? ORDER BY d.day`, account, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SocialDayRow
	for rows.Next() {
		var r SocialDayRow
		if err := rows.Scan(&r.SocialID, &r.Platform, &r.Day, &r.Views); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SocialDelete disconnects one account of the team: its tokens and every day
// it holds go. It reports whether there was such an account.
func (s *Store) SocialDelete(ctx context.Context, account, id string) (bool, error) {
	return s.socialDrop(ctx, `account_id = ? AND id = ?`, account, id)
}

// SocialDeleteExternal disconnects every account that is this platform user's,
// whichever team holds it: a platform telling us the person removed the app.
func (s *Store) SocialDeleteExternal(ctx context.Context, platform, external string) (bool, error) {
	return s.socialDrop(ctx, `platform = ? AND (external_id = ? OR app_user_id = ?)`, platform, external, external)
}

func (s *Store) socialDrop(ctx context.Context, where string, args ...any) (bool, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `DELETE FROM social_daily WHERE social_id IN (SELECT id FROM social_accounts WHERE `+where+`)`, args...); err != nil {
		return false, err
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM social_accounts WHERE `+where, args...)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, tx.Commit()
}

// SocialForget keeps the account listed but drops its tokens and its days: a
// platform's rule that data not refreshed in time is deleted. The person sees
// "Reconnect".
func (s *Store) SocialForget(ctx context.Context, id, code string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `DELETE FROM social_daily WHERE social_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE social_accounts SET access_enc = '', refresh_enc = '', expires_at = 0, last_ok_at = NULL, last_error = ? WHERE id = ?`, code, id); err != nil {
		return err
	}
	return tx.Commit()
}
