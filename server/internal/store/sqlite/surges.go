package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/trckable/trckable/server/internal/surge"
)

// Surges are a site's busy spells (internal/surge): when each began and
// ended, the most online at once and who they were. The chart marks them and
// the weekly report tells the busiest one.

// SaveSurge writes a surge that has just begun, or updates one that goes on
// or has ended (its end, its peak).
func (s *Store) SaveSurge(ctx context.Context, x surge.Surge) error {
	why, err := json.Marshal(x.Why)
	if err != nil {
		return err
	}
	_, err = s.DB.ExecContext(ctx, `
		INSERT INTO surges (id, site_id, started_at, ended_at, peak, usual, why) VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (id) DO UPDATE SET ended_at = excluded.ended_at, peak = excluded.peak, why = excluded.why
		WHERE surges.site_id = excluded.site_id`,
		x.ID, x.Site, x.Started, x.Ended, x.Online, x.Usual, string(why))
	return err
}

const surgeCols = `id, site_id, started_at, ended_at, peak, usual, why`

func scanSurge(row interface{ Scan(...any) error }) (surge.Surge, error) {
	var x surge.Surge
	var why string
	if err := row.Scan(&x.ID, &x.Site, &x.Started, &x.Ended, &x.Online, &x.Usual, &why); err != nil {
		return x, err
	}
	if why != "" {
		_ = json.Unmarshal([]byte(why), &x.Why) // a note that cannot be read is no reason to lose the spell
	}
	return x, nil
}

// LatestSurge is the site's most recent surge, or nil when it has had none.
func (s *Store) LatestSurge(ctx context.Context, site string) (*surge.Surge, error) {
	x, err := scanSurge(s.DB.QueryRowContext(ctx, `SELECT `+surgeCols+` FROM surges WHERE site_id = ? ORDER BY started_at DESC LIMIT 1`, site))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &x, nil
}

// SurgesBetween lists the surges that began in [from, to) (unix seconds), earliest first.
func (s *Store) SurgesBetween(ctx context.Context, site string, from, to int64) ([]surge.Surge, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+surgeCols+` FROM surges WHERE site_id = ? AND started_at >= ? AND started_at < ? ORDER BY started_at`, site, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []surge.Surge
	for rows.Next() {
		x, err := scanSurge(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

// BusiestSurge is the surge with the most people online among those that
// began in [from, to), or nil when there was none.
func (s *Store) BusiestSurge(ctx context.Context, site string, from, to int64) (*surge.Surge, error) {
	x, err := scanSurge(s.DB.QueryRowContext(ctx, `SELECT `+surgeCols+` FROM surges WHERE site_id = ? AND started_at >= ? AND started_at < ? ORDER BY peak DESC, started_at LIMIT 1`, site, from, to))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &x, nil
}
