package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// Widget is a small public card a site shows on its own pages. Only the
// numbers its kind shows are ever served for it, and only while it is on.
type Widget struct {
	ID     string `json:"id"`
	SiteID string `json:"site_id"`
	// Name is how the owner tells their widgets apart, at most 40 characters.
	// Left blank it is the design's own name, so it follows the design.
	Name   string `json:"name"`
	Kind   string `json:"kind"`   // live, badge, counter, revenue, privacy, online
	Theme  string `json:"theme"`  // auto, dark, light
	Accent string `json:"accent"` // #rrggbb, or empty for trckable's own
	Radius int    `json:"radius"` // corner radius in px, 0–28
	Brand  bool   `json:"brand"`  // "Counted by trckable" under it
	// Lang is the language of its words: auto follows the visitor's browser.
	Lang string `json:"lang"`
	// Texts replace its labels, by key (WidgetTexts); a key left out keeps the
	// translated default. Plain text, never markup.
	Texts map[string]string `json:"texts"`
	// Shows are the parts the design can leave out or add: for live bars,
	// countries, pages and channels; for badge ai; for revenue channels; for
	// online its mode (spark, or card with pages and countries).
	Shows     []string `json:"shows"`
	On        bool     `json:"on"`
	CreatedAt int64    `json:"created_at"`
}

// ErrBadWidget: a kind, theme, colour or radius that is not one of ours.
var ErrBadWidget = errors.New("that is not a widget trckable can show")

// WidgetLangs are the languages a widget can speak, besides auto.
var WidgetLangs = map[string]bool{"auto": true, "en": true, "de": true, "fr": true, "es": true, "it": true, "nl": true, "pt": true, "sq": true}

// WidgetTexts are the labels each design lets its owner reword: the key the
// owner uses, and the message it replaces (api/widgetlang). Only labels: the
// privacy seal's statements are read from the site's settings and stay as they
// are, so a seal cannot say more than the site does.
var WidgetTexts = map[string]map[string]string{
	"online":  {"online": "online", "few": "few", "title": "online_title", "countries": "from", "pages": "reading"},
	"live":    {"title": "live_title", "countries": "from", "pages": "reading", "channels": "came"},
	"badge":   {"week": "week", "ai": "ai"},
	"counter": {"now": "counter"},
	"revenue": {"title": "rev_title", "channels": "rev_channels"},
	"privacy": {"title": "seal_title", "foot": "seal_foot"},
}

// MaxWidgetText is the longest label, in characters.
const MaxWidgetText = 40

// ErrWidgetText: a label longer than MaxWidgetText characters.
var ErrWidgetText = errors.New("a widget's text has at most 40 characters")

// ErrWidgetName: a name longer than MaxWidgetName characters.
var ErrWidgetName = errors.New("a widget's name has at most 40 characters")

// MaxWidgetName is the longest name, in characters.
const MaxWidgetName = 40

// MaxWidgets per site: enough for a few designs, not a way to fill a table.
const MaxWidgets = 10

// WidgetKinds are the designs there are, with the parts each may show and
// the ones it shows when nothing was chosen.
var WidgetKinds = map[string]bool{"live": true, "badge": true, "counter": true, "revenue": true, "privacy": true, "online": true}

var widgetParts = map[string]map[string]bool{
	"live":    {"bars": true, "countries": true, "pages": true, "channels": true},
	"badge":   {"ai": true},
	"revenue": {"channels": true},
	"online":  {"spark": true, "card": true, "pages": true, "countries": true},
}

var widgetDefaults = map[string][]string{"live": {"bars", "countries"}, "revenue": {"channels"}, "online": {}}

// HexColor says whether s is a #rrggbb colour.
func HexColor(s string) bool { return hexColor.MatchString(s) }

// WidgetPart says whether a design has a part.
func WidgetPart(kind, part string) bool { return widgetParts[kind][part] }

// Has says whether the widget shows a part.
func (w Widget) Has(part string) bool {
	for _, p := range w.Shows {
		if p == part {
			return true
		}
	}
	return false
}

// widgetNames are what an unnamed widget is called.
var widgetNames = map[string]string{"live": "Live now", "badge": "Last 7 days", "counter": "Counter", "revenue": "Open revenue", "privacy": "Privacy seal"}

// DefaultWidgetName is what a widget with no name of its own is called: its
// design, and for the online design its mode.
func DefaultWidgetName(kind string, shows []string) string {
	if kind != "online" {
		return widgetNames[kind]
	}
	switch m := onlineMode(shows); {
	case slices.Contains(m, "card"):
		return "Online card"
	case slices.Contains(m, "spark"):
		return "Online pill + graph"
	}
	return "Online pill"
}

// cleanText trims a label and drops control characters. It is not escaped
// here: it is only ever written out as text, which escapes it.
func cleanText(s string) string {
	return strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, s))
}

func (w *Widget) Clean() error {
	w.Name = cleanText(w.Name)
	if utf8.RuneCountInString(w.Name) > MaxWidgetName {
		return ErrWidgetName
	}
	switch w.Lang {
	case "":
		w.Lang = "auto"
	default:
		if !WidgetLangs[w.Lang] {
			return ErrBadWidget
		}
	}
	// A label this design does not have is dropped (the design may just have
	// been changed); one too long is refused. Empty keeps the default.
	texts := map[string]string{}
	for k, v := range w.Texts {
		v = cleanText(v)
		if _, ok := WidgetTexts[w.Kind][k]; !ok || v == "" {
			continue
		}
		if utf8.RuneCountInString(v) > MaxWidgetText {
			return ErrWidgetText
		}
		texts[k] = v
	}
	w.Texts = texts
	// "Counted by trckable" is part of every widget: it is how a visitor
	// finds out what counted them.
	w.Brand = true
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
	if w.Kind == "online" {
		w.Shows = onlineMode(w.Shows)
	}
	return nil
}

// onlineMode keeps one of the three modes of the online design: the pill (no
// part), the pill with a sparkline (spark), or the card (card, with the
// lists it shows). A list only belongs to the card, and a card has no
// sparkline of its own: it draws the full chart.
func onlineMode(shows []string) []string {
	has := func(p string) bool { return slices.Contains(shows, p) }
	switch {
	case has("card"):
		out := []string{"card"}
		for _, p := range []string{"pages", "countries"} {
			if has(p) {
				out = append(out, p)
			}
		}
		return out
	case has("spark"):
		return []string{"spark"}
	}
	return []string{}
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
	if err := w.Clean(); err != nil {
		return w, err
	}
	var n int
	if err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM widgets WHERE site_id = ?`, w.SiteID).Scan(&n); err != nil {
		return w, err
	}
	if n >= MaxWidgets {
		return w, errors.New("a site can have ten widgets: remove one first")
	}
	w.ID, w.On, w.CreatedAt = widgetID(), true, time.Now().Unix()
	_, err := s.DB.ExecContext(ctx, `INSERT INTO widgets (id, site_id, lang, texts, name, kind, theme, accent, radius, brand, shows, on_, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
		w.ID, w.SiteID, w.Lang, textsJSON(w.Texts), w.Name, w.Kind, w.Theme, w.Accent, w.Radius, bit(w.Brand), strings.Join(w.Shows, ","), w.CreatedAt)
	if w.Name == "" {
		w.Name = DefaultWidgetName(w.Kind, w.Shows)
	}
	return w, err
}

// UpdateWidget changes a widget's look, or turns it on or off.
func (s *Store) UpdateWidget(ctx context.Context, w Widget) (Widget, error) {
	if err := w.Clean(); err != nil {
		return w, err
	}
	// A name that is only the design's own is not kept: it would stay behind
	// when the design changes.
	if old, err := s.WidgetByID(ctx, w.ID); err == nil && old.SiteID == w.SiteID && w.Name == old.Name && old.Name == DefaultWidgetName(old.Kind, old.Shows) {
		w.Name = ""
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE widgets SET lang = ?, texts = ?, name = ?, kind = ?, theme = ?, accent = ?, radius = ?, brand = ?, shows = ?, on_ = ? WHERE id = ? AND site_id = ?`,
		w.Lang, textsJSON(w.Texts), w.Name, w.Kind, w.Theme, w.Accent, w.Radius, bit(w.Brand), strings.Join(w.Shows, ","), bit(w.On), w.ID, w.SiteID)
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
	rows, err := s.DB.QueryContext(ctx, `SELECT id, site_id, lang, texts, name, kind, theme, accent, radius, brand, shows, on_, created_at FROM widgets WHERE site_id = ? ORDER BY created_at DESC`, site)
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
	return scanWidget(s.DB.QueryRowContext(ctx, `SELECT id, site_id, lang, texts, name, kind, theme, accent, radius, brand, shows, on_, created_at FROM widgets WHERE id = ?`, id))
}

func scanWidget(r interface{ Scan(...any) error }) (Widget, error) {
	var w Widget
	var brand, on int
	var shows, texts string
	err := r.Scan(&w.ID, &w.SiteID, &w.Lang, &texts, &w.Name, &w.Kind, &w.Theme, &w.Accent, &w.Radius, &brand, &shows, &on, &w.CreatedAt)
	w.Brand, w.On = brand == 1, on == 1
	w.Shows = []string{}
	if shows != "" {
		w.Shows = strings.Split(shows, ",")
	}
	if w.Name == "" {
		w.Name = DefaultWidgetName(w.Kind, w.Shows)
	}
	w.Texts = map[string]string{}
	if texts != "" {
		_ = json.Unmarshal([]byte(texts), &w.Texts) // a damaged one reads as none: the defaults
	}
	return w, err
}

func textsJSON(t map[string]string) string {
	if len(t) == 0 {
		return ""
	}
	b, _ := json.Marshal(t)
	return string(b)
}

func bit(v bool) int {
	if v {
		return 1
	}
	return 0
}
