package sqlite

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
)

// Keymap is the shortcuts one person changed: action id → key, as the
// dashboard names them ("period.today" → "t", "ask" → "mod+k"). The server
// only checks the shape; which actions exist is the dashboard's business.
type Keymap map[string]string

var (
	keyAction = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,31}$`)
	keyCombo  = regexp.MustCompile(`^(mod\+)?(alt\+)?[^+\s]{1,12}$`)
	// ErrKeymap: a keymap that is not a short list of action → key.
	ErrKeymap = errors.New("that is not a list of shortcuts")
)

// UserKeymap returns a person's changed shortcuts (empty: all defaults).
func (s *Store) UserKeymap(ctx context.Context, user string) (Keymap, error) {
	var raw string
	if err := s.DB.QueryRowContext(ctx, `SELECT keymap FROM users WHERE id = ?`, user).Scan(&raw); err != nil {
		return nil, err
	}
	km := Keymap{}
	if raw != "" {
		_ = json.Unmarshal([]byte(raw), &km) // a broken value reads as the defaults
	}
	return km, nil
}

// SetUserKeymap replaces a person's changed shortcuts. Two actions may not
// share a key, or one press would do two things.
func (s *Store) SetUserKeymap(ctx context.Context, user string, km Keymap) error {
	if len(km) > 64 {
		return ErrKeymap
	}
	seen := map[string]bool{}
	for action, combo := range km {
		if !keyAction.MatchString(action) || !keyCombo.MatchString(combo) || seen[combo] {
			return ErrKeymap
		}
		seen[combo] = true
	}
	raw := ""
	if len(km) > 0 {
		b, _ := json.Marshal(km)
		raw = string(b)
	}
	_, err := s.DB.ExecContext(ctx, `UPDATE users SET keymap = ? WHERE id = ?`, raw, user)
	return err
}
