package cards

import (
	"fmt"
	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
	"image"
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

func init() {
	shapes := template.Must(template.New("overview").Funcs(template.FuncMap{
		"ghost": func(f Frame, x, y, k float64) map[string]any { return map[string]any{"F": f, "X": x, "Y": y, "K": k} },
	}).Parse(`<rect width="{{.L.W}}" height="{{.L.H}}" fill="{{.BG}}"/>` +
		`{{if not .Icon}}<rect x="{{.L.Left}}" y="{{.L.TileY}}" width="{{.L.Tile}}" height="{{.L.Tile}}" rx="{{.L.TileR}}" fill="{{.Ink}}" fill-opacity="0.2"/>{{end}}` +
		`{{if not .NoBrand}}{{template "ghost" ghost . .L.GhostX .L.GhostY .L.GhostK}}{{end}}`))
	template.Must(shapes.New("ghost").Parse(Ghost))
	Templates["overview"] = Template{Shapes: shapes, Runs: overviewRuns, Data: overviewChart, Pics: overviewPics}
}

// overviewPics are the site's icon in its tile, and the flag (or the icon) of
// a stat that is a country (or a site), each only when there is a picture to draw.
func overviewPics(s Spec) []Pic {
	l := s.layout()
	var pics []Pic
	if s.Icon != nil {
		pics = append(pics, Pic{Img: s.Icon, Box: image.Rect(l.Left, l.TileY, l.Left+l.Tile, l.TileY+l.Tile), Radius: l.n(12)})
	}
	for i, st := range s.Stats[:min(len(s.Stats), MaxStats)] {
		x := l.Left + i*l.StatStep
		if f := st.pic(); f != nil {
			pics = append(pics, Pic{Img: f, Box: image.Rect(x, l.StatValueY-l.flagH()+2, x+st.picW(l), l.StatValueY+2), Radius: l.n(4)})
		}
	}
	return pics
}

// pic is the picture beside a stat's value: its flag, else its icon.
func (st Stat) pic() image.Image {
	if f := Flag(st.Flag); f != nil {
		return f
	}
	return st.Icon
}

// picW is that picture's width: a flag is wider than tall, an icon square.
func (st Stat) picW(l Layout) int {
	if Flag(st.Flag) != nil {
		return l.n(flagBoxW)
	}
	return l.flagH()
}

// flagH is the height of a flag, and the side of an icon, on this format.
func (l Layout) flagH() int { return l.n(flagBoxH) }

// A flag beside a country's name, and the room the name leaves for it.
const (
	flagBoxW = 44
	flagBoxH = 33
	flagGap  = 12
	statGap  = 18 // the room a stat leaves between itself and the next
)

// The stat value's size, and the smallest it shrinks to before it is cut
// (at the link preview's scale; the layout's mark starts at MarkX).
const (
	statPx    = 42.0
	statMinPx = 26.0
)

// fitStat is a stat's value and the size it is drawn at: whole at the full
// size when it fits, else smaller until it fits, and cut only when even the
// smallest size is too wide (a long country such as "United Kingdom").
func fitStat(s string, room float64, k float64) (string, float64) {
	for px := statPx * k; px > statMinPx*k; px -= 2 {
		if wide(s, px) <= room {
			return s, px
		}
	}
	return fitWith(true, s, room, statMinPx*k), statMinPx * k
}

// wide is how wide s is in the bold font at size em; by letter class when the
// font cannot be read.
func wide(s string, em float64) float64 { return measure(true, s, em) }

// measure is the width of s at size em in the bold or the regular font.
func measure(bold bool, s string, em float64) float64 {
	if loadFonts() == nil {
		f := plainF
		if bold {
			f = boldF
		}
		if fc, err := opentype.NewFace(f, &opentype.FaceOptions{Size: em, DPI: 72, Hinting: font.HintingNone}); err == nil {
			return float64(font.MeasureString(fc, s)) / 64
		}
	}
	w := 0.0
	for _, r := range s {
		w += letterW(r, em)
	}
	return w
}

func letterW(r rune, em float64) float64 {
	switch {
	case strings.ContainsRune("il.,:;'|!/ ft1jI-", r):
		return 0.32 * em
	case strings.ContainsRune("mwMW@", r):
		return 0.84 * em
	case unicode.IsUpper(r):
		return 0.64 * em
	}
	return 0.56 * em
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
	l := f.L
	W := float64(l.W)
	chartTop, chartBase := l.ChartTop, l.ChartBase
	pts := s.Series
	if len(pts) < 2 {
		pts = []float64{0, 0}
	}
	top := 0.0
	for _, v := range pts {
		top = max(top, v)
	}
	xs, ys := make([]float64, len(pts)), make([]float64, len(pts))
	step := W / float64(len(pts)-1)
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
	band := fmt.Sprintf(`y="%.0f" height="%.0f"`, chartTop-14*l.K, chartBase-chartTop+16*l.K)
	var b strings.Builder
	fmt.Fprintf(&b, `<defs><linearGradient id="area" gradientUnits="userSpaceOnUse" x1="0" y1="%.0f" x2="0" y2="%.0f"><stop offset="0" stop-color="%s" stop-opacity="0.34"/><stop offset="1" stop-color="%s" stop-opacity="0"/></linearGradient>`, chartTop, chartBase, f.Ink, f.Ink)
	fmt.Fprintf(&b, `<linearGradient id="edge" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="%d" y2="0"><stop offset="0" stop-color="%s" stop-opacity="0"/><stop offset="%.2f" stop-color="%s"/><stop offset="%.2f" stop-color="%s"/><stop offset="1" stop-color="%s" stop-opacity="0"/></linearGradient>`, l.W, f.Ink, fadeEdge, f.Ink, 1-fadeEdge, f.Ink, f.Ink)
	// The background fading in over each side, eased like a smoothstep.
	for _, side := range []struct{ id, x1, x2 string }{{"left", "0", fmt.Sprint(edge)}, {"right", fmt.Sprint(l.W), fmt.Sprint(W - edge)}} {
		fmt.Fprintf(&b, `<linearGradient id="%s" gradientUnits="userSpaceOnUse" x1="%s" y1="0" x2="%s" y2="0">`, side.id, side.x1, side.x2)
		for _, t := range []float64{0, 0.25, 0.5, 0.75, 1} {
			fmt.Fprintf(&b, `<stop offset="%.2f" stop-color="%s" stop-opacity="%.3f"/>`, t, f.BG, 1-t*t*(3-2*t))
		}
		b.WriteString(`</linearGradient>`)
	}
	fmt.Fprintf(&b, `<radialGradient id="glow" cx="%.0f" cy="0" r="%.0f" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="%s" stop-opacity="0.30"/><stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient></defs>`, W*0.9, 620*l.K, f.Ink, f.Ink)
	fmt.Fprintf(&b, `<path d="%s L%d %.0f L0 %.0f Z" fill="url(#area)"/>`, d, l.W, chartBase, chartBase)
	fmt.Fprintf(&b, `<rect x="0" %s width="%.0f" fill="url(#left)"/><rect x="%.0f" %s width="%.0f" fill="url(#right)"/>`, band, edge, W-edge, band, edge)
	fmt.Fprintf(&b, `<rect width="%d" height="%d" fill="url(#glow)"/>`, l.W, l.H)
	fmt.Fprintf(&b, `<path d="%s" fill="none" stroke="url(#edge)" stroke-width="%.1f" stroke-linecap="round" stroke-linejoin="round"/>`, d, 5*l.K)
	b.WriteString(pills(s))
	return b.String()
}

// The pills: the period at the top, behind its dates, and the comparison
// after the label, green for a rise and red for a fall. Only boxes, sized to
// the words they hold; the words are the runs'.
const (
	pillPad  = 16
	periodPx = 24.0
	changePx = 28.0
)

// periodBox is where the period's pill sits and how wide it is: its text ends at right.
func periodBox(s Spec) (x, y, w, h int) {
	l := s.layout()
	w = int(measure(false, s.Foot, l.px(periodPx))) + 2*l.n(pillPad)
	return l.Right + l.n(pillPad) - w, l.TileY + l.n(35-30), w, l.n(44)
}

// changeBox is the comparison's pill, after the label on its line.
func changeBox(s Spec) (x, y, w, h int) {
	l := s.layout()
	w = int(measure(true, s.Change, l.px(changePx))) + 2*l.n(pillPad) + l.n(4)
	return l.Left + int(measure(false, s.Label, l.px(32))) + l.n(22), l.LabelY - l.n(34), w, l.n(46)
}

func pills(s Spec) string {
	var b strings.Builder
	if s.Foot != "" {
		x, y, w, h := periodBox(s)
		fmt.Fprintf(&b, `<rect x="%d" y="%d" width="%d" height="%d" rx="%d" fill="%s" fill-opacity="0.14"/>`, x, y, w, h, h/2, s.Theme.Muted)
	}
	if s.Change != "" && s.Dir != 0 {
		x, y, w, h := changeBox(s)
		fmt.Fprintf(&b, `<rect x="%d" y="%d" width="%d" height="%d" rx="%d" fill="%s" fill-opacity="0.18"/>`, x, y, w, h, h/2, pillInk(s))
	}
	return b.String()
}

// pillInk is the comparison's colour: green for a rise, red for a fall.
func pillInk(s Spec) string {
	if s.Dir < 0 {
		return s.Theme.Down
	}
	return s.Theme.Up
}

func overviewRuns(s Spec) []Run {
	l := s.layout()
	room := float64(l.Right - l.Left)
	big := 136.0
	switch n := len([]rune(s.Big)); {
	case n > 12:
		big = 84
	case n > 8:
		big = 108
	}
	big = fitPx(s.Big, big*l.K*l.Display, 24, room)
	initial := "?"
	for _, r := range s.Domain {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			initial = strings.ToUpper(string(r))
			break
		}
	}
	line := []Span{{Text: fitWith(false, s.Label, room-float64(l.n(160)), l.px(32)), Ink: s.Theme.Muted}}
	var runs []Run
	if s.Icon == nil {
		runs = append(runs, Run{X: l.Left + l.Tile/2, Y: l.TileY + l.n(37), Px: l.px(30), Mid: true, Spans: []Span{{Text: initial, Bold: true, Ink: s.ink()}}})
	}
	// The domain gets what the period's pill leaves it.
	domainRoom := room - float64(l.Tile+l.n(18)) - measure(false, s.Foot, l.px(periodPx)) - float64(l.n(48))
	runs = append(runs, []Run{
		{X: l.Left + l.Tile + l.n(18), Y: l.TileY + l.n(36), Px: l.px(30), Spans: []Span{{Text: fitWith(false, clip(s.Domain, 34), domainRoom, l.px(30)), Ink: s.Theme.FG}}},
		{X: l.Right, Y: l.TileY + l.n(35), Px: l.px(periodPx), End: true, Spans: []Span{{Text: s.Foot, Ink: s.Theme.Muted}}},
		{X: l.Left - l.n(5), Y: l.BigY, Px: big, Spans: []Span{{Text: s.Big, Bold: true, Ink: s.Theme.FG}}},
		{X: l.Left, Y: l.LabelY, Px: l.px(32), Spans: line},
	}...)
	if s.Change != "" && s.Dir != 0 {
		x, _, _, _ := changeBox(s)
		runs = append(runs, Run{X: x + l.n(pillPad) + l.n(2), Y: l.LabelY - 1, Px: l.px(changePx), Spans: []Span{{Text: s.Change, Bold: true, Ink: pillInk(s)}}})
	}
	if !s.NoBrand {
		runs = append(runs, Run{X: l.Right, Y: l.FootY, Px: l.px(28), End: true, Spans: []Span{{Text: "trck", Bold: true, Ink: s.Theme.FG}, {Text: "able.com", Ink: s.Theme.Muted}}})
	}
	shown := s.Stats[:min(len(s.Stats), MaxStats)]
	for i, st := range shown {
		x := l.Left + i*l.StatStep
		value, room := x, l.StatStep-l.n(statGap)
		if i == len(shown)-1 {
			// The last one may use the free space up to trckable's mark (or the edge).
			end := l.Right
			if !s.NoBrand && l.GhostY < float64(l.StatLabelY)+8 { // the mark shares the stats' line
				end = l.MarkX - l.n(statGap)
			}
			room = end - x
		}
		if st.pic() != nil {
			value += st.picW(l) + l.n(flagGap)
			room -= st.picW(l) + l.n(flagGap)
		}
		text, px := fitStat(st.Value, float64(room), l.K)
		runs = append(runs,
			Run{X: value, Y: l.StatValueY, Px: px, Spans: []Span{{Text: text, Bold: true, Ink: s.Theme.FG}}},
			Run{X: x, Y: l.StatLabelY, Px: l.px(24), Spans: []Span{{Text: fitWith(false, st.Label, float64(l.StatStep-l.n(statGap)), l.px(24)), Ink: s.Theme.Muted}}},
		)
	}
	return runs
}
