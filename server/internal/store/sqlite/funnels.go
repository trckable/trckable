package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/trckable/trckable/server/internal/auth"
)

// The funnels a site keeps by name: a list of steps, each a page or a goal,
// that Explore opens in one click. The numbers are never stored; they are
// counted when the funnel is opened, like any funnel.

const (
	// MaxFunnels is how many named funnels a site keeps.
	MaxFunnels = 20
	// MaxFunnelName is the longest name, in characters.
	MaxFunnelName = 60
	// MaxSavedSteps matches the longest funnel the report counts.
	MaxSavedSteps = 8
	maxStepValue  = 200
)

var (
	ErrFunnelName  = errors.New("give the funnel a name of up to 60 characters")
	ErrFunnelSteps = errors.New("a funnel has two to eight steps, each a page like /pricing or a goal")
	ErrFunnelFull  = errors.New("a site keeps at most 20 funnels")
	ErrFunnelTaken = errors.New("a funnel with that name exists")
)

// FunnelStep is one saved step: a page path or a goal's name.
type FunnelStep struct {
	Kind  string `json:"kind"` // "page" | "goal"
	Value string `json:"value"`
}

// Funnel is a named funnel of a site.
type Funnel struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`
	Steps     []FunnelStep `json:"steps"`
	CreatedAt int64        `json:"created_at"`
	UpdatedAt int64        `json:"updated_at"`
}

// CleanFunnelName trims a name and checks its length.
func CleanFunnelName(raw string) (string, error) {
	n := strings.Join(strings.Fields(raw), " ")
	if n == "" || utf8.RuneCountInString(n) > MaxFunnelName {
		return "", ErrFunnelName
	}
	return n, nil
}

// CleanFunnelSteps checks the steps: two to eight, a page starting with a
// slash or a goal with a name. The payment step is not kept: it needs a
// provider and is added when the funnel is opened.
func CleanFunnelSteps(in []FunnelStep) ([]FunnelStep, error) {
	if len(in) < 2 || len(in) > MaxSavedSteps {
		return nil, ErrFunnelSteps
	}
	out := make([]FunnelStep, 0, len(in))
	for _, st := range in {
		v := strings.TrimSpace(st.Value)
		if v == "" || len(v) > maxStepValue || strings.ContainsAny(v, "\r\n\t") {
			return nil, ErrFunnelSteps
		}
		switch st.Kind {
		case "page":
			if !strings.HasPrefix(v, "/") {
				return nil, ErrFunnelSteps
			}
		case "goal":
		default:
			return nil, ErrFunnelSteps
		}
		out = append(out, FunnelStep{Kind: st.Kind, Value: v})
	}
	return out, nil
}

func newFunnelID() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "fn_" + hex.EncodeToString(b), nil
}

// Funnels returns a site's saved funnels, oldest first.
func (s *Store) Funnels(ctx context.Context, site string) ([]Funnel, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, name, steps, created_at, updated_at FROM funnels WHERE site_id = ? ORDER BY created_at, id`, site)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Funnel{}
	for rows.Next() {
		var f Funnel
		var steps string
		if err := rows.Scan(&f.ID, &f.Name, &steps, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		if json.Unmarshal([]byte(steps), &f.Steps) != nil {
			f.Steps = []FunnelStep{}
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// CreateFunnel saves a named funnel. Names are kept apart without regard to
// case, so two people naming the same funnel do not make two.
func (s *Store) CreateFunnel(ctx context.Context, site, rawName string, rawSteps []FunnelStep) (Funnel, error) {
	name, err := CleanFunnelName(rawName)
	if err != nil {
		return Funnel{}, err
	}
	steps, err := CleanFunnelSteps(rawSteps)
	if err != nil {
		return Funnel{}, err
	}
	id, err := newFunnelID()
	if err != nil {
		return Funnel{}, err
	}
	body, _ := json.Marshal(steps)
	now := time.Now().Unix()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return Funnel{}, err
	}
	defer tx.Rollback()
	var n int
	var taken bool
	if err := tx.QueryRowContext(ctx, `SELECT count(*), coalesce(max(lower(name) = lower(?)), 0) FROM funnels WHERE site_id = ?`, name, site).Scan(&n, &taken); err != nil {
		return Funnel{}, err
	}
	switch {
	case taken:
		return Funnel{}, ErrFunnelTaken
	case n >= MaxFunnels:
		return Funnel{}, ErrFunnelFull
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO funnels (id, site_id, name, steps, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, id, site, name, string(body), now, now); err != nil {
		return Funnel{}, err
	}
	if err := tx.Commit(); err != nil {
		return Funnel{}, err
	}
	return Funnel{ID: id, Name: name, Steps: steps, CreatedAt: now, UpdatedAt: now}, nil
}

// UpdateFunnel renames a funnel, changes its steps, or both: a nil field
// stays as it was. A funnel of another site is not found.
func (s *Store) UpdateFunnel(ctx context.Context, site, id string, rawName *string, rawSteps []FunnelStep) (Funnel, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return Funnel{}, err
	}
	defer tx.Rollback()
	var f Funnel
	var steps string
	err = tx.QueryRowContext(ctx, `SELECT id, name, steps, created_at FROM funnels WHERE id = ? AND site_id = ?`, id, site).Scan(&f.ID, &f.Name, &steps, &f.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Funnel{}, auth.ErrNotFound
	}
	if err != nil {
		return Funnel{}, err
	}
	_ = json.Unmarshal([]byte(steps), &f.Steps)
	if rawName != nil {
		if f.Name, err = CleanFunnelName(*rawName); err != nil {
			return Funnel{}, err
		}
		var taken bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM funnels WHERE site_id = ? AND id <> ? AND lower(name) = lower(?))`, site, id, f.Name).Scan(&taken); err != nil {
			return Funnel{}, err
		}
		if taken {
			return Funnel{}, ErrFunnelTaken
		}
	}
	if rawSteps != nil {
		if f.Steps, err = CleanFunnelSteps(rawSteps); err != nil {
			return Funnel{}, err
		}
	}
	body, _ := json.Marshal(f.Steps)
	f.UpdatedAt = time.Now().Unix()
	if _, err := tx.ExecContext(ctx, `UPDATE funnels SET name = ?, steps = ?, updated_at = ? WHERE id = ?`, f.Name, string(body), f.UpdatedAt, id); err != nil {
		return Funnel{}, err
	}
	return f, tx.Commit()
}

// DeleteFunnel removes a saved funnel (only its saved steps: the data it
// counted is untouched).
func (s *Store) DeleteFunnel(ctx context.Context, site, id string) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM funnels WHERE id = ? AND site_id = ?`, id, site)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return nil
}
