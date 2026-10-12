package sqlite

import (
	"context"
)

// Goal labels: a goal is counted under its key ("start-free") and shown as it
// was written ("Start free"). The label is the name as last received.

// NoteGoalLabel keeps the name a goal event arrived with. It writes only when
// the name differs from what was last kept, so a busy goal costs nothing.
// Best effort: the next event with the name tries again.
func (s *Store) NoteGoalLabel(ctx context.Context, site, goal, label string) {
	if label == "" || goal == "" {
		return
	}
	k := site + "\x00" + goal
	if v, ok := s.goalLabels.Load(k); ok && v.(string) == label {
		return
	}
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO goal_labels (site_id, goal, label) VALUES (?, ?, ?)
		ON CONFLICT (site_id, goal) DO UPDATE SET label = excluded.label WHERE goal_labels.label != excluded.label`,
		site, goal, label)
	if err == nil {
		s.goalLabels.Store(k, label)
	}
}

// GoalLabel is the name a goal was last sent with since the server started, or
// the key when none has arrived yet. It reads memory only, for the live stream.
func (s *Store) GoalLabel(site, goal string) string {
	if v, ok := s.goalLabels.Load(site + "\x00" + goal); ok {
		return v.(string)
	}
	return goal
}

// GoalLabels is the site's goal names as written, by key.
func (s *Store) GoalLabels(ctx context.Context, site string) (map[string]string, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT goal, label FROM goal_labels WHERE site_id = ?`, site)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, l string
		if err := rows.Scan(&k, &l); err != nil {
			return nil, err
		}
		out[k] = l
	}
	return out, rows.Err()
}
