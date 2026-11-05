package cards

import (
	"fmt"
	"strings"
	"text/template"
	"unicode"
)

// The overview: the site's own numbers are the picture. A tile with the
// site's initial and its domain on top, the period at the far end, the big
// number with its change, a smooth area of the period, up to three small
// numbers under it, and trckable small in the corner. Words: Domain, Foot
// (the period), Big, Label, Change and Dir, Series, Stats.

// MaxStats is how many small numbers sit under the chart.
const MaxStats = 3

const (
	tile       = 52
	tileY      = 70
	chartTop   = 352.0
	chartBase  = 486.0
	statValueY = 532
	statLabelY = 560
	statStep   = 250
)

func init() {
	shapes := template.Must(template.New("overview").Funcs(template.FuncMap{
		"ghost": func(f Frame, x, y, k float64) map[string]any { return map[string]any{"F": f, "X": x, "Y": y, "K": k} },
	}).Parse(`<defs><radialGradient id="glow" cx="1080" cy="0" r="620" gradientUnits="userSpaceOnUse">` +
		`<stop offset="0" stop-color="{{.Ink}}" stop-opacity="0.30"/><stop offset="1" stop-color="{{.Ink}}" stop-opacity="0"/></radialGradient></defs>` +
		`<rect width="1200" height="630" fill="{{.BG}}"/><rect width="1200" height="630" fill="url(#glow)"/>` +
		`<rect x="88" y="70" width="52" height="52" rx="15" fill="{{.Ink}}" fill-opacity="0.2"/>` +
		`{{template "ghost" ghost . 892 520 0.6}}`))
	template.Must(shapes.New("ghost").Parse(Ghost))
	Templates["overview"] = Template{Shapes: shapes, Runs: overviewRuns, Data: overviewChart}
}

// smooth is a line through the points as cubic curves (Catmull-Rom), never
// leaving the band between lo and hi, so a peak does not overshoot.
func smooth(xs, ys []float64, lo, hi float64) string {
	var b strings.Builder
	fmt.Fprintf(&b, "M%.1f %.1f", xs[0], ys[0])
	for i := 0; i < len(xs)-1; i++ {
		at := func(k int) int { return min(max(k, 0), len(xs)-1) }
		p0, p1, p2, p3 := at(i-1), i, i+1, at(i+2)
		c1y := min(max(ys[p1]+(ys[p2]-ys[p0])/6, lo), hi)
		c2y := min(max(ys[p2]-(ys[p3]-ys[p1])/6, lo), hi)
		fmt.Fprintf(&b, "C%.1f %.1f %.1f %.1f %.1f %.1f", xs[p1]+(xs[p2]-xs[p0])/6, c1y, xs[p2]-(xs[p3]-xs[p1])/6, c2y, xs[p2], ys[p2])
	}
	return b.String()
}

// overviewChart is the series as a filled area with a line on it and a dot
// on its last point; a flat or empty one is a baseline, never a division by
// zero.
func overviewChart(s Spec, f Frame) string {
	pts := s.Series
	if len(pts) < 2 {
		pts = []float64{0, 0}
	}
	top := 0.0
	for _, v := range pts {
		top = max(top, v)
	}
	xs, ys := make([]float64, len(pts)), make([]float64, len(pts))
	step := float64(right-left) / float64(len(pts)-1)
	for i, v := range pts {
		xs[i], ys[i] = float64(left)+float64(i)*step, chartBase
		if top > 0 {
			ys[i] = chartBase - max(v, 0)/top*(chartBase-chartTop)
		}
	}
	d := smooth(xs, ys, chartTop, chartBase)
	n := len(xs) - 1
	return `<defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="` + f.Ink + `" stop-opacity="0.34"/><stop offset="1" stop-color="` + f.Ink + `" stop-opacity="0"/></linearGradient></defs>` +
		fmt.Sprintf(`<path d="%s L%d %.0f L%d %.0f Z" fill="url(#area)"/>`, d, right, chartBase, left, chartBase) +
		fmt.Sprintf(`<path d="%s" fill="none" stroke="%s" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`, d, f.Ink) +
		fmt.Sprintf(`<circle cx="%.1f" cy="%.1f" r="11" fill="%s" fill-opacity="0.25"/><circle cx="%.1f" cy="%.1f" r="6" fill="%s"/>`, xs[n], ys[n], f.Ink, xs[n], ys[n], f.Ink)
}

func overviewRuns(s Spec) []Run {
	big := 136.0
	switch n := len([]rune(s.Big)); {
	case n > 12:
		big = 84
	case n > 8:
		big = 108
	}
	initial := "?"
	for _, r := range s.Domain {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			initial = strings.ToUpper(string(r))
			break
		}
	}
	line := []Span{{Text: s.Label, Ink: s.Theme.Muted}}
	if s.Change != "" {
		ink := s.ink()
		if s.Dir < 0 {
			ink = s.Theme.Down
		}
		line = append(line, Span{Text: "   " + s.Change, Bold: true, Ink: ink})
	}
	runs := []Run{
		{X: left + tile/2, Y: tileY + 37, Px: 30, Mid: true, Spans: []Span{{Text: initial, Bold: true, Ink: s.ink()}}},
		{X: left + tile + 18, Y: tileY + 36, Px: 30, Spans: []Span{{Text: clip(s.Domain, 34), Ink: s.Theme.FG}}},
		{X: right, Y: tileY + 35, Px: 24, End: true, Spans: []Span{{Text: s.Foot, Ink: s.Theme.Muted}}},
		{X: left - 5, Y: 262, Px: big, Spans: []Span{{Text: s.Big, Bold: true, Ink: s.Theme.FG}}},
		{X: left, Y: 316, Px: 32, Spans: line},
		{X: right, Y: footY, Px: 28, End: true, Spans: []Span{{Text: "trck", Bold: true, Ink: s.Theme.FG}, {Text: "able.com", Ink: s.Theme.Muted}}},
	}
	for i, st := range s.Stats[:min(len(s.Stats), MaxStats)] {
		x := left + i*statStep
		runs = append(runs,
			Run{X: x, Y: statValueY, Px: 32, Spans: []Span{{Text: clip(st.Value, 16), Bold: true, Ink: s.Theme.FG}}},
			Run{X: x, Y: statLabelY, Px: 21, Spans: []Span{{Text: st.Label, Ink: s.Theme.Muted}}},
		)
	}
	return runs
}
