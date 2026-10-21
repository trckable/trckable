package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"net/url"
	"strings"
	"time"
)

// What a site's people can steer in the uptime check (server/uptime.go): a
// pause, and a few more paths of the same domain looked at with the
// homepage. The address is always the site's own domain; only the path is
// kept, so no setting can aim the look at another host.

// MaxUptimePaths is how many extra paths a site may have.
const MaxUptimePaths = 5

// maxUptimePathLen bounds a path kept (a path with its query).
const maxUptimePathLen = 200

var (
	// ErrUptimePath says an address is not a path of the site: "/pricing".
	ErrUptimePath = errors.New("use a path on your own domain, like /pricing")
	// ErrUptimeFull says the site already has MaxUptimePaths.
	ErrUptimeFull = errors.New("a site checks at most five more pages")
)

// Uptime is a site's uptime settings.
type Uptime struct {
	Paused bool     `json:"paused"`
	Paths  []string `json:"paths"`
	Max    int      `json:"max"`
}

// CleanUptimePath turns what a person typed into the path kept: it starts
// with a single slash, has no host, no fragment and no control characters.
// A full address of any host is refused, whatever the host: the check only
// ever calls the site's own domain.
func CleanUptimePath(raw string) (string, error) {
	p := strings.TrimSpace(raw)
	if p == "" || len(p) > maxUptimePathLen || !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") ||
		strings.ContainsAny(p, " \\#\t\r\n") {
		return "", ErrUptimePath
	}
	for _, r := range p {
		if r < 0x20 || r == 0x7f {
			return "", ErrUptimePath
		}
	}
	u, err := url.Parse(p)
	if err != nil || u.Host != "" || u.Scheme != "" || u.User != nil {
		return "", ErrUptimePath
	}
	return p, nil
}

// UptimeOf returns a site's uptime settings.
func (s *Store) UptimeOf(ctx context.Context, site string) (Uptime, error) {
	out := Uptime{Paths: []string{}, Max: MaxUptimePaths}
	err := s.DB.QueryRowContext(ctx, `SELECT paused FROM site_uptime WHERE site_id = ?`, site).Scan(&out.Paused)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return out, err
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT path FROM site_uptime_paths WHERE site_id = ? ORDER BY created_at, path`, site)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return out, err
		}
		out.Paths = append(out.Paths, p)
	}
	return out, rows.Err()
}

// PausedUptime returns the ids of the sites whose check is paused.
func (s *Store) PausedUptime(ctx context.Context) (map[string]bool, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT site_id FROM site_uptime WHERE paused = 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// SetUptimePaused pauses or resumes a site's check. Pausing forgets a down or
// blocked state: a check that is not looking says nothing, so it neither
// keeps a site down nor tells anyone it came back. The open incident ends at
// the next incident step, as for a site that answered again.
func (s *Store) SetUptimePaused(ctx context.Context, site string, paused bool, now int64) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	at := int64(0)
	if paused {
		at = now
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO site_uptime (site_id, paused, paused_at) VALUES (?, ?, ?)
		ON CONFLICT(site_id) DO UPDATE SET paused = excluded.paused, paused_at = excluded.paused_at`, site, paused, at); err != nil {
		return err
	}
	if paused {
		if _, err := tx.ExecContext(ctx, `INSERT INTO site_uptime_pauses (site_id, from_at) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM site_uptime_pauses WHERE site_id = ? AND to_at = 0) ON CONFLICT(site_id, from_at) DO UPDATE SET to_at = 0`, site, now, site); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE site_probe SET failures = 0, down_since = 0, blocked_since = 0, error = '', probed_at = ? WHERE site_id = ?`, now, site); err != nil {
			return err
		}
	}
	if !paused {
		if _, err := tx.ExecContext(ctx, `UPDATE site_uptime_pauses SET to_at = ? WHERE site_id = ? AND to_at = 0`, now, site); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// PausedSeconds is how much of [from, to] (unix seconds) the site's check was
// paused: that time was not looked at, so it is neither up nor down. A pause
// still going counts up to `to`.
func (s *Store) PausedSeconds(ctx context.Context, site string, from, to int64) (int64, error) {
	var n int64
	err := s.DB.QueryRowContext(ctx, `SELECT coalesce(sum(max(0, min(CASE WHEN to_at = 0 THEN ? ELSE to_at END, ?) - max(from_at, ?))), 0)
		FROM site_uptime_pauses WHERE site_id = ?`, to, to, from, site).Scan(&n)
	return n, err
}

// PauseSpan is a stretch of time the check was paused, in unix seconds.
type PauseSpan struct {
	From int64 `json:"from"`
	To   int64 `json:"to"`
}

// PauseSpans returns the pauses that touch [from, to], each cut to it (one still going ends at `to`), oldest first.
func (s *Store) PauseSpans(ctx context.Context, site string, from, to int64) ([]PauseSpan, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT max(from_at, ?), min(CASE WHEN to_at = 0 THEN ? ELSE to_at END, ?) FROM site_uptime_pauses
		WHERE site_id = ? AND from_at < ? AND (to_at = 0 OR to_at > ?) ORDER BY from_at`, from, to, to, site, to, from)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PauseSpan{}
	for rows.Next() {
		var p PauseSpan
		if err := rows.Scan(&p.From, &p.To); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// AddUptimePath adds a path to a site's check and returns the settings. A
// path already there is kept as it is; a sixth is refused.
func (s *Store) AddUptimePath(ctx context.Context, site, raw string) (Uptime, error) {
	path, err := CleanUptimePath(raw)
	if err != nil {
		return Uptime{}, err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return Uptime{}, err
	}
	defer tx.Rollback()
	var n int
	var have bool
	if err := tx.QueryRowContext(ctx, `SELECT count(*), coalesce(max(path = ?), 0) FROM site_uptime_paths WHERE site_id = ?`, path, site).Scan(&n, &have); err != nil {
		return Uptime{}, err
	}
	if !have {
		if n >= MaxUptimePaths {
			return Uptime{}, ErrUptimeFull
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO site_uptime_paths (site_id, path, created_at) VALUES (?, ?, ?)`, site, path, time.Now().Unix()); err != nil {
			return Uptime{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Uptime{}, err
	}
	return s.UptimeOf(ctx, site)
}

// RemoveUptimePath takes a path out of a site's check.
func (s *Store) RemoveUptimePath(ctx context.Context, site, path string) (Uptime, error) {
	if _, err := s.DB.ExecContext(ctx, `DELETE FROM site_uptime_paths WHERE site_id = ? AND path = ?`, site, path); err != nil {
		return Uptime{}, err
	}
	return s.UptimeOf(ctx, site)
}
