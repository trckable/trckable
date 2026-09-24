package sqlite

import (
	"context"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// Annotation is a note pinned to a day on the chart: a launch, a post, an
// outage. Six months later it is the only thing that explains the spike.
type Annotation struct {
	ID      string `json:"id"`
	Day     string `json:"day"` // YYYY-MM-DD, in the site's timezone
	Text    string `json:"text"`
	Created int64  `json:"created_at"`
}

// MaxAnnotationText keeps a note a note.
const MaxAnnotationText = 140

// Annotations lists a site's notes for a period (inclusive).
func (s *Store) Annotations(ctx context.Context, site, from, to string) ([]Annotation, error) {
	rows, err := s.DB.QueryContext(ctx,
		`SELECT id, day, text, created_at FROM annotations WHERE site_id = ? AND day >= ? AND day <= ? ORDER BY day`,
		site, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Annotation{}
	for rows.Next() {
		var a Annotation
		if err := rows.Scan(&a.ID, &a.Day, &a.Text, &a.Created); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// AddAnnotation pins a note to a day.
func (s *Store) AddAnnotation(ctx context.Context, site, day, text string) (Annotation, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return Annotation{}, auth.ErrNotFound
	}
	if len([]rune(text)) > MaxAnnotationText {
		text = string([]rune(text)[:MaxAnnotationText])
	}
	a := Annotation{ID: auth.Token("note_", 8), Day: day, Text: text, Created: time.Now().Unix()}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO annotations (id, site_id, day, text, created_at) VALUES (?, ?, ?, ?, ?)`,
		a.ID, site, a.Day, a.Text, a.Created)
	return a, err
}

// DeleteAnnotation removes one note.
func (s *Store) DeleteAnnotation(ctx context.Context, site, id string) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM annotations WHERE site_id = ? AND id = ?`, site, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return nil
}
