package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"time"
)

// Brand is how a site looks in the dashboard: its accent colour and, when it
// has one, its icon (IconAt is when the icon last changed, for caching).
type Brand struct {
	Color  string `json:"color,omitempty"`
	IconAt int64  `json:"icon_at,omitempty"`
}

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// ErrBadColor: a colour is written as #rrggbb, or empty for none.
var ErrBadColor = errors.New("a colour is written as #rrggbb")

// MaxIcon is the largest icon kept: a favicon or a small square picture.
const MaxIcon = 64 << 10

// Brands returns every site of an account that has a colour or an icon.
func (s *Store) Brands(ctx context.Context, account string) (map[string]Brand, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT b.site_id, b.color, CASE WHEN b.icon IS NULL THEN 0 ELSE b.updated_at END
		FROM site_brand b JOIN sites s ON s.id = b.site_id WHERE s.account_id = ?`, account)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]Brand{}
	for rows.Next() {
		var id string
		var b Brand
		if err := rows.Scan(&id, &b.Color, &b.IconAt); err != nil {
			return nil, err
		}
		out[id] = b
	}
	return out, rows.Err()
}

// SetBrandColor sets a site's accent colour; "" takes it away.
func (s *Store) SetBrandColor(ctx context.Context, site, color string) error {
	if color != "" && !hexColor.MatchString(color) {
		return ErrBadColor
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO site_brand (site_id, color, updated_at) VALUES (?, ?, ?)
		ON CONFLICT (site_id) DO UPDATE SET color = excluded.color`, site, color, time.Now().Unix())
	return err
}

// SetBrandIcon stores a site's icon (already checked to be a small image).
func (s *Store) SetBrandIcon(ctx context.Context, site, typ string, data []byte) error {
	_, err := s.DB.ExecContext(ctx, `INSERT INTO site_brand (site_id, icon, icon_type, updated_at) VALUES (?, ?, ?, ?)
		ON CONFLICT (site_id) DO UPDATE SET icon = excluded.icon, icon_type = excluded.icon_type, updated_at = excluded.updated_at`,
		site, data, typ, time.Now().Unix())
	return err
}

// ClearBrandIcon removes a site's icon; its colour stays.
func (s *Store) ClearBrandIcon(ctx context.Context, site string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE site_brand SET icon = NULL, icon_type = '', updated_at = ? WHERE site_id = ?`, time.Now().Unix(), site)
	return err
}

// BrandIcon returns a site's icon and its media type; sql.ErrNoRows if none.
func (s *Store) BrandIcon(ctx context.Context, site string) (string, []byte, error) {
	var typ string
	var data []byte
	err := s.DB.QueryRowContext(ctx, `SELECT icon_type, icon FROM site_brand WHERE site_id = ? AND icon IS NOT NULL`, site).Scan(&typ, &data)
	if err == nil && len(data) == 0 {
		err = sql.ErrNoRows
	}
	return typ, data, err
}
