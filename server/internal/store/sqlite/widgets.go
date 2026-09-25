package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"errors"
	"strings"
	"time"
)

// Widget is a small public card a site shows on its own pages. Only the
// numbers its kind shows are ever served for it, and only while it is on.
type Widget struct {
	ID        string `json:"id"`
	SiteID    string `json:"site_id"`
	Kind      string `json:"kind"`   // live, badge, counter, revenue, privacy
	Theme     string `json:"theme"`  // auto, dark, light
	Accent    string `json:"accent"` // #rrggbb, or empty for trckable's own
	Radius    int    `json:"radius"` // corner radius in px, 0–28
	Brand     bool   `json:"brand"`  // "Counted by trckable" under it
	// Shows are the parts the design can leave out or add: for live bars,
	// countries, pages and channels; for badge ai; for revenue channels.
	Shows []string `json:"shows"`
	On        bool   `json:"on"`
	CreatedAt int64  `json:"created_at"`
}

// ErrBadWidget: a kind, theme, colour or radius that is not one of ours.
var ErrBadWidget = errors.New("that is not a widget trckable can show")

// MaxWidgets per site: enough for a few designs, not a way to fill a table.
const MaxWidgets = 10

// WidgetKinds are the designs there are, with the parts each may show and
// the ones it shows when nothing was chosen.
var WidgetKinds = map[string]bool{"live": true, "badge": true, "counter": true, "revenue": true, "privacy": true}

var widgetParts = map[string]map[string]bool{
	"live":    {"bars": true, "countries": true, "pages": true, "channels": true},
	"badge":   {"ai": true},
	"revenue": {"channels": true},
}

var widgetDefaults = map[string][]string{"live": {"bars", "countries"}, "revenue": {"channels"}}

// Has says whether the widget shows a part.
func (w Widget) Has(part string) bool {
	for _, p := range w.Shows {
		if p == part {
			return true
		}
	}
	return false
}

func (w *Widget) clean() error {
	if !WidgetKinds[w.Kind] {
		return ErrBadWidget
	}
	switch w.Theme {
	case "":
		w.Theme = "auto"
	case "auto", "dark", "light":
	default:
		return ErrBadWidget
	}
	if w.Accent != "" && !hexColor.MatchString(w.Accent) {
		return ErrBadWidget
	}
	w.Radius = max(0, min(28, w.Radius))
	var parts []string
	seen := map[string]bool{}
	for _, p := range w.Shows {
		if !widgetParts[w.Kind][p] {
			return ErrBadWidget
		}
		if !seen[p] {
			seen[p] = true
			parts = append(parts, p)
		}
	}
	w.Shows = parts
	if w.Shows == nil {
		w.Shows = []string{}
	}
	return nil
}

func widgetID() string {
	b := make([]byte, 10)
	rand.Read(b)
	return "w_" + strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b))
}

// CreateWidget adds a widget to a site, on.
func (s *Store) CreateWidget(ctx context.Context, w Widget) (Widget, error) {
	if w.Shows == nil {
		w.Shows = widgetDefaults[w.Kind]
	}
	if err := w.clean(); err != nil {
		return w, err
	}
	var n int
	s.DB.QueryRowContext(ctx, `SELECT count(*) FROM widgets WHERE site_id = ?`, w.SiteID).Scan(&n)
	if n >= MaxWidgets {
		return w, errors.New("a site can have ten widgets: remove one first")
	}
	w.ID, w.On, w.CreatedAt = widgetID(), true, time.Now().Unix()
	_, err := s.DB.ExecContext(ctx, `INSERT INTO widgets (id, site_id, kind, theme, accent, radius, brand, shows, on_, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
		w.ID, w.SiteID, w.Kind, w.Theme, w.Accent, w.Radius, bit(w.Brand), strings.Join(w.Shows, ","), w.CreatedAt)
	return w, err
}

// UpdateWidget changes a widget's look, or turns it on or off.
func (s *Store) UpdateWidget(ctx context.Context, w Widget) (Widget, error) {
	if err := w.clean(); err != nil {
		return w, err
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE widgets SET kind = ?, theme = ?, accent = ?, radius = ?, brand = ?, shows = ?, on_ = ? WHERE id = ? AND site_id = ?`,
		w.Kind, w.Theme, w.Accent, w.Radius, bit(w.Brand), strings.Join(w.Shows, ","), bit(w.On), w.ID, w.SiteID)
	if err != nil {
		return w, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return w, sql.ErrNoRows
	}
	return s.WidgetByID(ctx, w.ID)
}

// DeleteWidget removes one; its public page answers 404 from then on.
func (s *Store) DeleteWidget(ctx context.Context, site, id string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM widgets WHERE id = ? AND site_id = ?`, id, site)
	return err
}

// Widgets lists a site's widgets, newest first.
func (s *Store) Widgets(ctx context.Context, site string) ([]Widget, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, site_id, kind, theme, accent, radius, brand, shows, on_, created_at FROM widgets WHERE site_id = ? ORDER BY created_at DESC`, site)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Widget{}
	for rows.Next() {
		w, err := scanWidget(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

// WidgetByID finds a widget by its public id.
func (s *Store) WidgetByID(ctx context.Context, id string) (Widget, error) {
	return scanWidget(s.DB.QueryRowContext(ctx, `SELECT id, site_id, kind, theme, accent, radius, brand, shows, on_, created_at FROM widgets WHERE id = ?`, id))
}

func scanWidget(r interface{ Scan(...any) error }) (Widget, error) {
	var w Widget
	var brand, on int
	var shows string
	err := r.Scan(&w.ID, &w.SiteID, &w.Kind, &w.Theme, &w.Accent, &w.Radius, &brand, &shows, &on, &w.CreatedAt)
	w.Brand, w.On = brand == 1, on == 1
	w.Shows = []string{}
	if shows != "" {
		w.Shows = strings.Split(shows, ",")
	}
	return w, err
}

func bit(v bool) int {
	if v {
		return 1
	}
	return 0
}
