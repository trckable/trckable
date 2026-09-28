package sqlite

import (
	"context"
	"errors"
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
	// Author is who left it, by display name (or email when they set
	// none); empty for notes from before names were kept. Share links never
	// carry it: a stranger has no need of a teammate's name.
	Author   string `json:"author,omitempty"`
	AuthorID string `json:"-"`
}

// ErrNoteText is a note with no words, or a day that is not YYYY-MM-DD.
var ErrNoteText = errors.New("a note needs some words and a day")

// noteDay checks a day is a real calendar date.
func noteDay(day string) bool {
	_, err := time.Parse("2006-01-02", day)
	return err == nil
}

// noteText trims a note and keeps it under the limit.
func noteText(text string) string {
	text = strings.TrimSpace(text)
	if len([]rune(text)) > MaxAnnotationText {
		text = string([]rune(text)[:MaxAnnotationText])
	}
	return text
}

// MaxAnnotationText keeps a note a note.
const MaxAnnotationText = 140

// Annotations lists a site's notes for a period (inclusive).
func (s *Store) Annotations(ctx context.Context, site, from, to string) ([]Annotation, error) {
	rows, err := s.DB.QueryContext(ctx,
		`SELECT a.id, a.day, a.text, a.created_at, a.author_id, coalesce(nullif(u.name, ''), u.email, '')
		 FROM annotations a LEFT JOIN users u ON u.id = a.author_id AND a.author_id <> ''
		 WHERE a.site_id = ? AND a.day >= ? AND a.day <= ? ORDER BY a.day, a.created_at`,
		site, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Annotation{}
	for rows.Next() {
		var a Annotation
		if err := rows.Scan(&a.ID, &a.Day, &a.Text, &a.Created, &a.AuthorID, &a.Author); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// AddAnnotation pins a note to a day. author is the user who left it, or
// empty for the automation token.
func (s *Store) AddAnnotation(ctx context.Context, site, author, day, text string) (Annotation, error) {
	text = noteText(text)
	if text == "" || !noteDay(day) {
		return Annotation{}, ErrNoteText
	}
	a := Annotation{ID: auth.Token("note_", 8), Day: day, Text: text, Created: time.Now().Unix(), AuthorID: author}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO annotations (id, site_id, day, text, created_at, author_id) VALUES (?, ?, ?, ?, ?, ?)`,
		a.ID, site, a.Day, a.Text, a.Created, author)
	if err != nil {
		return Annotation{}, err
	}
	return s.annotation(ctx, site, a.ID)
}

// UpdateAnnotation rewords a note or moves it to another day. The author
// stays who wrote it.
func (s *Store) UpdateAnnotation(ctx context.Context, site, id, day, text string) (Annotation, error) {
	text = noteText(text)
	if text == "" || !noteDay(day) {
		return Annotation{}, ErrNoteText
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE annotations SET day = ?, text = ? WHERE site_id = ? AND id = ?`, day, text, site, id)
	if err != nil {
		return Annotation{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Annotation{}, auth.ErrNotFound
	}
	return s.annotation(ctx, site, id)
}

// annotation reads one note back, with its author's name.
func (s *Store) annotation(ctx context.Context, site, id string) (Annotation, error) {
	var a Annotation
	err := s.DB.QueryRowContext(ctx,
		`SELECT a.id, a.day, a.text, a.created_at, a.author_id, coalesce(nullif(u.name, ''), u.email, '')
		 FROM annotations a LEFT JOIN users u ON u.id = a.author_id AND a.author_id <> ''
		 WHERE a.site_id = ? AND a.id = ?`, site, id).
		Scan(&a.ID, &a.Day, &a.Text, &a.Created, &a.AuthorID, &a.Author)
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
