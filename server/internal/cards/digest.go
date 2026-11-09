package cards

import (
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
	return glow(f) + boxes(p.cards, f.Ink, f.L.n(22)) + rowBars(p.rows, f, p.rowTop, p.rowStep)
}

func digestRuns(s Spec) []Run {
	l := s.layout()
	p := digestPlanOf(s)
	room := float64(l.Right - l.Left)
	runs := []Run{
		{X: l.Left, Y: l.DomainY, Px: l.px(28), Spans: []Span{{Text: fitWith(false, s.Domain, room, l.px(28)), Ink: s.Theme.Muted}}},
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
