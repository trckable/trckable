package cards

import (
	"fmt"
	"image"
	"strings"
	"text/template"
)

// Two more pictures of the Overview topic, drawn on the same layout engine:
//
//	numbers  the overview's head and its small numbers as three cards, no chart.
//	         Words as the overview's (Domain, Foot, Big, Label, Change and Dir, Stats).
//	grid     a title and four numbers, two by two. Words: Domain, Label (the
//	         title), Foot, Stats (up to MaxGrid).

// MaxGrid is how many numbers the grid holds.
const MaxGrid = 4

func init() {
	// The overview's shapes (tile, ghost) are the numbers picture's too.
	Templates["numbers"] = Template{Shapes: Templates["overview"].Shapes, Runs: numbersRuns, Data: numbersData, Pics: numbersPics, Glows: true}
	plain := template.Must(template.New("grid").Parse(`<rect width="{{.L.W}}" height="{{.L.H}}" fill="{{.BG}}"/>`))
	Templates["grid"] = Template{Shapes: plain, Runs: gridRuns, Data: gridData, Glows: true}
}

// cardBox is one rounded card of numbers, its left and top and size.
type cardBox struct{ x, y, w, h int }

// numberBoxes are the numbers picture's cards: as many as there are stats,
// sharing the row between them (a missing stat leaves no gap).
func numberBoxes(s Spec) []cardBox {
	l := s.layout()
	n := min(len(s.Stats), MaxStats)
	if n == 0 {
		return nil
	}
	gap := l.n(16)
	if l.NumStack {
		// A tall card (the story) has the cards one under the other, centred in the room they have.
		h := min((l.NumBottom-l.NumTop-(n-1)*gap)/n, l.NumH)
		top := l.NumTop + (l.NumBottom-l.NumTop-n*h-(n-1)*gap)/2
		boxes := make([]cardBox, n)
		for i := range boxes {
			boxes[i] = cardBox{l.Left, top + i*(h+gap), l.Right - l.Left, h}
		}
		return boxes
	}
	w := (l.Right - l.Left - (n-1)*gap) / n
	boxes := make([]cardBox, n)
	for i := range boxes {
		boxes[i] = cardBox{l.Left + i*(w+gap), l.NumTop, w, l.NumH}
	}
	return boxes
}

// gridBoxes are the grid's cells, two by two. The area is always filled: one
// number takes all of it, two share it in one row, three are two and a wide
// one, four are the four cells.
func gridBoxes(s Spec) []cardBox {
	l := s.layout()
	n := min(len(s.Stats), MaxGrid)
	rows := (n + 1) / 2
	if n == 0 {
		return nil
	}
	area := 2*l.GridH + l.GridGap
	h := (area - (rows-1)*l.GridGap) / rows
	w := (l.Right - l.Left - l.GridGap) / 2
	boxes := make([]cardBox, n)
	for i := range boxes {
		boxes[i] = cardBox{l.Left + i%2*(w+l.GridGap), l.GridTop + i/2*(h+l.GridGap), w, h}
		if n%2 == 1 && i == n-1 {
			boxes[i].x, boxes[i].w = l.Left, l.Right-l.Left
		}
	}
	return boxes
}

// glow is the soft light in the top right corner, over the background.
func glow(f Frame) string {
	l := f.L
	if f.Bg != "gradient" {
		return ""
	}
	return fmt.Sprintf(`<defs><radialGradient id="glow" cx="%.0f" cy="0" r="%.0f" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="%s" stop-opacity="0.30"/><stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient></defs><rect width="%d" height="%d" fill="url(#glow)"/>`, float64(l.W)*0.9, 620*l.K, f.Ink, f.Ink, l.W, l.H)
}

func boxes(bs []cardBox, ink string, radius int) string {
	var b strings.Builder
	for _, c := range bs {
		fmt.Fprintf(&b, `<rect x="%d" y="%d" width="%d" height="%d" rx="%d" fill="%s" fill-opacity="0.1"/>`, c.x, c.y, c.w, c.h, radius, ink)
	}
	return b.String()
}

func numbersData(s Spec, f Frame) string {
	return glow(f) + boxes(numberBoxes(s), f.Ink, f.L.n(22)) + pills(s)
}

func gridData(s Spec, f Frame) string {
	return glow(f) + boxes(gridBoxes(s), f.Ink, f.L.n(28))
}

// cellText is a card's number and its label: the number at the size that
// fits (a flag or an icon takes room at its left), the label cut to the room.
func cellText(st Stat, c cardBox, l Layout, px float64, valueY, labelY int) []Run {
	pad := l.n(26)
	x, room := c.x+pad, float64(c.w-2*pad)
	if st.pic() != nil {
		x += st.picW(l) + l.n(flagGap)
		room -= float64(st.picW(l) + l.n(flagGap))
	}
	px = fitPx(st.Value, px, 24, room)
	return []Run{
		{X: x, Y: valueY, Px: px, Spans: []Span{{Text: fitWith(true, st.Value, room, px), Bold: true}}},
		{X: c.x + pad, Y: labelY, Px: l.px(26), Spans: []Span{{Text: fitWith(false, st.Label, float64(c.w-2*pad), l.px(26))}}},
	}
}

// ink sets the colours of text runs: the value in the card's text colour, the label muted.
func inked(s Spec, runs []Run) []Run {
	for i := range runs {
		for j := range runs[i].Spans {
			if runs[i].Spans[j].Bold {
				runs[i].Spans[j].Ink = s.Theme.FG
			} else {
				runs[i].Spans[j].Ink = s.Theme.Muted
			}
		}
	}
	return runs
}

func numbersRuns(s Spec) []Run {
	l := s.layout()
	runs := overviewHead(s)
	for i, c := range numberBoxes(s) {
		runs = append(runs, inked(s, cellText(s.Stats[i], c, l, l.NumPx, c.y+c.h*58/100, c.y+c.h*84/100))...)
	}
	return runs
}

// numbersPics are the site's icon in its tile and the flag or icon of a card's value.
func numbersPics(s Spec) []Pic {
	l := s.layout()
	var pics []Pic
	if s.Icon != nil {
		pics = append(pics, Pic{Img: s.Icon, Box: image.Rect(l.Left, l.TileY, l.Left+l.Tile, l.TileY+l.Tile), Radius: l.n(12)})
	}
	for i, c := range numberBoxes(s) {
		if f := s.Stats[i].pic(); f != nil {
			h := l.flagH()
			y := c.y + c.h*58/100 - h*8/10
			pics = append(pics, Pic{Img: f, Box: image.Rect(c.x+l.n(26), y, c.x+l.n(26)+s.Stats[i].picW(l), y+h), Radius: l.n(4)})
		}
	}
	return pics
}

func gridRuns(s Spec) []Run {
	l := s.layout()
	room := float64(l.Right - l.Left)
	runs := []Run{
		{X: l.Left, Y: l.DomainY, Px: l.px(28), Spans: []Span{{Text: fitWith(false, s.Domain, room, l.px(28)), Ink: s.Theme.Muted}}},
		{X: l.Left, Y: l.TitleY, Px: l.TitlePx, Spans: []Span{{Text: fitWith(true, s.Label, room, l.TitlePx), Bold: true, Ink: s.Theme.FG}}},
		{X: l.Left, Y: l.FootY, Px: l.px(26), Spans: []Span{{Text: fitWith(false, s.Foot, room-float64(l.n(260)), l.px(26)), Ink: s.Theme.Muted}}},
	}
	runs = append(runs, Marks(s)...)
	for i, c := range gridBoxes(s) {
		runs = append(runs, inked(s, cellText(s.Stats[i], c, l, l.GridPx, c.y+c.h*58/100, c.y+c.h*84/100))...)
	}
	return runs
}
