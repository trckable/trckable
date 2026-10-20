package sqlite

import (
	"context"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// The outbox of messages that must not be lost (migration 75). A message is
// written here before it is sent; one that could not be sent stays, with when
// to try it next, until it is delivered or has been tried for NoticeGiveUp.
// Delivered rows are kept a week, so a key never sends twice. Form says what
// Body is (the notice package owns the forms and their JSON).

// NoticeGiveUp is how long a message is tried before it is marked failed.
const NoticeGiveUp = 24 * time.Hour

// Outbox states.
const (
	NoticePending = "pending"
	NoticeSent    = "sent"
	NoticeFailed  = "failed"
)

// OutboxRow is one message waiting to be delivered.
type OutboxRow struct {
	ID        string
	Key       string
	Account   string
	Kind      string
	Form      string
	Target    string
	Body      string
	Tries     int
	CreatedAt int64
	LastError string
}

// noticeClaim is how long a new message is left to whoever wrote it before the
// outbox's own worker may pick it up: the writer sends it at once, and the
// worker only takes over if that did not finish (a crash, a send that failed).
const noticeClaim = 2 * time.Minute

// QueueNotice writes a message and says whether it is new: a key already in
// the outbox is the same event, which is already on its way or delivered.
func (s *Store) QueueNotice(ctx context.Context, r OutboxRow, now time.Time) (OutboxRow, bool, error) {
	r.ID = auth.Token("ntx_", 10)
	r.CreatedAt = now.Unix()
	res, err := s.DB.ExecContext(ctx, `INSERT OR IGNORE INTO notice_outbox (id, key, account, kind, form, target, body, state, next_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, r.ID, r.Key, r.Account, r.Kind, r.Form, r.Target, r.Body, NoticePending, now.Add(noticeClaim).Unix(), now.Unix())
	if err != nil {
		return r, false, err
	}
	n, err := res.RowsAffected()
	return r, n > 0, err
}

// DueNotices lists up to limit pending messages whose time has come, oldest first.
func (s *Store) DueNotices(ctx context.Context, now time.Time, limit int) ([]OutboxRow, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, key, account, kind, form, target, body, tries, created_at, last_error FROM notice_outbox
		WHERE state = ? AND next_at <= ? ORDER BY next_at, rowid LIMIT ?`, NoticePending, now.Unix(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []OutboxRow
	for rows.Next() {
		var r OutboxRow
		if err := rows.Scan(&r.ID, &r.Key, &r.Account, &r.Kind, &r.Form, &r.Target, &r.Body, &r.Tries, &r.CreatedAt, &r.LastError); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// NoticeDelivered marks a message delivered.
func (s *Store) NoticeDelivered(ctx context.Context, id string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE notice_outbox SET state = ?, last_error = '' WHERE id = ?`, NoticeSent, id)
	return err
}

// NoticeRetry records a failed try and when the next one is.
func (s *Store) NoticeRetry(ctx context.Context, id string, tries int, next time.Time, cause string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE notice_outbox SET tries = ?, next_at = ?, last_error = ? WHERE id = ?`, tries, next.Unix(), cause, id)
	return err
}

// NoticeGaveUp marks a message that could not be delivered in a day.
func (s *Store) NoticeGaveUp(ctx context.Context, id string, tries int, cause string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE notice_outbox SET state = ?, tries = ?, last_error = ? WHERE id = ?`, NoticeFailed, tries, cause, id)
	return err
}

// PruneNotices removes delivered and failed messages older than a week.
func (s *Store) PruneNotices(ctx context.Context, now time.Time) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM notice_outbox WHERE state <> ? AND created_at < ?`, NoticePending, now.AddDate(0, 0, -7).Unix())
	return err
}

// NoticePerson is someone a notice can reach.
type NoticePerson struct {
	ID, Email, Role string
}

// NoticePeople lists the people of an account with their email, oldest first.
func (s *Store) NoticePeople(ctx context.Context, account string) ([]NoticePerson, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT u.id, u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id
		WHERE m.account_id = ? ORDER BY m.created_at, m.rowid`, account)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []NoticePerson
	for rows.Next() {
		var p NoticePerson
		if err := rows.Scan(&p.ID, &p.Email, &p.Role); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SignedInBefore says whether a person has signed in from a browser or a
// phone before: a new device is news only to someone who has used another.
func (s *Store) SignedInBefore(ctx context.Context, user string) (bool, error) {
	var n int
	err := s.DB.QueryRowContext(ctx, `SELECT (SELECT count(*) FROM known_devices WHERE user_id = ?) + (SELECT count(*) FROM devices WHERE user_id = ?)`, user, user).Scan(&n)
	return n > 0, err
}
