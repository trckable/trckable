package sqlite

import (
	"context"
	"encoding/json"
	"strings"
	"time"
)

// SiteConfig is everything a site's owner can change about how trckable
// records and keeps their data. Defaults record the most: a site gives
// something up only when its owner says so.
type SiteConfig struct {
	ExcludePaths  []string `json:"exclude_paths"`
	HonorDNT      bool     `json:"honor_dnt"`
	RecordCity    bool     `json:"record_city"`
	RetentionDays int      `json:"retention_days"` // 0 keeps everything
	WeekStart     int      `json:"week_start"`     // 1 Monday, 0 Sunday
	BotStrict     bool     `json:"bot_strict"`
	// ConsentFree runs the site the way European law lets you run analytics
	// without asking for consent: nothing is stored in the browser, no city,
	// and DNT and GPC are honoured. The server enforces it.
	ConsentFree bool `json:"consent_free"`
	// Groups collect pages into sections: everything under /blog is "Blog".
	// First match wins, so the order is the rule.
	Groups []Group `json:"groups"`
	// PageGoals are goals completed by visiting a page: "Saw pricing =
	// /pricing". Unlike groups, one page view can complete several.
	PageGoals []Group `json:"page_goals"`
	// Banner is how the consent module asks. Every field is optional; empty
	// wording means the built-in English.
	Banner BannerText `json:"banner"`
}

// BannerText is what trckable's cookie bar says and how it looks. It asks
// about one cookie, so there is little to say; everything else here is so the
// bar can belong to the site it is on rather than to trckable.
type BannerText struct {
	// Mode is how consent is collected: "read" (the default) watches the
	// consent manager the site already runs; "bar" shows trckable's own.
	Mode    string `json:"mode"`
	Text    string `json:"text"`
	Accept  string `json:"accept"`
	Decline string `json:"decline"`
	Policy  string `json:"policy"` // link to the site's privacy policy
	// Look. Empty colours keep trckable's dark default.
	Bg       string `json:"bg"`
	Fg       string `json:"fg"`
	Button   string `json:"button"`
	ButtonFg string `json:"button_fg"`
	Position string `json:"position"` // "br" (default), "bl", "wide"
	Radius   int    `json:"radius"`   // corner radius in px; 0 keeps the default
	// CSS is written by the site and added inside the bar's shadow root,
	// after everything else, so it wins. Anything the fields above cannot
	// express lives here.
	CSS string `json:"css"`
}

// MaxBannerField keeps the bar a bar: long enough for a sentence in any
// language, short enough that it cannot become a wall of text. MaxBannerCSS
// is roomier, because a stylesheet is not a sentence.
const (
	MaxBannerField = 200
	MaxBannerCSS   = 4000
)

// Group is one content group: a name and the paths that belong to it.
type Group struct {
	Name string `json:"name"`
	// Path is a glob, the same shape excluded paths use: a trailing * matches
	// a prefix, anything else is exact.
	Path string `json:"path"`
}

// MaxGroups is as many sections as one site can have. Past that the card
// stops being a summary.
const MaxGroups = 30

// DefaultSiteConfig is what a new site gets.
func DefaultSiteConfig() SiteConfig {
	return SiteConfig{RecordCity: true, WeekStart: 1}
}

// SiteConfig reads a site's configuration, falling back to the defaults.
func (s *Store) SiteConfig(ctx context.Context, site string) (SiteConfig, error) {
	c := DefaultSiteConfig()
	var paths, groups, banner, pageGoals string
	var dnt, city, strict, free int
	err := s.DB.QueryRowContext(ctx, `
		SELECT exclude_paths, honor_dnt, record_city, retention_days, week_start, bot_strict, consent_free, groups, banner, page_goals
		FROM site_settings WHERE site_id = ?`, site).
		Scan(&paths, &dnt, &city, &c.RetentionDays, &c.WeekStart, &strict, &free, &groups, &banner, &pageGoals)
	if err != nil {
		return c, nil // no row yet: the defaults are the answer, not an error
	}
	c.HonorDNT, c.RecordCity, c.BotStrict, c.ConsentFree = dnt == 1, city == 1, strict == 1, free == 1
	c.Banner = readBanner(banner)
	for _, line := range strings.Split(paths, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			c.ExcludePaths = append(c.ExcludePaths, line)
		}
	}
	c.Groups = parseGroups(groups)
	c.PageGoals = parseGroups(pageGoals)
	return c, nil
}

// parseGroups reads "Name = /glob" lines back. A line without an "=" is a
// glob whose name is the glob, which is what someone typing quickly means.
func parseGroups(s string) []Group {
	var out []Group
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		name, path, ok := strings.Cut(line, "=")
		if !ok {
			name, path = line, line
		}
		name, path = strings.TrimSpace(name), strings.TrimSpace(path)
		if path == "" {
			continue
		}
		out = append(out, Group{Name: name, Path: path})
	}
	return out
}

// The bar's wording is JSON, not the line format the groups use: it is free
// text in any language, and a sentence containing "=" or a newline must come
// back exactly as it was typed.
func readBanner(s string) BannerText {
	var b BannerText
	if s != "" {
		json.Unmarshal([]byte(s), &b)
	}
	return b
}

func writeBanner(b BannerText) string {
	clip := func(v string) string {
		v = strings.TrimSpace(v)
		if len(v) > MaxBannerField {
			v = v[:MaxBannerField]
		}
		return v
	}
	css := strings.TrimSpace(b.CSS)
	if len(css) > MaxBannerCSS {
		css = css[:MaxBannerCSS]
	}
	if b.Radius < 0 || b.Radius > 40 {
		b.Radius = 0
	}
	if b.Position != "bl" && b.Position != "wide" {
		b.Position = ""
	}
	if b.Mode != "bar" {
		b.Mode = ""
	}
	b = BannerText{
		Mode: b.Mode,
		Text: clip(b.Text), Accept: clip(b.Accept), Decline: clip(b.Decline), Policy: clip(b.Policy),
		Bg: colour(b.Bg), Fg: colour(b.Fg), Button: colour(b.Button), ButtonFg: colour(b.ButtonFg),
		Position: b.Position, Radius: b.Radius, CSS: css,
	}
	if b == (BannerText{}) {
		return ""
	}
	out, _ := json.Marshal(b)
	return string(out)
}

// colour keeps the picked colours to what a colour input produces. Anything
// else is dropped rather than passed through into a stylesheet.
func colour(v string) string {
	v = strings.TrimSpace(v)
	if len(v) != 7 || v[0] != '#' {
		return ""
	}
	for _, r := range v[1:] {
		if !strings.ContainsRune("0123456789abcdefABCDEF", r) {
			return ""
		}
	}
	return strings.ToLower(v)
}

func writeGroups(gs []Group) string {
	lines := make([]string, 0, len(gs))
	for _, g := range gs {
		name, path := strings.TrimSpace(g.Name), strings.TrimSpace(g.Path)
		if path == "" || strings.ContainsAny(name+path, "\n=") {
			continue // a name with an = in it would not read back the same way
		}
		if name == "" {
			name = path
		}
		lines = append(lines, name+" = "+path)
	}
	return strings.Join(lines, "\n")
}

// SetSiteConfig writes a site's configuration and refreshes the ingest cache,
// so the next event already follows it.
func (s *Store) SetSiteConfig(ctx context.Context, site string, c SiteConfig) error {
	b := func(v bool) int {
		if v {
			return 1
		}
		return 0
	}
	if c.RetentionDays < 0 {
		c.RetentionDays = 0
	}
	if c.WeekStart != 0 {
		c.WeekStart = 1
	}
	if c.ConsentFree { // the mode owns these two while it is on
		c.HonorDNT, c.RecordCity = true, false
	}
	if len(c.Groups) > MaxGroups {
		c.Groups = c.Groups[:MaxGroups]
	}
	if len(c.PageGoals) > MaxGroups {
		c.PageGoals = c.PageGoals[:MaxGroups]
	}
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO site_settings (site_id, exclude_paths, honor_dnt, record_city, retention_days, week_start, bot_strict, consent_free, groups, banner, page_goals, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (site_id) DO UPDATE SET
			exclude_paths = excluded.exclude_paths, honor_dnt = excluded.honor_dnt,
			record_city = excluded.record_city, retention_days = excluded.retention_days,
			week_start = excluded.week_start, bot_strict = excluded.bot_strict,
			consent_free = excluded.consent_free, groups = excluded.groups,
			banner = excluded.banner, page_goals = excluded.page_goals, updated_at = excluded.updated_at`,
		site, strings.Join(c.ExcludePaths, "\n"), b(c.HonorDNT), b(c.RecordCity), c.RetentionDays, c.WeekStart, b(c.BotStrict), b(c.ConsentFree), writeGroups(c.Groups), writeBanner(c.Banner), writeGroups(c.PageGoals), time.Now().Unix())
	if err != nil {
		return err
	}
	return s.reloadSites(ctx)
}

// RetentionPlan lists every site that keeps data for a limited time.
func (s *Store) RetentionPlan(ctx context.Context) (map[string]int, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT site_id, retention_days FROM site_settings WHERE retention_days > 0`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var site string
		var days int
		if err := rows.Scan(&site, &days); err != nil {
			return nil, err
		}
		out[site] = days
	}
	return out, rows.Err()
}
