package sqlite

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"
)

// MaxFeedback is the longest note kept, in characters.
const MaxFeedback = 2000

// Feedback is one note somebody wrote in the dashboard.
type Feedback struct {
	ID      int64  `json:"id"`
	Email   string `json:"email"`
	Site    string `json:"site,omitempty"`
	Path    string `json:"path,omitempty"`
	Version string `json:"version,omitempty"`
	Message string `json:"message"`
	At      int64  `json:"at"`
}

// AddFeedback keeps a note from a person, with where in the dashboard they
// were. The message is cut to MaxFeedback characters; an empty one is not kept.
func (s *Store) AddFeedback(ctx context.Context, userID, site, path, version, message string, now time.Time) error {
	message = strings.TrimSpace(message)
	if message == "" {
		return nil
	}
	if utf8.RuneCountInString(path) > 200 {
		path = string([]rune(path)[:200])
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO feedback (user_id, site_id, path, version, message, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, site, path, version, message, now.Unix())
	return err
}

// ListFeedback is the newest notes first, at most limit of them.
func (s *Store) ListFeedback(ctx context.Context, limit int) ([]Feedback, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT f.id, COALESCE(u.email, ''), f.site_id, f.path, f.version, f.message, f.created_at
		FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.created_at DESC, f.id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Feedback{}
	for rows.Next() {
		var f Feedback
		if err := rows.Scan(&f.ID, &f.Email, &f.Site, &f.Path, &f.Version, &f.Message, &f.At); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}
