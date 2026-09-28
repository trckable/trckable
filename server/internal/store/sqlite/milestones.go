package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// Milestones are what a site reached and when: 1,000 visitors, its first
// sale, a record day. The nightly check (internal/milestones) writes them,
// once each: the key is (site, kind, step), so running it again adds nothing.
// Who has seen one is per person; a share link is a random token per
// milestone, stored hashed, that its owner can revoke.

// Milestone is one row, as a person sees it.
type Milestone struct {
	Kind     string  `json:"kind"`
	Step     string  `json:"step"`
	Value    float64 `json:"value"`
	Currency string  `json:"currency,omitempty"`
	Day      string  `json:"day"` // YYYY-MM-DD, the site's time
	// Quiet rows were found by the first look back: in the timeline, never a moment.
	Quiet     bool  `json:"-"`
	CreatedAt int64 `json:"created_at"`
	// New: not quiet and not yet closed by this person.
	New bool `json:"new"`
	// Shared: a link is live. Amount: it shows the amount of money.
	Shared bool `json:"shared"`
	Amount bool `json:"amount,omitempty"`
}

// ErrShared says a milestone already has a live link: its token is shown
// once, so a new one needs the old one revoked first.
var ErrShared = errors.New("this milestone already has a link; revoke it to make a new one")

// AddMilestones stores rows that are not there yet and returns the ones it
// added. Rows already stored are left exactly as they are.
func (s *Store) AddMilestones(ctx context.Context, site string, rows []Milestone) ([]Milestone, error) {
	if len(rows) == 0 {
		return nil, nil
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	now := time.Now().Unix()
	var added []Milestone
	for _, m := range rows {
		res, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO milestones (site_id, kind, step, value, currency, reached_on, seen, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, site, m.Kind, m.Step, m.Value, m.Currency, m.Day, m.Quiet, now)
		if err != nil {
			return nil, err
		}
		if n, _ := res.RowsAffected(); n == 1 {
			m.CreatedAt = now
			added = append(added, m)
		}
	}
	return added, tx.Commit()
}

// Milestones lists a site's milestones, newest first, as user sees them
// (user "" for an API key: nothing is new to a key).
func (s *Store) Milestones(ctx context.Context, site, user string) ([]Milestone, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT m.kind, m.step, m.value, m.currency, m.reached_on, m.seen, m.created_at,
			(SELECT count(*) FROM milestone_seen v WHERE v.site_id = m.site_id AND v.kind = m.kind AND v.step = m.step AND v.user_id = ?),
			coalesce(sh.amount, -1)
		FROM milestones m LEFT JOIN milestone_shares sh ON sh.site_id = m.site_id AND sh.kind = m.kind AND sh.step = m.step
		WHERE m.site_id = ? ORDER BY m.reached_on DESC, m.created_at DESC, m.kind`, user, site)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Milestone{}
	for rows.Next() {
		var m Milestone
		var closed, amount int
		if err := rows.Scan(&m.Kind, &m.Step, &m.Value, &m.Currency, &m.Day, &m.Quiet, &m.CreatedAt, &closed, &amount); err != nil {
			return nil, err
		}
		m.New = user != "" && !m.Quiet && closed == 0
		m.Shared, m.Amount = amount >= 0, amount == 1
		out = append(out, m)
	}
	return out, rows.Err()
}

// CloseMilestones records that user has seen these milestones of site, so
// none of them is a moment for them again. Keys that are not the site's are
// ignored.
func (s *Store) CloseMilestones(ctx context.Context, site, user string, keys [][2]string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().Unix()
	for _, k := range keys {
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO milestone_seen (site_id, kind, step, user_id, at)
			SELECT site_id, kind, step, ?, ? FROM milestones WHERE site_id = ? AND kind = ? AND step = ?`, user, now, site, k[0], k[1]); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// MilestoneSite is what the nightly check needs to know about a site.
type MilestoneSite struct {
	ID, Timezone, Currency string
	// Day is the last finished day checked; "" means look back over all of it.
	Day string
}

// MilestoneSites lists every site for the nightly check. A site with the
// switch off is checked too: turning it back on loses nothing.
func (s *Store) MilestoneSites(ctx context.Context) ([]MilestoneSite, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, timezone, currency, milestones_day FROM sites ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MilestoneSite
	for rows.Next() {
		var m MilestoneSite
		if err := rows.Scan(&m.ID, &m.Timezone, &m.Currency, &m.Day); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// SetMilestonesDay records the last finished day checked for a site. ""
// asks for a new look back (after an import changed its history).
func (s *Store) SetMilestonesDay(ctx context.Context, site, day string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE sites SET milestones_day = ? WHERE id = ?`, day, site)
	return err
}

// MilestonesOn is the site's switch: off hides the moment and the timeline.
func (s *Store) MilestonesOn(ctx context.Context, site string) (bool, error) {
	var on bool
	err := s.DB.QueryRowContext(ctx, `SELECT milestones FROM sites WHERE id = ?`, site).Scan(&on)
	if errors.Is(err, sql.ErrNoRows) {
		return false, auth.ErrNotFound
	}
	return on, err
}

// SetMilestonesOn turns a site's milestones on or off.
func (s *Store) SetMilestonesOn(ctx context.Context, site string, on bool) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE sites SET milestones = ? WHERE id = ?`, on, site)
	return err
}

// ShareMilestone makes the link for one milestone and returns its token,
// which is never stored and never shown again. amount says whether a money
// milestone's card shows the amount.
func (s *Store) ShareMilestone(ctx context.Context, site, kind, step string, amount bool) (string, error) {
	var n int
	if err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM milestones WHERE site_id = ? AND kind = ? AND step = ?`, site, kind, step).Scan(&n); err != nil {
		return "", err
	}
	if n == 0 {
		return "", auth.ErrNotFound
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(b)
	res, err := s.DB.ExecContext(ctx, `INSERT OR IGNORE INTO milestone_shares (token_hash, site_id, kind, step, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		hex.EncodeToString(auth.Hash(token)), site, kind, step, amount, time.Now().Unix())
	if err != nil {
		return "", err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return "", ErrShared
	}
	return token, nil
}

// RevokeMilestoneShare ends a milestone's link. Anyone holding it gets
// nothing from then on.
func (s *Store) RevokeMilestoneShare(ctx context.Context, site, kind, step string) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM milestone_shares WHERE site_id = ? AND kind = ? AND step = ?`, site, kind, step)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return nil
}

// SharedMilestone is what a link opens: one milestone and its site's
// domain, nothing else.
type SharedMilestone struct {
	Milestone
	SiteID string
	Domain string
}

// MilestoneByToken finds the one milestone a link opens. A revoked link, a
// deleted site or a site with milestones off is not found.
func (s *Store) MilestoneByToken(ctx context.Context, token string) (SharedMilestone, error) {
	var m SharedMilestone
	if token == "" || len(token) > 64 {
		return m, auth.ErrNotFound
	}
	err := s.DB.QueryRowContext(ctx, `SELECT m.site_id, st.domain, m.kind, m.step, m.value, m.currency, m.reached_on, sh.amount
		FROM milestone_shares sh
		JOIN milestones m ON m.site_id = sh.site_id AND m.kind = sh.kind AND m.step = sh.step
		JOIN sites st ON st.id = sh.site_id
		WHERE sh.token_hash = ? AND st.milestones = 1`, hex.EncodeToString(auth.Hash(token))).
		Scan(&m.SiteID, &m.Domain, &m.Kind, &m.Step, &m.Value, &m.Currency, &m.Day, &m.Amount)
	if errors.Is(err, sql.ErrNoRows) {
		return m, auth.ErrNotFound
	}
	m.Shared = err == nil
	return m, err
}
