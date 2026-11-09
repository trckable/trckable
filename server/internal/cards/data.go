package cards

import (
	"fmt"
	"strings"
	"text/template"
)

// The leaderboard draws numbers as well as words: a title and up to five
// lines with bars. Words: Domain on top, Label (the title), Big (the line
// when it has none), Foot.

// MaxRows is how many lines a leaderboard shows.
const MaxRows = 5

func init() {
	plain := template.Must(template.New("plain").Parse(`<rect width="{{.L.W}}" height="{{.L.H}}" fill="{{.BG}}"/>`))
	Templates["leaderboard"] = Template{Shapes: plain, Runs: leaderRuns, Data: leaderBars}
}

// clip keeps a line inside its room: n runes, then an ellipsis.
func clip(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}

func rows(s Spec) []Item {
	if len(s.Rows) > MaxRows {
		return s.Rows[:MaxRows]
	}
	return s.Rows
}

func leaderBars(s Spec, f Frame) string {
	l := f.L
	var b strings.Builder
	for i, it := range rows(s) {
		share := min(max(it.Share, 0), 1)
		w := float64(l.n(24)) + share*float64(l.Right-l.Left-l.n(24)-l.BarGap)
		fmt.Fprintf(&b, `<rect x="%d" y="%d" width="%.1f" height="%d" rx="%d" fill="%s" fill-opacity="0.18"/>`, l.Left, l.RowTop+i*l.RowStep, w, l.RowH, l.RowH*12/44, f.Ink)
	}
	return b.String()
}

func leaderRuns(s Spec) []Run {
	l := s.layout()
	room := float64(l.Right - l.Left)
	runs := []Run{
		{X: l.Left, Y: l.DomainY, Px: l.px(28), Spans: []Span{{Text: fitWith(false, s.Domain, room, l.px(28)), Ink: s.Theme.Muted}}},
		{X: l.Left, Y: l.TitleY, Px: l.TitlePx, Spans: []Span{{Text: fitWith(true, s.Label, room, l.TitlePx), Bold: true, Ink: s.Theme.FG}}},
		{X: l.Left, Y: l.FootY, Px: l.px(26), Spans: []Span{{Text: fitWith(false, s.Foot, room-float64(l.n(260)), l.px(26)), Ink: s.Theme.Muted}}},
	}
	runs = append(runs, Marks(s)...)
	list := rows(s)
	if len(list) == 0 {
		return append(runs, Run{X: l.Left, Y: l.RowTop + l.RowH*32/44, Px: l.px(30), Spans: []Span{{Text: fitWith(false, s.Big, room, l.px(30)), Ink: s.Theme.Muted}}})
	}
	for i, it := range list {
		y := l.RowTop + i*l.RowStep + l.RowH*31/44
		valueW := measure(true, it.Value, l.RowPx)
		name := fitWith(false, it.Name, room-float64(l.n(20))-valueW-float64(l.n(24)), l.RowPx)
		runs = append(runs,
			Run{X: l.Left + l.n(20), Y: y, Px: l.RowPx, Spans: []Span{{Text: name, Ink: s.Theme.FG}}},
			Run{X: l.Right, Y: y, Px: l.RowPx, End: true, Spans: []Span{{Text: it.Value, Bold: true, Ink: s.Theme.FG}}},
		)
	}
	return runs
}
