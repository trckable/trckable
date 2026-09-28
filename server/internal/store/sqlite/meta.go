package sqlite

import (
	"context"
	"database/sql"
	"errors"
)

// Meta reads one value the server keeps about itself (not about any site),
// such as how the last off-site copy went. ok is false when it was never set.
func (s *Store) Meta(ctx context.Context, key string) (value string, ok bool, err error) {
	err = s.DB.QueryRowContext(ctx, `SELECT value FROM meta WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	return value, err == nil, err
}

// SetMeta stores one such value, replacing what was there.
func (s *Store) SetMeta(ctx context.Context, key, value string) error {
	_, err := s.DB.ExecContext(ctx,
		`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

// DeleteMeta removes one such value.
func (s *Store) DeleteMeta(ctx context.Context, key string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM meta WHERE key = ?`, key)
	return err
}
