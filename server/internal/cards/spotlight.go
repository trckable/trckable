package cards

import "text/template"

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

// Mark is trckable's name, bottom right: bold "trck", plain "able".
func Mark(s Spec) Run {
	return Run{X: padRight, Y: footY, Px: 32, End: true, Spans: []Span{{Text: "trck", Bold: true, Ink: s.Theme.FG}, {Text: "able", Ink: s.Theme.Muted}}}
}

// The spotlight: one big number and what it is, the ghost beside it, a faint
// line rising behind. Words: Domain on top, Big, Label, Foot.
func init() {
	shapes := template.Must(template.New("spotlight").Funcs(template.FuncMap{
		"ghost": func(f Frame, x, y, k float64) map[string]any { return map[string]any{"F": f, "X": x, "Y": y, "K": k} },
	}).Parse(`<rect width="1200" height="630" fill="{{.BG}}"/>` +
		`<path d="M88 488l200-44 150 28 200-64 150 22 324-112" fill="none" stroke="{{.Ink}}" stroke-opacity="0.16" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` +
		`{{template "ghost" ghost . 988 80 1.9}}`))
	template.Must(shapes.New("ghost").Parse(Ghost))
	Templates["spotlight"] = Template{Shapes: shapes, Runs: spotlightRuns}
}

func spotlightRuns(s Spec) []Run {
	big := 152.0
	switch n := len([]rune(s.Big)); {
	case n > 10:
		big = 96
	case n > 7:
		big = 120
	}
	runs := []Run{
		{X: padLeft, Y: domainY, Px: 28, Spans: []Span{{Text: s.Domain, Ink: s.Theme.Muted}}},
		{X: padLeft - 4, Y: 316, Px: big, Spans: []Span{{Text: s.Big, Bold: true, Ink: s.ink()}}},
		{X: padLeft, Y: footY, Px: 26, Spans: []Span{{Text: s.Foot, Ink: s.Theme.Muted}}},
		Mark(s),
	}
	if s.Label != "" {
		runs = append(runs, Run{X: padLeft, Y: 380, Px: 40, Spans: []Span{{Text: s.Label, Ink: s.Theme.FG}}})
	}
	return runs
}
