package cards

import (
	"bytes"
	"image/png"
	"strings"
	"testing"
)

// Both data templates draw with data, without it, and with a flat line.
func TestDataTemplatesRender(t *testing.T) {
	_, th := ThemeOf("light")
	for _, s := range []Spec{
		{Template: "leaderboard", Theme: th, Domain: "example.com", Label: "Top pages", Foot: "Last 7 days",
			Rows: []Item{{Name: "/", Value: "1,200", Share: 1}, {Name: "/pricing", Value: "300", Share: 0.25}}},
		{Template: "leaderboard", Theme: th, Domain: "example.com", Label: "Top pages", Big: "No visits yet"},
		{Template: "dashboard", Theme: th, Domain: "example.com", Big: "1,200", Label: "visitors", Series: []float64{1, 5, 3, 9}},
		{Template: "dashboard", Theme: th, Domain: "example.com", Big: "0", Label: "visitors", Series: []float64{0, 0, 0}},
		{Template: "dashboard", Theme: th, Domain: "example.com", Big: "0", Label: "visitors"},
	} {
		b, err := s.PNG()
		if err != nil {
			t.Fatalf("%s: %v", s.Template, err)
		}
		if _, err := png.Decode(bytes.NewReader(b)); err != nil {
			t.Fatalf("%s: %v", s.Template, err)
		}
		svg, err := s.SVG()
		if err != nil || strings.Contains(string(svg), "NaN") {
			t.Fatalf("%s: %v %s", s.Template, err, svg)
		}
	}
}

// A leaderboard shows five lines at most, and long names are clipped.
func TestLeaderboardClips(t *testing.T) {
	s := Spec{Template: "leaderboard", Theme: Themes["dark"]}
	for i := 0; i < 8; i++ {
		s.Rows = append(s.Rows, Item{Name: strings.Repeat("a", 80), Value: "1"})
	}
	runs := leaderRuns(s)
	if n := len(runs) - 4; n != 2*MaxRows {
		t.Fatalf("%d row runs", n)
	}
	if got := []rune(runs[4].Spans[0].Text); len(got) != 48 {
		t.Fatalf("not clipped: %d", len(got))
	}
}
