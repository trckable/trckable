package cards

import (
	"fmt"
	"math"
	"strings"
	"text/template"
)

// The digest: a title, then up to four number cards in a row, then up to
// MaxDigestRows lines with bars, on the leaderboard's header. Any part may be
// missing: the rest takes its room and the block stands in the middle of the
// space the leaderboard's five lines would have. Words: Domain, Label (the
// title, a sentence is welcome), Foot, Stats (the cards), Rows (the lines),
// Big (the line when it has neither).

// MaxDigestRows is how many lines a digest shows beside its cards.
const MaxDigestRows = 3

func init() {
	plain := template.Must(template.New("digest").Parse(`<rect width="{{.L.W}}" height="{{.L.H}}" fill="{{.BG}}"/>`))
	Templates["digest"] = Template{Shapes: plain, Runs: digestRuns, Data: digestData, Glows: true}
}

// digestPlan is where the digest's parts stand on its format.
type digestPlan struct {
	title    []string
	titlePx  float64
	cards    []cardBox
	rows     []Item
	rowTop   int
	rowStep  int
	emptyTop int
}

// wrapWords breaks s into at most n lines that fit room at size em in the bold font; the last line ends in an ellipsis when it must.
func wrapWords(s string, room, em float64, n int) []string {
	var lines []string
	cur := ""
	words := strings.Fields(s)
	for i, w := range words {
		try := strings.TrimSpace(cur + " " + w)
		if measure(true, try, em) <= room || cur == "" {
			cur = try
			continue
		}
		if len(lines) == n-1 {
			cur = strings.Join(words[i-len(strings.Fields(cur)):], " ")
			break
		}
		lines = append(lines, cur)
		cur = w
	}
	return append(lines, fitWith(true, cur, room, em))
}

// digestRows are the lines the digest shows: as many as fit beside the cards, or the leaderboard's five without them.
func digestRows(s Spec) []Item {
	most := MaxDigestRows
	if len(s.Stats) == 0 {
		most = MaxRows
	}
	if len(s.Rows) > most {
		return s.Rows[:most]
	}
	return s.Rows
}

func digestPlanOf(s Spec) digestPlan {
	l := s.layout()
	room := float64(l.Right - l.Left)
	p := digestPlan{titlePx: l.TitlePx, rows: digestRows(s)}
	if l.W > l.H*6/5 {
		// A wide card has one line for its title, smaller when it must be.
		p.titlePx = fitPx(s.Label, l.TitlePx, l.TitlePx*0.62, room)
		p.title = []string{fitWith(true, s.Label, room, p.titlePx)}
	} else {
		p.title = wrapWords(s.Label, room, p.titlePx, 2)
	}
	last := l.TitleY + (len(p.title)-1)*int(p.titlePx*1.2)
	top := last + l.RowTop - l.TitleY
	avail := l.RowTop + 4*l.RowStep + l.RowH - top
	p.rowStep = l.RowStep
	nc, nr := min(len(s.Stats), MaxGrid), len(p.rows)
	rowsH := 0
	if nr > 0 {
		rowsH = (nr-1)*l.RowStep + l.RowH
	}
	between := l.GridGap * 3 / 2
	cardH := 0
	if nc > 0 {
		w := (l.Right - l.Left - (nc-1)*l.GridGap) / nc
		steps := 2
		if nr == 0 {
			steps = 3
		}
		cardH = min(steps*l.RowStep, w*9/10)
		if nr > 0 && cardH+between+rowsH > avail {
			cardH = max(avail-between-rowsH, l.n(84))
		}
	}
	block := cardH + rowsH
	if nc > 0 && nr > 0 {
		block += between
	}
	y := top + max(avail-block, 0)/2
	if nc > 0 {
		w := (l.Right - l.Left - (nc-1)*l.GridGap) / nc
		for i := 0; i < nc; i++ {
			p.cards = append(p.cards, cardBox{l.Left + i*(w+l.GridGap), y, w, cardH})
		}
		y += cardH + between
	}
	p.rowTop, p.emptyTop = y, top
	return p
}

func digestData(s Spec, f Frame) string {
	p := digestPlanOf(s)
	return glow(f) + boxes(p.cards, f.Ink, f.L.n(22)) + rowBars(p.rows, f, p.rowTop, p.rowStep) + badgeCheck(s, f)
}

// The badge: after the domain, the source's mark, "Verified" and a green check; the code below draws Search Console's
// mark, a provider's is in sources.go. The mark keeps Google's own colours (a brand mark does), the one exception to drawing with the card's
// theme; the capsule, the words and the check use the theme's surface, text and "up" colours. The mark is traced from
// Google's published logo: rising bars with capsule ends, the green one mid-height, the blue one the tallest and
// darker where they overlap, and a yellow lens with a short handle, red where it overlaps the green bar.
const (
	logoBlue, logoDark, logoGreen, logoYellow, logoRed = "#5383ec", "#3265cb", "#58a65c", "#f1bf42", "#d85140"
	// The mark is drawn in a box of 63 by 64.5 units, from (7, 6) in the tracing.
	logoW, logoH = 63.0, 64.5
)

// badgeGeom is where the badge's parts stand: the logo's top left and scale, the word's left and baseline, its size,
// and the check's circle. The badge sits on the domain's line, after the domain.
type badgeGeom struct {
	w, lx, ly, sc, tx, y1, px1, ccx, ccy, cd float64
}

func badgeGeomOf(s Spec) badgeGeom {
	l := s.layout()
	px := l.px(28)
	g := badgeGeom{px1: px, cd: float64(l.n(18)), y1: float64(l.DomainY)}
	mid := float64(l.DomainY) - px*0.35
	gap := float64(l.n(10))
	lw := float64(l.n(22)) * logoW / logoH
	g.sc = float64(l.n(22)) / logoH
	if s.Source != SourceSearch {
		lw, g.sc = float64(l.n(22)), float64(l.n(22))/markUnits
	}
	word := measure(false, s.Badge, px)
	g.w = lw + gap + word + gap*0.8 + g.cd
	room := float64(l.Right-l.Left) - g.w - float64(l.n(24))
	g.lx = float64(l.Left) + measure(false, fitWith(false, s.Domain, room, px), px) + float64(l.n(24))
	g.ly = mid - float64(l.n(22))/2 // the mark is 22 units tall, whichever source's
	g.tx = g.lx + lw + gap
	g.ccx, g.ccy = g.tx+word+gap*0.8+g.cd/2, mid
	return g
}

// bar is a vertical bar with capsule ends as a closed path: left, right, top and bottom, and the radii of its top and bottom corners.
func bar(x0, x1, top, bottom, rt, rb float64) string {
	return fmt.Sprintf("M%.2f %.2f", x0+rt, top) + fmt.Sprintf("L%.2f %.2f", x1-rt, top) + arcPoints(x1-rt, top+rt, rt, -90, 0, false) +
		fmt.Sprintf("L%.2f %.2f", x1, bottom-rb) + arcPoints(x1-rb, bottom-rb, rb, 0, 90, false) +
		fmt.Sprintf("L%.2f %.2f", x0+rb, bottom) + arcPoints(x0+rb, bottom-rb, rb, 90, 180, false) +
		fmt.Sprintf("L%.2f %.2f", x0, top+rt) + arcPoints(x0+rt, top+rt, rt, 180, 270, false) + "Z"
}

// scalePath moves a path of M, L and Z commands from the tracing's units to the card's: origin (7, 6) to (x, y), sc to the unit.
func scalePath(d string, x, y, sc float64) string {
	var b strings.Builder
	for i := 0; i < len(d); {
		c := d[i]
		i++
		b.WriteByte(c)
		if c == 'Z' {
			continue
		}
		j := i
		for j < len(d) && d[j] != 'M' && d[j] != 'L' && d[j] != 'Z' {
			j++
		}
		var px, py float64
		if _, err := fmt.Sscanf(d[i:j], "%f %f", &px, &py); err != nil {
			panic("cards: bad logo path: " + d[i:j]) // the path is a constant, so this is a programming error
		}
		fmt.Fprintf(&b, "%.2f %.2f", x+(px-7)*sc, y+(py-6)*sc)
		i = j
	}
	return b.String()
}

// logo draws the Search Console mark with its tracing's origin at (x, y) and sc pixels to the unit. The tracing's
// units are those of the crop it was made from (its bars span x 30 to 70, y 6 to 63).
func logo(b *strings.Builder, f Frame, x, y, sc float64) {
	pt := func(px, py float64) string { return fmt.Sprintf("%.2f %.2f", x+(px-7)*sc, y+(py-6)*sc) }
	scale := func(d string) string { return scalePath(d, x, y, sc) }
	fill := func(d, c string) { fmt.Fprintf(b, `<path d="%s" fill="%s"/>`, scale(d), c) }
	// The handle, a short stroke with round ends down and to the left.
	fmt.Fprintf(b, `<path d="M%s L%s" fill="none" stroke="%s" stroke-width="%.2f" stroke-linecap="round"/>`, pt(17.5, 58.5), pt(8.5, 67), logoYellow, 3.8*sc)
	fill(bar(30, 54, 23, 63, 12, 5), logoGreen)
	fill(bar(45.5, 70, 6, 63, 12.25, 8), logoBlue)
	// Where the green bar lies under the blue one: its part right of the blue bar's left edge.
	fill("M45.5 23.52"+arcPoints(42, 35, 12, -73, 0, false)+"L54 63L45.5 63Z", logoDark)
	fill(arcPoints(26, 51, 12, 0, 360, true)+"Z", logoYellow)
	// Where the lens lies over the green bar: the lens right of the bar's left edge, inside its rounded corner.
	fill("M30 39.7"+arcPoints(26, 51, 12, -70.5, 62.4, false)+arcPoints(35, 58, 5, 134, 180, false)+"Z", logoRed)
}

// badgeWidth is the room the badge takes on the domain's line.
func badgeWidth(s Spec) float64 {
	if !s.badged() {
		return 0
	}
	return badgeGeomOf(s).w
}

// arcPoints is an arc of a circle from one angle to the other, as a line through points (the rasteriser draws lines).
func arcPoints(cx, cy, r, from, to float64, move bool) string {
	var b strings.Builder
	steps := int((to-from)/2.5) + 1
	for i := 0; i <= steps; i++ {
		a := (from + (to-from)*float64(i)/float64(steps)) * math.Pi / 180
		cmd := "L"
		if i == 0 && move {
			cmd = "M"
		}
		fmt.Fprintf(&b, "%s%.2f %.2f", cmd, cx+r*math.Cos(a), cy+r*math.Sin(a))
	}
	return b.String()
}

// badgeCheck draws the badge's shapes: the logo and the check, a filled green circle with a tick in the card's
// background colour (which reads on both themes' greens). Numbers only.
func badgeCheck(s Spec, f Frame) string {
	if !s.badged() {
		return ""
	}
	g := badgeGeomOf(s)
	var b strings.Builder
	if s.Source == SourceSearch {
		logo(&b, f, g.lx, g.ly, g.sc)
	} else {
		b.WriteString(mark(s.Source, s, g.lx, g.ly, g.sc))
	}
	r := g.cd / 2
	fmt.Fprintf(&b, `<path d="%sZ" fill="%s"/>`, arcPoints(g.ccx, g.ccy, r, 0, 360, true), s.Theme.Up)
	fmt.Fprintf(&b, `<path d="M%.2f %.2fL%.2f %.2fL%.2f %.2f" fill="none" stroke="%s" stroke-width="%.2f" stroke-linecap="round" stroke-linejoin="round"/>`,
		g.ccx-r*0.42, g.ccy, g.ccx-r*0.1, g.ccy+r*0.32, g.ccx+r*0.45, g.ccy-r*0.3, s.Theme.BG, f.Stroke(r*0.24, 1))
	return b.String()
}

func digestRuns(s Spec) []Run {
	l := s.layout()
	p := digestPlanOf(s)
	room := float64(l.Right - l.Left)
	badge := badgeWidth(s)
	if badge > 0 {
		badge += float64(l.n(24))
	}
	runs := []Run{
		{X: l.Left, Y: l.DomainY, Px: l.px(28), Spans: []Span{{Text: fitWith(false, s.Domain, room-badge, l.px(28)), Ink: s.Theme.Muted}}},
		{X: l.Left, Y: l.FootY, Px: l.px(26), Spans: []Span{{Text: fitWith(false, s.Foot, room-float64(l.n(260)), l.px(26)), Ink: s.Theme.Muted}}},
	}
	for i, line := range p.title {
		runs = append(runs, Run{X: l.Left, Y: l.TitleY + i*int(p.titlePx*1.2), Px: p.titlePx, Spans: []Span{{Text: line, Bold: true, Ink: s.Theme.FG}}})
	}
	runs = append(runs, Marks(s)...)
	if s.badged() {
		g := badgeGeomOf(s)
		runs = append(runs, Run{X: int(g.tx), Y: int(g.y1), Px: g.px1, Spans: []Span{{Text: s.Badge, Ink: s.Theme.Muted}}})
	}
	if len(p.cards) == 0 && len(p.rows) == 0 {
		return append(runs, emptyRun(s, p.emptyTop))
	}
	for i, c := range p.cards {
		runs = append(runs, inked(s, cellText(s.Stats[i], c, l, min(l.NumPx, float64(c.h)*0.4), c.y+c.h*54/100, c.y+c.h*86/100))...)
	}
	return append(runs, rowRuns(s, p.rows, p.rowTop, p.rowStep)...)
}
