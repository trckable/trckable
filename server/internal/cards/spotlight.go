package cards

import (
	"fmt"
	"strings"
	"text/template"
)

// The ghost: the same paths as dashboard/src/brand/logo.ts, the one
// definition of the logo (TestCardLogoMatchesTheBrand keeps them equal).
const (
	logoGhost = "M12 30a20 20 0 0 1 40 0v22l-5-3.5-5 3.5-5-3.5-5 3.5-5-3.5-5 3.5-5-3.5-5 3.5z"
	logoLine  = "M5 47l12-6 9 4 12-9 9 3 12-12"
)

// Ghost is the logo's ghost with its line, as an SVG fragment over Frame,
// for any template: at (x, y), k times its 64-unit size.
const Ghost = `<g transform="translate({{.X}},{{.Y}}) scale({{.K}},{{.K}})">` +
	`<path d="` + logoGhost + `" fill="#b8ff3c"/>` +
	`<circle cx="25.5" cy="29" r="3.6" fill="#0b0d10"/><circle cx="38.5" cy="29" r="3.6" fill="#0b0d10"/>` +
	`<circle cx="26.6" cy="27.8" r="1.1" fill="#b8ff3c"/><circle cx="39.6" cy="27.8" r="1.1" fill="#b8ff3c"/>` +
	`<path d="` + logoLine + `" fill="none" stroke="{{.F.BG}}" stroke-width="{{.F.Stroke 7 .K}}" stroke-linecap="round" stroke-linejoin="round"/>` +
	`<path d="` + logoLine + `" fill="none" stroke="{{.F.FG}}" stroke-width="{{.F.Stroke 3.2 .K}}" stroke-linecap="round" stroke-linejoin="round"/>` +
	`</g>`

// Marks is trckable's name, bottom right: bold "trck", plain "able"; no
// line at all on a card without the brand.
func Marks(s Spec) []Run {
	if s.NoBrand {
		return nil
	}
	l := s.layout()
	return []Run{{X: l.Right, Y: l.FootY, Px: l.px(32), End: true, Spans: []Span{{Text: "trck", Bold: true, Ink: s.Theme.FG}, {Text: "able", Ink: s.Theme.Muted}}}}
}

// The spotlight: one big number in the card's colour and what it is, small
// under it, the ghost as a small mark in the corner, a faint line rising behind. Words: Domain on top, Big, Label, Foot.
func init() {
	shapes := template.Must(template.New("spotlight").Funcs(template.FuncMap{
		"ghost": func(f Frame, x, y, k float64) map[string]any { return map[string]any{"F": f, "X": x, "Y": y, "K": k} },
		"line":  spotLine,
	}).Parse(`<rect width="{{.L.W}}" height="{{.L.H}}" fill="{{.BG}}"/>` +
		`<path d="{{line .L}}" fill="none" stroke="{{.Ink}}" stroke-opacity="0.34" stroke-width="{{.L.LineW}}" stroke-linecap="round" stroke-linejoin="round"/>` +
		`{{if not .NoBrand}}{{template "ghost" ghost . .L.CornerGhostX .L.CornerGhostY .L.CornerGhostK}}{{end}}`))
	template.Must(shapes.New("ghost").Parse(Ghost))
	Templates["spotlight"] = Template{Shapes: shapes, Runs: spotlightRuns}
}

// spotLine is the faint rising line behind the number, from the left margin
// to the right one, between the layout's low and high.
func spotLine(l Layout) string {
	xs := []float64{0, 160, 280, 420, 540, 700, 1024}
	ys := []float64{500, 466, 484, 434, 446, 362, 270}
	var b strings.Builder
	for i := range xs {
		cmd := "L"
		if i == 0 {
			cmd = "M"
		}
		x := float64(l.Left) + xs[i]/1024*float64(l.Right-l.Left)
		y := l.LineLo - (500-ys[i])/230*(l.LineLo-l.LineHi)
		fmt.Fprintf(&b, "%s%.1f %.1f", cmd, x, y)
	}
	return b.String()
}

func spotlightRuns(s Spec) []Run {
	l := s.layout()
	room := float64(l.Right - l.Left)
	big := 152.0
	switch n := len([]rune(s.Big)); {
	case n > 16:
		big = 62
	case n > 10:
		big = 96
	case n > 7:
		big = 120
	}
	big = fitPx(s.Big, big*l.K*l.Display, 24, room)
	runs := []Run{
		{X: l.Left, Y: l.DomainY, Px: l.px(28), Spans: []Span{{Text: fitWith(false, s.Domain, room-float64(l.n(160)), l.px(28)), Ink: s.Theme.Muted}}},
		{X: l.Left - l.n(4), Y: l.SpotBigY, Px: big, Spans: []Span{{Text: s.Big, Bold: true, Ink: s.ink()}}},
		{X: l.Left, Y: l.FootY, Px: l.px(26), Spans: []Span{{Text: fitWith(false, s.Foot, room-float64(l.n(260)), l.px(26)), Ink: s.Theme.Muted}}},
	}
	runs = append(runs, Marks(s)...)
	if s.Label != "" {
		runs = append(runs, Run{X: l.Left, Y: l.SpotLabelY, Px: l.px(34), Spans: []Span{{Text: fitWith(false, s.Label, room, l.px(34)), Ink: s.Theme.Muted}}})
	}
	return runs
}
