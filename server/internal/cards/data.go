package cards

import (
	"fmt"
	"strings"
	"text/template"
)

// The two templates that draw numbers as well as words: a leaderboard (a
// title and up to five lines with bars) and a dashboard (a big number over
// its chart). Words: Domain on top, Label (the leaderboard's title, the
// dashboard's "visitors"), Big (the dashboard's number, the leaderboard's
// line when it has none), Foot.

// MaxRows is how many lines a leaderboard shows.
const MaxRows = 5

// The grid every template shares: 88 px in from the sides (about 7% of
// the width), the domain on its top line, the foot on the bottom margin.
const (
	padLeft  = 88
	padRight = W - 88
	domainY  = 128
	footY    = 556
)

const (
	rowTop  = 222
	rowStep = 58
	rowH    = 44
	left    = padLeft
	right   = padRight
	barGap  = 150 // the counts sit right of the bars, never on them
)

func init() {
	plain := template.Must(template.New("plain").Parse(`<rect width="1200" height="630" fill="{{.BG}}"/>`))
	Templates["leaderboard"] = Template{Shapes: plain, Runs: leaderRuns, Data: leaderBars}
	Templates["dashboard"] = Template{Shapes: plain, Runs: dashRuns, Data: dashChart}
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
	var b strings.Builder
	for i, it := range rows(s) {
		share := min(max(it.Share, 0), 1)
		w := 24 + share*float64(right-left-24-barGap)
		fmt.Fprintf(&b, `<rect x="%d" y="%d" width="%.1f" height="%d" rx="12" fill="%s" fill-opacity="0.18"/>`, left, rowTop+i*rowStep, w, rowH, f.Ink)
	}
	return b.String()
}

func leaderRuns(s Spec) []Run {
	runs := []Run{
		{X: left, Y: domainY, Px: 28, Spans: []Span{{Text: s.Domain, Ink: s.Theme.Muted}}},
		{X: left, Y: 184, Px: 40, Spans: []Span{{Text: s.Label, Bold: true, Ink: s.Theme.FG}}},
		{X: left, Y: footY, Px: 26, Spans: []Span{{Text: s.Foot, Ink: s.Theme.Muted}}},
		Mark(s),
	}
	list := rows(s)
	if len(list) == 0 {
		return append(runs, Run{X: left, Y: rowTop + 32, Px: 30, Spans: []Span{{Text: s.Big, Ink: s.Theme.Muted}}})
	}
	for i, it := range list {
		y := rowTop + i*rowStep + 31
		runs = append(runs,
			Run{X: left + 20, Y: y, Px: 26, Spans: []Span{{Text: clip(it.Name, 48), Ink: s.Theme.FG}}},
			Run{X: right, Y: y, Px: 26, End: true, Spans: []Span{{Text: it.Value, Bold: true, Ink: s.Theme.FG}}},
		)
	}
	return runs
}

const (
	chartTop    = 336.0
	chartBottom = 482.0
)

// dashChart is the series as a filled line; a flat or empty one is a
// baseline, never a division by zero.
func dashChart(s Spec, f Frame) string {
	pts := s.Series
	if len(pts) < 2 {
		pts = []float64{0, 0}
	}
	top := 0.0
	for _, v := range pts {
		top = max(top, v)
	}
	step := float64(right-left) / float64(len(pts)-1)
	var line strings.Builder
	for i, v := range pts {
		y := chartBottom
		if top > 0 {
			y = chartBottom - max(v, 0)/top*(chartBottom-chartTop)
		}
		cmd := "L"
		if i == 0 {
			cmd = "M"
		}
		fmt.Fprintf(&line, "%s%.1f %.1f", cmd, float64(left)+float64(i)*step, y)
	}
	d := line.String()
	return fmt.Sprintf(`<path d="%s L%d %.0f L%d %.0f Z" fill="%s" fill-opacity="0.14"/>`, d, right, chartBottom, left, chartBottom, f.Ink) +
		fmt.Sprintf(`<path d="%s" fill="none" stroke="%s" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`, d, f.Ink)
}

func dashRuns(s Spec) []Run {
	big := 88.0
	if len([]rune(s.Big)) > 10 {
		big = 68
	}
	return []Run{
		{X: left, Y: domainY, Px: 28, Spans: []Span{{Text: s.Domain, Ink: s.Theme.Muted}}},
		{X: left - 3, Y: 236, Px: big, Spans: []Span{{Text: s.Big, Bold: true, Ink: s.ink()}}},
		{X: left, Y: 284, Px: 30, Spans: []Span{{Text: s.Label, Ink: s.Theme.FG}}},
		{X: left, Y: footY, Px: 26, Spans: []Span{{Text: s.Foot, Ink: s.Theme.Muted}}},
		Mark(s),
	}
}
