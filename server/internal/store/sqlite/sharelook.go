package sqlite

import (
	"context"
	"database/sql"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// ShareLook is how a site's share links look to the people who open them:
// the owner's own logo, a colour, whether trckable's name is left off, and
// the domain the links are opened on. One per site, shared by all its links.
type ShareLook struct {
	Color     string `json:"color"`
	HideBrand bool   `json:"hide_brand"`
	Domain    string `json:"domain"`
	// LogoAt is when the logo last changed (0: no logo), for caching.
	LogoAt int64 `json:"logo_at"`
}

// MaxShareLogo is the largest logo kept, as stored (an SVG is stored after it
// was cleaned).
const MaxShareLogo = 128 << 10

// ErrBadDomain says what a share domain must look like.
var ErrBadDomain = errors.New("write the domain only, like reports.example.com: letters, digits and dashes, no https:// and no path")

// ErrDomainTaken: a domain opens the links of one site.
var ErrDomainTaken = errors.New("another site already uses that domain")

var domainLabel = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

// ShareDomain tidies a domain a person typed: lower case, no dot at the end.
// "" is valid and means no custom domain. A name has at least two labels, a
// last one that is not a number (so an address is not a domain), and only
// the ASCII form (an international name is written in its xn-- form).
func ShareDomain(in string) (string, error) {
	d := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(in)), ".")
	if d == "" {
		return "", nil
	}
	if len(d) > 253 {
		return "", ErrBadDomain
	}
	labels := strings.Split(d, ".")
	if len(labels) < 2 {
		return "", ErrBadDomain
	}
	for _, l := range labels {
		if !domainLabel.MatchString(l) {
			return "", ErrBadDomain
		}
	}
	if last := labels[len(labels)-1]; last[0] >= '0' && last[0] <= '9' {
		return "", ErrBadDomain
	}
	return d, nil
}

// ShareLookOf is a site's share look; a site that never set one has the
// empty look (trckable's name, the site's own colour, no domain).
func (s *Store) ShareLookOf(ctx context.Context, site string) ShareLook {
	var l ShareLook
	var hide int
	_ = s.DB.QueryRowContext(ctx, `SELECT color, hide_brand, domain, logo_at FROM site_share_look WHERE site_id = ?`, site).Scan(&l.Color, &hide, &l.Domain, &l.LogoAt)
	l.HideBrand = hide == 1
	return l
}

// SetShareLook saves the colour, the switch and the domain, and leaves the
// logo as it is. The domain must already be tidy (ShareDomain).
func (s *Store) SetShareLook(ctx context.Context, site, color string, hide bool, domain string) error {
	if color != "" && !hexColor.MatchString(color) {
		return ErrBadColor
	}
	if domain != "" {
		var other string
		err := s.DB.QueryRowContext(ctx, `SELECT site_id FROM site_share_look WHERE domain = ? AND site_id <> ?`, domain, site).Scan(&other)
		if err == nil {
			return ErrDomainTaken
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
	}
	h := 0
	if hide {
		h = 1
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO site_share_look (site_id, color, hide_brand, domain, updated_at) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (site_id) DO UPDATE SET color = excluded.color, hide_brand = excluded.hide_brand, domain = excluded.domain, updated_at = excluded.updated_at`,
		site, color, h, domain, time.Now().Unix())
	if err != nil && strings.Contains(err.Error(), "UNIQUE") {
		return ErrDomainTaken // two requests at once for one domain
	}
	return err
}

// SetShareLogo keeps a logo, already checked (and cleaned, for an SVG).
func (s *Store) SetShareLogo(ctx context.Context, site, typ string, data []byte) error {
	now := time.Now()
	_, err := s.DB.ExecContext(ctx, `INSERT INTO site_share_look (site_id, logo, logo_type, logo_at, updated_at) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (site_id) DO UPDATE SET logo = excluded.logo, logo_type = excluded.logo_type, logo_at = excluded.logo_at, updated_at = excluded.updated_at`,
		site, data, typ, now.UnixMilli(), now.Unix())
	return err
}

// ClearShareLogo takes the logo away; the rest of the look stays.
func (s *Store) ClearShareLogo(ctx context.Context, site string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE site_share_look SET logo = NULL, logo_type = '', logo_at = 0, updated_at = ? WHERE site_id = ?`, time.Now().Unix(), site)
	return err
}

// ShareLogo returns a site's logo and its media type; sql.ErrNoRows if none.
func (s *Store) ShareLogo(ctx context.Context, site string) (string, []byte, error) {
	var typ string
	var data []byte
	err := s.DB.QueryRowContext(ctx, `SELECT logo_type, logo FROM site_share_look WHERE site_id = ? AND logo IS NOT NULL`, site).Scan(&typ, &data)
	if err == nil && len(data) == 0 {
		err = sql.ErrNoRows
	}
	return typ, data, err
}

// ShareDomains maps every share domain to the site whose links it opens.
func (s *Store) ShareDomains(ctx context.Context) (map[string]string, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT domain, site_id FROM site_share_look WHERE domain <> ''`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var d, site string
		if err := rows.Scan(&d, &site); err != nil {
			return nil, err
		}
		out[d] = site
	}
	return out, rows.Err()
}

// ShareSiteForToken is the site a link's token belongs to, "" for no such
// link. Used where only the site matters: which domain a link may be opened
// on, and whether the password page hides the name.
func (s *Store) ShareSiteForToken(ctx context.Context, token string) string {
	var site string
	_ = s.DB.QueryRowContext(ctx, `SELECT site_id FROM site_shares WHERE token_hash = ?`,
		hex.EncodeToString(auth.Hash(strings.TrimSpace(token)))).Scan(&site)
	return site
}
