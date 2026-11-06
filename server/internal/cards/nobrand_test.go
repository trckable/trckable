package cards

import (
	"bytes"
	"image/color"
	"image/png"
	"strings"
	"testing"
)

// inkIn counts the pixels of one colour in a box of the card's picture.
func inkIn(t *testing.T, s Spec, c color.RGBA, x0, y0, x1, y1 int) int {
	t.Helper()
	b, err := s.PNG()
	if err != nil {
		t.Fatal(err)
	}
	img, err := png.Decode(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for x := x0; x < x1; x++ {
		for y := y0; y < y1; y++ {
			if color.RGBAModel.Convert(img.At(x, y)).(color.RGBA) == c {
				n++
			}
		}
	}
	return n
}

// NoBrand takes the ghost and the name off the picture and the SVG, and
// nothing else: the ghost's spot is the background again.
func TestNoBrandRemovesTheMark(t *testing.T) {
	green := color.RGBA{0xb8, 0xff, 0x3c, 0xff}
	cases := []struct {
		s              Spec
		x0, y0, x1, y1 int
	}{
		{Spec{Template: "overview", Theme: Themes["dark"], Domain: "example.com", Big: "9", Label: "visitors", Series: []float64{1, 5, 3, 9}}, 892, 520, 932, 560},
		{Spec{Template: "spotlight", Theme: Themes["dark"], Domain: "example.com", Big: "9", Label: "visitors"}, 1032, 72, 1090, 140},
		{Spec{Template: "leaderboard", Theme: Themes["dark"], Domain: "example.com", Label: "Top pages", Big: "none"}, 900, 560, 1112, 600},
	}
	for _, c := range cases {
		name := c.s.Template
		if c.s.Template != "leaderboard" && inkIn(t, c.s, green, c.x0, c.y0, c.x1, c.y1) == 0 {
			t.Fatalf("%s: no ghost with the brand", name)
		}
		branded, _ := c.s.SVG()
		if !strings.Contains(string(branded), "trck") && c.s.Template != "spotlight" {
			t.Fatalf("%s: no name with the brand", name)
		}
		plain := c.s
		plain.NoBrand = true
		if n := inkIn(t, plain, green, c.x0, c.y0, c.x1, c.y1); n != 0 && c.s.Template != "leaderboard" {
			t.Fatalf("%s: %d ghost pixels left", name, n)
		}
		svg, _ := plain.SVG()
		if strings.Contains(string(svg), "trck") || strings.Contains(string(svg), logoGhost) {
			t.Fatalf("%s: the brand is still in the SVG", name)
		}
		if c.s.Key() == plain.Key() {
			t.Fatalf("%s: the cache key ignores NoBrand", name)
		}
	}
}
