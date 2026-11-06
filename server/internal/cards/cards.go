// Package cards draws share cards: 1200 × 630 pictures for link previews
// and posts, as SVG (for a page to show) and as PNG (for everything that
// does not read SVG). A card is a template, a theme, an accent colour and
// its words; each template lays out its shapes and its text once, and both
// formats are drawn from that one layout, so they cannot drift apart.
//
// Pure Go: the shapes go through a small SVG rasteriser, the text is set
// with Geist, embedded here (fonts/OFL.txt is its licence). No browser, no C.
package cards

import (
	"bytes"
	"fmt"
	"html"
	"image"
	"math"
	"strconv"
	"strings"
	"text/template"
)

// W and H are a card's size in pixels: what link previews use.
const (
	W = 1200
	H = 630
)

// Theme is a card's colours, before its accent.
type Theme struct {
	BG, FG, Muted string
	Accent, Money string // the default accent, and the one for money
	Down          string // a fall, in words next to a number
}

// Themes: dark by default, and light.
var Themes = map[string]Theme{
	"dark":  {BG: "#0b0d10", FG: "#f5f7fa", Muted: "#8b95a3", Accent: "#b8ff3c", Money: "#ffb547", Down: "#ff8a80"},
	"light": {BG: "#fafaf7", FG: "#0b0d10", Muted: "#5c6470", Accent: "#487f00", Money: "#9c5a00", Down: "#c0352b"},
}

// ThemeOf is a theme by name, dark for anything unknown.
func ThemeOf(name string) (string, Theme) {
	if t, ok := Themes[name]; ok {
		return name, t
	}
	return "dark", Themes["dark"]
}

// Spec is one card: which template, its colours and its words. What each
// word means is the template's (the spotlight: a big number, a label under
// it, a foot line, and the site's domain on top).
type Spec struct {
	Template string
	Theme    Theme
	// Accent is a #rrggbb colour; "" is the theme's own.
	Accent string
	Domain string
	Big    string
	Label  string
	Foot   string
	// Rows and Series are for the templates that draw data: a leaderboard's
	// lines (at most a handful) and a chart's points, any scale.
	Rows   []Item
	Series []float64
	// Change is the overview's big number against the period before ("+12%",
	// "" when there is nothing to compare), Dir its sign (1, -1 or 0); Stats
	// are the small numbers under the chart, at most MaxStats.
	Change string
	Dir    int
	Stats  []Stat
	// Icon is the site's own icon for the overview's tile (nil: its initial
	// in a tile instead).
	Icon image.Image
	// NoBrand leaves trckable's ghost and name off the card.
	NoBrand bool
}

// Stat is one small number: its value and what it is, as words. Flag is a
// country's two-letter code when the value is that country, "" otherwise;
// Icon is a site's icon when the value is that site (nil: none to draw).
type Stat struct {
	Value, Label, Flag string
	Icon               image.Image
}

// Item is one leaderboard line: what it is and its count, as words.
type Item struct {
	Name, Value string
	Share       float64 // 0–1: the bar's length against the top line
}

// ink is the accent in use: the one asked for when it can be seen on the
// card's background (a pale green on a light card cannot), else the theme's.
func (s Spec) ink() string {
	if validHex(s.Accent) && contrast(s.Accent, s.Theme.BG) >= 1.8 {
		return s.Accent
	}
	return s.Theme.Accent
}

// contrast is the ratio of the relative luminances of two #rrggbb colours (1 to 21).
func contrast(a, b string) float64 {
	la, lb := luminance(a), luminance(b)
	if la < lb {
		la, lb = lb, la
	}
	return (la + 0.05) / (lb + 0.05)
}

func luminance(hex string) float64 {
	c := rgb(hex)
	lin := func(v uint8) float64 {
		x := float64(v) / 255
		if x <= 0.03928 {
			return x / 12.92
		}
		return math.Pow((x+0.055)/1.055, 2.4)
	}
	return 0.2126*lin(c.R) + 0.7152*lin(c.G) + 0.0722*lin(c.B)
}

// Key identifies what a card draws, for a cache.
func (s Spec) Key() string {
	return fmt.Sprintf("%s|%v|%s|%s|%s|%s|%s|%v|%v|%s|%d|%s|%t", s.Template, s.Theme, s.ink(), s.Domain, s.Big, s.Label, s.Foot, s.Rows, s.Series, s.Change, s.Dir, statsKey(s.Stats), s.NoBrand)
}

// statsKey is the small numbers as text, an icon as a mark that there is one.
func statsKey(stats []Stat) string {
	var b strings.Builder
	for _, st := range stats {
		fmt.Fprintf(&b, "%s/%s/%s/%t;", st.Value, st.Label, st.Flag, st.Icon != nil)
	}
	return b.String()
}

// Span is a piece of a text line in one weight and colour.
type Span struct {
	Text string
	Bold bool
	Ink  string
}

// Run is one line of text: where it starts (or ends, with End), its size,
// and its spans side by side.
type Run struct {
	X, Y  int
	Px    float64
	End   bool
	Mid   bool // X is the middle of the line
	Spans []Span
}

// Template is a card design: its shapes as an SVG fragment (a text/template
// over Frame, no text in it) and its text lines.
type Template struct {
	Shapes *template.Template
	Runs   func(Spec) []Run
	// Data draws the shapes that come from the spec's numbers (bars, a
	// line), after Shapes; nil for a template without any. Its output is SVG
	// built from numbers only: no word of the spec goes into it.
	Data func(Spec, Frame) string
	// Pics are the pictures laid over the shapes (a site's icon, a flag);
	// nil for a template without any. Drawn in the PNG only.
	Pics func(Spec) []Pic
}

// Templates are the designs there are, by name. A feature adds its own at
// init; names are unique.
var Templates = map[string]Template{}

// Frame is what a template's shapes see: the spec's colours, and a stroke
// width in a scaled group (Stroke), which the rasteriser does not scale.
type Frame struct {
	BG, FG, Muted, Ink string
	// Icon: the site has its own icon, drawn bare, so no tinted tile behind it.
	Icon bool
	// NoBrand: no ghost.
	NoBrand bool
	raster  bool
}

// Stroke is width w inside a group scaled by k.
func (f Frame) Stroke(w, k float64) float64 {
	if f.raster {
		return w * k
	}
	return w
}

func (s Spec) frame(raster bool) Frame {
	return Frame{BG: s.Theme.BG, FG: s.Theme.FG, Muted: s.Theme.Muted, Ink: s.ink(), Icon: s.Icon != nil, NoBrand: s.NoBrand, raster: raster}
}

func (s Spec) template() (Template, error) {
	t, ok := Templates[s.Template]
	if !ok {
		return Template{}, fmt.Errorf("no card template %q", s.Template)
	}
	return t, nil
}

func (s Spec) shapes(raster bool) ([]byte, error) {
	t, err := s.template()
	if err != nil {
		return nil, err
	}
	var b bytes.Buffer
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">`, W, H, W, H)
	if err := t.Shapes.Execute(&b, s.frame(raster)); err != nil {
		return nil, err
	}
	if t.Data != nil {
		b.WriteString(t.Data(s, s.frame(raster)))
	}
	return b.Bytes(), nil
}

// SVG draws the card as SVG, text and all.
func (s Spec) SVG() ([]byte, error) {
	b, err := s.shapes(false)
	if err != nil {
		return nil, err
	}
	t, _ := s.template()
	out := bytes.NewBuffer(b)
	out.WriteString(`<g font-family="Geist, ui-sans-serif, system-ui, sans-serif">`)
	for _, r := range t.Runs(s) {
		anchor := ""
		if r.End {
			anchor = ` text-anchor="end"`
		} else if r.Mid {
			anchor = ` text-anchor="middle"`
		}
		fmt.Fprintf(out, `<text x="%d" y="%d" font-size="%s"%s>`, r.X, r.Y, strconv.FormatFloat(r.Px, 'f', -1, 64), anchor)
		for _, sp := range r.Spans {
			weight := "400"
			if sp.Bold {
				weight = "700"
			}
			fmt.Fprintf(out, `<tspan fill="%s" font-weight="%s">%s</tspan>`, html.EscapeString(sp.Ink), weight, html.EscapeString(sp.Text))
		}
		out.WriteString(`</text>`)
	}
	out.WriteString(`</g></svg>`)
	return out.Bytes(), nil
}

func validHex(s string) bool {
	if len(s) != 7 || s[0] != '#' {
		return false
	}
	_, err := strconv.ParseUint(s[1:], 16, 32)
	return err == nil
}
