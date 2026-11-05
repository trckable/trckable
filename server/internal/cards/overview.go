package cards

import (
	"fmt"
	"strings"
	"text/template"
	"unicode"
)

// The overview: the site's own numbers are the picture. A tile with the
// site's initial and its domain on top, the period at the far end, the big
// number with its change, a smooth area of the period across the whole card, fading out at both sides, up to three small
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
	}).Parse(`<rect width="1200" height="630" fill="{{.BG}}"/>` +
		`<rect x="88" y="70" width="52" height="52" rx="15" fill="{{.Ink}}" fill-opacity="0.2"/>` +
		`{{template "ghost" ghost . 892 520 0.6}}`))
	template.Must(shapes.New("ghost").Parse(Ghost))
	Templates["overview"] = Template{Shapes: shapes, Runs: overviewRuns, Data: overviewChart}
}

// fadeEdge is how much of the card's width, at each side, the chart fades over.
const fadeEdge = 0.09

// curve is the points as a smooth line (Catmull-Rom curves, never leaving the
// band between lo and hi, so a peak does not overshoot), sampled every couple
// of pixels: x only ever grows along it.
func curve(xs, ys []float64, lo, hi float64) (px, py []float64) {
	px, py = []float64{xs[0]}, []float64{ys[0]}
	at := func(k int) int { return min(max(k, 0), len(xs)-1) }
	for i := 0; i < len(xs)-1; i++ {
		p0, p1, p2, p3 := at(i-1), i, i+1, at(i+2)
		ax, bx := xs[p1]+(xs[p2]-xs[p0])/6, xs[p2]-(xs[p3]-xs[p1])/6
		ay, by := min(max(ys[p1]+(ys[p2]-ys[p0])/6, lo), hi), min(max(ys[p2]-(ys[p3]-ys[p1])/6, lo), hi)
		n := max(int((xs[p2]-xs[p1])/2), 4)
		for k := 1; k <= n; k++ {
			t := float64(k) / float64(n)
			u := 1 - t
			px = append(px, u*u*u*xs[p1]+3*u*u*t*ax+3*u*t*t*bx+t*t*t*xs[p2])
			py = append(py, u*u*u*ys[p1]+3*u*u*t*ay+3*u*t*t*by+t*t*t*ys[p2])
		}
	}
	return px, py
}

// overviewChart is the series as an area with a line on it, across the whole
// card and fading out into it at both sides: no edge anywhere. A flat or empty
// series is a baseline, never a division by zero. The rasteriser has no masks,
// so the sides are covered with the card's own background fading in, and the
// glow (part of that background) is laid over it all afterwards.
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
	step := float64(W) / float64(len(pts)-1)
	for i, v := range pts {
		xs[i], ys[i] = float64(i)*step, chartBase
		if top > 0 {
			ys[i] = chartBase - max(v, 0)/top*(chartBase-chartTop)
		}
	}
	px, py := curve(xs, ys, chartTop, chartBase)
	var line strings.Builder
	for k := range px {
		cmd := "L"
		if k == 0 {
			cmd = "M"
		}
		fmt.Fprintf(&line, "%s%.1f %.1f", cmd, px[k], py[k])
	}
	d := line.String()
	edge := fadeEdge * W
	band := fmt.Sprintf(`y="%.0f" height="%.0f"`, chartTop-14, chartBase-chartTop+16)
	var b strings.Builder
	fmt.Fprintf(&b, `<defs><linearGradient id="area" gradientUnits="userSpaceOnUse" x1="0" y1="%.0f" x2="0" y2="%.0f"><stop offset="0" stop-color="%s" stop-opacity="0.34"/><stop offset="1" stop-color="%s" stop-opacity="0"/></linearGradient>`, chartTop, chartBase, f.Ink, f.Ink)
	fmt.Fprintf(&b, `<linearGradient id="edge" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="%d" y2="0"><stop offset="0" stop-color="%s" stop-opacity="0"/><stop offset="%.2f" stop-color="%s"/><stop offset="%.2f" stop-color="%s"/><stop offset="1" stop-color="%s" stop-opacity="0"/></linearGradient>`, W, f.Ink, fadeEdge, f.Ink, 1-fadeEdge, f.Ink, f.Ink)
	// The background fading in over each side, eased like a smoothstep.
	for _, side := range []struct{ id, x1, x2 string }{{"left", "0", fmt.Sprint(edge)}, {"right", fmt.Sprint(W), fmt.Sprint(W - edge)}} {
		fmt.Fprintf(&b, `<linearGradient id="%s" gradientUnits="userSpaceOnUse" x1="%s" y1="0" x2="%s" y2="0">`, side.id, side.x1, side.x2)
		for _, t := range []float64{0, 0.25, 0.5, 0.75, 1} {
			fmt.Fprintf(&b, `<stop offset="%.2f" stop-color="%s" stop-opacity="%.3f"/>`, t, f.BG, 1-t*t*(3-2*t))
		}
		b.WriteString(`</linearGradient>`)
	}
	fmt.Fprintf(&b, `<radialGradient id="glow" cx="1080" cy="0" r="620" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="%s" stop-opacity="0.30"/><stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient></defs>`, f.Ink, f.Ink)
	fmt.Fprintf(&b, `<path d="%s L%d %.0f L0 %.0f Z" fill="url(#area)"/>`, d, W, chartBase, chartBase)
	fmt.Fprintf(&b, `<rect x="0" %s width="%.0f" fill="url(#left)"/><rect x="%.0f" %s width="%.0f" fill="url(#right)"/>`, band, edge, W-edge, band, edge)
	fmt.Fprintf(&b, `<rect width="%d" height="%d" fill="url(#glow)"/>`, W, H)
	fmt.Fprintf(&b, `<path d="%s" fill="none" stroke="url(#edge)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`, d)
	return b.String()
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
