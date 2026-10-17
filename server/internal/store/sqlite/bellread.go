package sqlite

import (
	"context"
	"errors"
)

const (
	bellKeep   = 300 // how many read marks one person keeps; the bell lists a week
	bellPerPut = 100
	bellIDMax  = 120
)

// ErrBellRead: notice ids that are not a short list of short strings.
var ErrBellRead = errors.New("that is not a list of notices")

// BellRead returns the ids of the notices a person has read, newest first.
func (s *Store) BellRead(ctx context.Context, user string) ([]string, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT notice_id FROM bell_read WHERE user_id = ? ORDER BY at DESC, notice_id LIMIT ?`, user, bellKeep)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// MarkBellRead adds notices to a person's read list (ones already there keep
// their time) and drops the oldest beyond what the bell can show.
func (s *Store) MarkBellRead(ctx context.Context, user string, ids []string, now int64) error {
	if len(ids) > bellPerPut {
		return ErrBellRead
	}
	for _, id := range ids {
		if id == "" || len(id) > bellIDMax {
			return ErrBellRead
		}
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, id := range ids {
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO bell_read (user_id, notice_id, at) VALUES (?, ?, ?)`, user, id, now); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM bell_read WHERE user_id = ? AND notice_id NOT IN
		(SELECT notice_id FROM bell_read WHERE user_id = ? ORDER BY at DESC, notice_id LIMIT ?)`, user, user, bellKeep); err != nil {
		return err
	}
	return tx.Commit()
}
