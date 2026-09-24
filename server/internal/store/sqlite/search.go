package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// SearchConsole is a site's connection to Google Search Console. The key is
// kept sealed; only the account's email and the chosen property are ever
// shown back.
type SearchConsole struct {
	SiteID      string `json:"-"`
	KeyEnc      string `json:"-"`
	ClientEmail string `json:"client_email"`
	Property    string `json:"property"`
	Created     int64  `json:"created_at"`
	LastOK      int64  `json:"last_ok_at,omitempty"`
	LastError   string `json:"last_error,omitempty"`
}

// SearchConsoleOf returns the site's connection, or auth.ErrNotFound.
func (s *Store) SearchConsoleOf(ctx context.Context, site string) (SearchConsole, error) {
	var c SearchConsole
	var ok sql.NullInt64
	err := s.DB.QueryRowContext(ctx,
		`SELECT site_id, key_enc, client_email, property, created_at, last_ok_at, last_error FROM search_console WHERE site_id = ?`, site).
		Scan(&c.SiteID, &c.KeyEnc, &c.ClientEmail, &c.Property, &c.Created, &ok, &c.LastError)
	if errors.Is(err, sql.ErrNoRows) {
		return c, auth.ErrNotFound
	}
	c.LastOK = ok.Int64
	return c, err
}

// SetSearchConsoleKey stores a new key. A new key starts with no property:
// the list of properties it can read belongs to that account.
func (s *Store) SetSearchConsoleKey(ctx context.Context, site, keyEnc, email string) error {
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO search_console (site_id, key_enc, client_email, property, created_at)
		VALUES (?, ?, ?, '', ?)
		ON CONFLICT(site_id) DO UPDATE SET key_enc = excluded.key_enc, client_email = excluded.client_email,
			property = '', last_error = '', last_ok_at = NULL`,
		site, keyEnc, email, time.Now().Unix())
	return err
}

// SetSearchConsoleProperty picks which property the reports read.
func (s *Store) SetSearchConsoleProperty(ctx context.Context, site, property string) error {
	res, err := s.DB.ExecContext(ctx, `UPDATE search_console SET property = ? WHERE site_id = ?`, property, site)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return nil
}

// SearchConsoleStatus records how the last call to Google went, so Settings
// can say "Google refused the key yesterday" instead of an empty report.
func (s *Store) SearchConsoleStatus(ctx context.Context, site string, callErr error) error {
	if callErr == nil {
		_, err := s.DB.ExecContext(ctx, `UPDATE search_console SET last_ok_at = ?, last_error = '' WHERE site_id = ?`, time.Now().Unix(), site)
		return err
	}
	msg := callErr.Error()
	if len(msg) > 300 {
		msg = msg[:300]
	}
	_, err := s.DB.ExecContext(ctx, `UPDATE search_console SET last_error = ? WHERE site_id = ?`, msg, site)
	return err
}

// DeleteSearchConsole forgets the key. Nothing else is stored: the reports
// were always read from Google, never copied.
func (s *Store) DeleteSearchConsole(ctx context.Context, site string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM search_console WHERE site_id = ?`, site)
	return err
}
