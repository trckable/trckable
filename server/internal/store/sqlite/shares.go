package sqlite

import (
	"context"
	"database/sql"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// A share is a link to one site's numbers for someone without an account: an
// investor, a client, a co-founder who will not sign in. It is read-only by
// construction — there is nothing behind it but a report — and what it may
// show is decided here, on the server, not by the page it opens.

// ErrNeedsPassword says the link is real but asks for a password first.
var ErrNeedsPassword = errors.New("this link is password-protected")

// ErrExpired says the link had an end date and has passed it.
var ErrExpired = errors.New("this link has expired")

// Share is one public link, as the owner sees it. The token itself is
// returned once, when it is created, and never again.
type Share struct {
	ID        string `json:"id"`
	SiteID    string `json:"site_id"`
	Name      string `json:"name"`
	Revenue   bool   `json:"revenue"` // false hides money, on the server
	ExpiresAt *int64 `json:"expires_at,omitempty"`
	HasPass   bool   `json:"has_password"`
	CreatedAt int64  `json:"created_at"`
	ViewedAt  *int64 `json:"viewed_at,omitempty"`
	Views     int64  `json:"views"`
	// EmbedOrigins are the sites allowed to show this link in an iframe,
	// like https://example.com. None means it cannot be framed at all.
	EmbedOrigins []string `json:"embed_origins,omitempty"`
}

// MaxEmbedOrigins caps the sites one link may be embedded on.
const MaxEmbedOrigins = 5

func splitLines(s string) []string {
	var out []string
	for _, l := range strings.Split(s, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			out = append(out, l)
		}
	}
	return out
}

// MaxSharesPerSite keeps a forgotten loop from filling the table.
const MaxSharesPerSite = 20

// Shares lists a site's links.
func (s *Store) Shares(ctx context.Context, site string) ([]Share, error) {
	rows, err := s.DB.QueryContext(ctx,
		`SELECT id, site_id, name, revenue, expires_at, pass_hash <> '', created_at, viewed_at, views, embed_origins
		 FROM site_shares WHERE site_id = ? ORDER BY created_at DESC`, site)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Share{}
	for rows.Next() {
		var sh Share
		var rev int
		var pass bool
		var origins string
		if err := rows.Scan(&sh.ID, &sh.SiteID, &sh.Name, &rev, &sh.ExpiresAt, &pass, &sh.CreatedAt, &sh.ViewedAt, &sh.Views, &origins); err != nil {
			return nil, err
		}
		sh.Revenue, sh.HasPass, sh.EmbedOrigins = rev == 1, pass, splitLines(origins)
		out = append(out, sh)
	}
	return out, rows.Err()
}

// CreateShare makes a link and returns its token — the only time it exists in
// readable form.
func (s *Store) CreateShare(ctx context.Context, site, name, password string, revenue bool, expires *int64, origins []string) (Share, string, error) {
	var n int
	if err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM site_shares WHERE site_id = ?`, site).Scan(&n); err != nil {
		return Share{}, "", err
	}
	if n >= MaxSharesPerSite {
		return Share{}, "", errors.New("that is as many links as one site can have; revoke one first")
	}
	token := auth.Token("", 16) // 26 chars of base32: not guessable
	pass := ""
	if strings.TrimSpace(password) != "" {
		h, err := auth.HashPassword(password)
		if err != nil {
			return Share{}, "", err
		}
		pass = h
	}
	if len(origins) > MaxEmbedOrigins {
		origins = origins[:MaxEmbedOrigins]
	}
	sh := Share{ID: auth.Token("shr_", 8), SiteID: site, Name: strings.TrimSpace(name), Revenue: revenue, ExpiresAt: expires, HasPass: pass != "", CreatedAt: time.Now().Unix(), EmbedOrigins: origins}
	rev := 0
	if revenue {
		rev = 1
	}
	_, err := s.DB.ExecContext(ctx,
		`INSERT INTO site_shares (id, site_id, name, token_hash, pass_hash, revenue, expires_at, created_at, embed_origins) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		sh.ID, site, sh.Name, hex.EncodeToString(auth.Hash(token)), pass, rev, expires, sh.CreatedAt, strings.Join(origins, "\n"))
	return sh, token, err
}

// DeleteShare revokes a link. Anyone holding it sees nothing from then on.
func (s *Store) DeleteShare(ctx context.Context, site, id string) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM site_shares WHERE site_id = ? AND id = ?`, site, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return nil
}

// OpenShare resolves a token. A wrong password and a missing one are told
// apart, because "this link needs a password" is not a secret worth keeping —
// the link itself is the secret.
func (s *Store) OpenShare(ctx context.Context, token, password string, now time.Time) (Share, error) {
	var sh Share
	var rev int
	var pass, origins string
	err := s.DB.QueryRowContext(ctx,
		`SELECT id, site_id, name, revenue, expires_at, pass_hash, created_at, viewed_at, views, embed_origins
		 FROM site_shares WHERE token_hash = ?`, hex.EncodeToString(auth.Hash(strings.TrimSpace(token)))).
		Scan(&sh.ID, &sh.SiteID, &sh.Name, &rev, &sh.ExpiresAt, &pass, &sh.CreatedAt, &sh.ViewedAt, &sh.Views, &origins)
	if errors.Is(err, sql.ErrNoRows) {
		return Share{}, auth.ErrNotFound
	}
	if err != nil {
		return Share{}, err
	}
	sh.Revenue, sh.HasPass, sh.EmbedOrigins = rev == 1, pass != "", splitLines(origins)
	if sh.ExpiresAt != nil && now.Unix() > *sh.ExpiresAt {
		return Share{}, ErrExpired
	}
	if pass != "" {
		if password == "" {
			return Share{}, ErrNeedsPassword
		}
		if !auth.VerifyPassword(pass, password) {
			return Share{}, auth.ErrBadLogin
		}
	}
	return sh, nil
}

// TouchShare records that a link was opened, so an owner can see whether one
// they forgot about is still being read.
func (s *Store) TouchShare(ctx context.Context, id string, now time.Time) {
	s.DB.ExecContext(ctx, `UPDATE site_shares SET viewed_at = ?, views = views + 1 WHERE id = ?`, now.Unix(), id)
}

// ShareSessionTTL is how long one opening of a protected link lasts.
const ShareSessionTTL = 12 * time.Hour

// StartShareSession trades a checked password for a token the browser keeps in
// a cookie, so the password is verified once and not on every report.
func (s *Store) StartShareSession(ctx context.Context, shareID string, now time.Time) (string, error) {
	token := auth.Token("shs_", 20)
	_, err := s.DB.ExecContext(ctx, `INSERT INTO share_sessions (token_hash, share_id, expires_at) VALUES (?, ?, ?)`,
		hex.EncodeToString(auth.Hash(token)), shareID, now.Add(ShareSessionTTL).Unix())
	return token, err
}

// ShareOf resolves a session cookie back to its link, and checks the link is
// still there and still valid — revoking a link ends every session on it.
func (s *Store) ShareOf(ctx context.Context, session string, now time.Time) (Share, error) {
	var id string
	var exp int64
	err := s.DB.QueryRowContext(ctx, `SELECT share_id, expires_at FROM share_sessions WHERE token_hash = ?`,
		hex.EncodeToString(auth.Hash(strings.TrimSpace(session)))).Scan(&id, &exp)
	if errors.Is(err, sql.ErrNoRows) {
		return Share{}, auth.ErrNotFound
	}
	if err != nil {
		return Share{}, err
	}
	if now.Unix() > exp {
		s.DB.ExecContext(ctx, `DELETE FROM share_sessions WHERE token_hash = ?`, hex.EncodeToString(auth.Hash(session)))
		return Share{}, ErrExpired
	}
	var sh Share
	var rev int
	var pass string
	err = s.DB.QueryRowContext(ctx,
		`SELECT id, site_id, name, revenue, expires_at, pass_hash, created_at, viewed_at, views FROM site_shares WHERE id = ?`, id).
		Scan(&sh.ID, &sh.SiteID, &sh.Name, &rev, &sh.ExpiresAt, &pass, &sh.CreatedAt, &sh.ViewedAt, &sh.Views)
	if errors.Is(err, sql.ErrNoRows) {
		return Share{}, auth.ErrNotFound // revoked while someone was reading
	}
	if err != nil {
		return Share{}, err
	}
	sh.Revenue, sh.HasPass = rev == 1, pass != ""
	if sh.ExpiresAt != nil && now.Unix() > *sh.ExpiresAt {
		return Share{}, ErrExpired
	}
	return sh, nil
}

// PruneShareSessions drops sessions that have run out, along with any left by
// a link that no longer exists.
func (s *Store) PruneShareSessions(ctx context.Context, now time.Time) {
	s.DB.ExecContext(ctx, `DELETE FROM share_sessions WHERE expires_at < ?`, now.Unix())
}

// EmbedOriginsFor returns the sites a link (by its token) may be framed on.
// Nothing for an unknown, expired or unembeddable link: the page then refuses
// to be framed, like every other page.
func (s *Store) EmbedOriginsFor(ctx context.Context, token string, now time.Time) []string {
	var origins string
	var expires *int64
	err := s.DB.QueryRowContext(ctx, `SELECT embed_origins, expires_at FROM site_shares WHERE token_hash = ?`,
		hex.EncodeToString(auth.Hash(strings.TrimSpace(token)))).Scan(&origins, &expires)
	if err != nil || (expires != nil && now.Unix() > *expires) {
		return nil
	}
	return splitLines(origins)
}
