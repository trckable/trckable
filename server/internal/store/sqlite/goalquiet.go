package sqlite

import (
	"context"
	"errors"
)

const (
	// goalQuietMax is how many goals one person may keep quiet; goalQuietLen the longest goal key.
	goalQuietMax = 500
	goalQuietLen = 200
)

// ErrGoalQuiet: a goal that is not a short key, or more quiet goals than a person can keep.
var ErrGoalQuiet = errors.New("that goal cannot be kept quiet")

// GoalQuiet is the goals one person only wants to hear of in the bell when they stand out, by "site\x00goal".
func (s *Store) GoalQuiet(ctx context.Context, user string) (map[string]bool, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT site_id, goal FROM goal_quiet WHERE user_id = ?`, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var site, goal string
		if err := rows.Scan(&site, &goal); err != nil {
			return nil, err
		}
		out[QuietKey(site, goal)] = true
	}
	return out, rows.Err()
}

// QuietKey is how GoalQuiet names a site's goal.
func QuietKey(site, goal string) string { return site + "\x00" + goal }

// SetGoalQuiet keeps a goal quiet for a person (or lets it be heard of every day again).
func (s *Store) SetGoalQuiet(ctx context.Context, user, site, goal string, quiet bool) error {
	if goal == "" || len(goal) > goalQuietLen {
		return ErrGoalQuiet
	}
	if !quiet {
		_, err := s.DB.ExecContext(ctx, `DELETE FROM goal_quiet WHERE user_id = ? AND site_id = ? AND goal = ?`, user, site, goal)
		return err
	}
	var n int
	if err := s.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM goal_quiet WHERE user_id = ?`, user).Scan(&n); err != nil {
		return err
	}
	if n >= goalQuietMax {
		return ErrGoalQuiet
	}
	_, err := s.DB.ExecContext(ctx, `INSERT OR IGNORE INTO goal_quiet (user_id, site_id, goal) VALUES (?, ?, ?)`, user, site, goal)
	return err
}
