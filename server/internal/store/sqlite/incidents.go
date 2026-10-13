package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/trckable/trckable/server/internal/auth"
)

// Incident is one stretch a site was down (it did not answer when looked at)
// or quiet (no visits, nothing known wrong). Open while EndedAt is nil.
type Incident struct {
	ID        string `json:"id"`
	Site      string `json:"site"`
	Kind      string `json:"kind"` // down | quiet
	StartedAt int64  `json:"started_at"`
	EndedAt   *int64 `json:"ended_at"`
	// Cause is the check's error, or "no visits".
	Cause string `json:"cause"`
	// Expected is the visits a normal stretch of that length would have
	// brought, estimated when the incident closed; nil when there was too
	// little history to say.
	Expected *int64 `json:"expected_visits"`
	Note     string `json:"note"`
}

// MaxIncidentNote keeps a note a note.
const MaxIncidentNote = 140

const incidentCols = `id, site_id, kind, started_at, ended_at, cause, expected_visits, note`

func scanIncident(row interface{ Scan(...any) error }) (Incident, error) {
	var x Incident
	var ended, exp sql.NullInt64
	if err := row.Scan(&x.ID, &x.Site, &x.Kind, &x.StartedAt, &ended, &x.Cause, &exp, &x.Note); err != nil {
		return x, err
	}
	if ended.Valid {
		x.EndedAt = &ended.Int64
	}
	if exp.Valid {
		x.Expected = &exp.Int64
	}
	return x, nil
}

// StartIncident records that a site went down or quiet at a time. A look
// repeated (or a restart in between) finds it recorded already and changes
// nothing: it reports whether this call recorded it.
func (s *Store) StartIncident(ctx context.Context, site, kind string, started int64, cause string) (bool, error) {
	res, err := s.DB.ExecContext(ctx, `INSERT OR IGNORE INTO incidents (id, site_id, kind, started_at, cause) VALUES (?, ?, ?, ?, ?)`,
		auth.Token("inc_", 8), site, kind, started, cause)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// OpenIncident is the site's incident that has not ended, or nil.
func (s *Store) OpenIncident(ctx context.Context, site string) (*Incident, error) {
	x, err := scanIncident(s.DB.QueryRowContext(ctx, `SELECT `+incidentCols+` FROM incidents WHERE site_id = ? AND ended_at IS NULL`, site))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &x, nil
}

// MarkIncidentDown turns an open quiet incident into a down one: the site
// stopped answering while it was already quiet.
func (s *Store) MarkIncidentDown(ctx context.Context, id, cause string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE incidents SET kind = 'down', cause = ? WHERE id = ? AND ended_at IS NULL`, cause, id)
	return err
}

// EndIncident closes an open incident. expected may be nil.
func (s *Store) EndIncident(ctx context.Context, id string, ended int64, expected *int64) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE incidents SET ended_at = ?, expected_visits = ? WHERE id = ? AND ended_at IS NULL`, ended, expected, id)
	return err
}

// Incidents lists a site's incidents, newest first. before (a started_at,
// 0: none) continues after the last one of a page; from and to (0: none)
// keep those that overlap [from, to).
func (s *Store) Incidents(ctx context.Context, site string, limit int, before, from, to int64) ([]Incident, error) {
	q := `SELECT ` + incidentCols + ` FROM incidents WHERE site_id = ?`
	args := []any{site}
	if before > 0 {
		q += ` AND started_at < ?`
		args = append(args, before)
	}
	if to > 0 {
		q += ` AND started_at < ?`
		args = append(args, to)
	}
	if from > 0 {
		q += ` AND (ended_at IS NULL OR ended_at > ?)`
		args = append(args, from)
	}
	q += ` ORDER BY started_at DESC LIMIT ?`
	args = append(args, limit)
	return s.incidentRows(ctx, q, args...)
}

// AccountIncidents lists the incidents of an account's sites that overlap
// [from, ∞), newest first, at most limit.
func (s *Store) AccountIncidents(ctx context.Context, account string, from int64, limit int) ([]Incident, error) {
	return s.incidentRows(ctx, `SELECT i.id, i.site_id, i.kind, i.started_at, i.ended_at, i.cause, i.expected_visits, i.note
		FROM incidents i JOIN sites s ON s.id = i.site_id
		WHERE s.account_id = ? AND (i.ended_at IS NULL OR i.ended_at > ?) ORDER BY i.started_at DESC LIMIT ?`, account, from, limit)
}

func (s *Store) incidentRows(ctx context.Context, q string, args ...any) ([]Incident, error) {
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Incident{}
	for rows.Next() {
		x, err := scanIncident(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

// SetIncidentNote words an incident ("Hosting migration"); blank clears it.
func (s *Store) SetIncidentNote(ctx context.Context, site, id, note string) (Incident, error) {
	note = strings.TrimSpace(note)
	if r := []rune(note); len(r) > MaxIncidentNote {
		note = string(r[:MaxIncidentNote])
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE incidents SET note = ? WHERE id = ? AND site_id = ?`, note, id, site)
	if err != nil {
		return Incident{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Incident{}, auth.ErrNotFound
	}
	return scanIncident(s.DB.QueryRowContext(ctx, `SELECT `+incidentCols+` FROM incidents WHERE id = ?`, id))
}
