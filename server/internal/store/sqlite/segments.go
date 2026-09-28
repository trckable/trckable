package sqlite

import (
	"context"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// Segment is a filtered view worth keeping: "AI assistants on the pricing
// page", "Germany, mobile". It stores the dashboard's own query, so opening
// one is the same as opening a link.
type Segment struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Query   string `json:"query"`
	Created int64  `json:"created_at"`
}

// MaxSegments keeps the list a list.
const MaxSegments = 30

// Segments lists a site's saved views, oldest first.
func (s *Store) Segments(ctx context.Context, site string) ([]Segment, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, name, query, created_at FROM segments WHERE site_id = ? ORDER BY created_at`, site)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Segment{}
	for rows.Next() {
		var g Segment
		if err := rows.Scan(&g.ID, &g.Name, &g.Query, &g.Created); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// SaveSegment stores a view under a name.
func (s *Store) SaveSegment(ctx context.Context, site, name, query string) (Segment, error) {
	name, query = strings.TrimSpace(name), strings.TrimSpace(query)
	if name == "" || query == "" {
		return Segment{}, auth.ErrNotFound
	}
	if len([]rune(name)) > 60 {
		name = string([]rune(name)[:60])
	}
	var n int
	if err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM segments WHERE site_id = ?`, site).Scan(&n); err != nil {
		return Segment{}, err
	}
	if n >= MaxSegments {
		return Segment{}, ErrTooManySegments
	}
	g := Segment{ID: auth.Token("seg_", 8), Name: name, Query: query, Created: time.Now().Unix()}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO segments (id, site_id, name, query, created_at) VALUES (?, ?, ?, ?, ?)`,
		g.ID, site, g.Name, g.Query, g.Created)
	return g, err
}

// DeleteSegment removes one saved view.
func (s *Store) DeleteSegment(ctx context.Context, site, id string) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM segments WHERE site_id = ? AND id = ?`, site, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return nil
}

// RenameSegment gives a saved view a new name; what it shows stays the same.
func (s *Store) RenameSegment(ctx context.Context, site, id, name string) (Segment, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Segment{}, ErrSegmentName
	}
	if len([]rune(name)) > 60 {
		name = string([]rune(name)[:60])
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE segments SET name = ? WHERE site_id = ? AND id = ?`, name, site, id)
	if err != nil {
		return Segment{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Segment{}, auth.ErrNotFound
	}
	var g Segment
	err = s.DB.QueryRowContext(ctx, `SELECT id, name, query, created_at FROM segments WHERE site_id = ? AND id = ?`, site, id).
		Scan(&g.ID, &g.Name, &g.Query, &g.Created)
	return g, err
}
