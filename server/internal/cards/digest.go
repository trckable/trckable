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

// The Search Console mark: a ring of four arcs in Google's own colours, with the bar of a "G" on the right. A brand
// mark keeps its colours, so these four are the one exception to drawing with the card's theme; the pill and the
// check use the theme's surface, text and "up" colours. Angles run clockwise from three o'clock, in degrees.
var badgeArcs = []struct {
	from, to float64
	color    string
}{{320, 395, "#4285f4"}, {215, 320, "#ea4335"}, {125, 215, "#fbbc04"}, {35, 125, "#34a853"}}

// badgeBox is the pill's size: about 50px at the link preview's width, wide enough for the mark and the check.
func badgeBox(l Layout) (w, h float64) {
	h = float64(l.n(50))
	return h * 2.05, h
}

// badgeWidth is the room the badge takes at the right of the domain's line.
func badgeWidth(s Spec) float64 {
	if !s.Badge {
		return 0
	}
	w, _ := badgeBox(s.layout())
	return w
}

// arcPoints is the ring's arc from one angle to the other, as a line through points (the rasteriser draws lines).
func arcPoints(cx, cy, r, from, to float64) string {
	var b strings.Builder
	steps := int((to-from)/5) + 1
	for i := 0; i <= steps; i++ {
		a := (from + (to-from)*float64(i)/float64(steps)) * math.Pi / 180
		cmd := "L"
		if i == 0 {
			cmd = "M"
		}
		fmt.Fprintf(&b, "%s%.1f %.1f", cmd, cx+r*math.Cos(a), cy+r*math.Sin(a))
	}
	return b.String()
}

// badgeCheck draws the badge: a solid pill in the card's surface with a soft border, the mark, then a green check. Numbers only.
func badgeCheck(s Spec, f Frame) string {
	if !s.Badge {
		return ""
	}
	l := f.L
	w, h := badgeBox(l)
	x, y := float64(l.Right)-w, float64(l.DomainY)-l.px(28)*0.35-h/2
	cy, sw := y+h/2, h*0.1
	var b strings.Builder
	fmt.Fprintf(&b, `<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s" stroke="%s" stroke-opacity="0.22" stroke-width="%.1f"/>`, x, y, w, h, h/2, f.BG, f.FG, f.Stroke(1.5, l.K))
	cx, r := x+h*0.62, h*0.24
	for _, a := range badgeArcs {
		fmt.Fprintf(&b, `<path d="%s" fill="none" stroke="%s" stroke-width="%.1f"/>`, arcPoints(cx, cy, r, a.from, a.to), a.color, f.Stroke(sw, 1))
	}
	fmt.Fprintf(&b, `<path d="M%.1f %.1fL%.1f %.1f" fill="none" stroke="%s" stroke-width="%.1f"/>`, cx, cy, cx+r+sw/2, cy, badgeArcs[0].color, f.Stroke(sw, 1))
	kx := x + w - h*0.62
	fmt.Fprintf(&b, `<path d="M%.1f %.1fL%.1f %.1fL%.1f %.1f" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" stroke-linejoin="round"/>`,
		kx-h*0.17, cy, kx-h*0.03, cy+h*0.14, kx+h*0.19, cy-h*0.14, s.Theme.Up, f.Stroke(h*0.1, 1))
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
	if len(p.cards) == 0 && len(p.rows) == 0 {
		return append(runs, emptyRun(s, p.emptyTop))
	}
	for i, c := range p.cards {
		runs = append(runs, inked(s, cellText(s.Stats[i], c, l, min(l.NumPx, float64(c.h)*0.4), c.y+c.h*54/100, c.y+c.h*86/100))...)
	}
	return append(runs, rowRuns(s, p.rows, p.rowTop, p.rowStep)...)
}
