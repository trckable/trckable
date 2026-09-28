package cards

import (
	"bytes"
	"image/color"
	"image/png"
	"os"
	"regexp"
	"strings"
	"testing"
)

func spec(theme string) Spec {
	_, th := ThemeOf(theme)
	return Spec{Template: "spotlight", Theme: th, Domain: "example.com", Big: "10,000", Label: "visitors", Foot: "Sep 21, 2026"}
}

// The PNG is a real 1200 × 630 picture in the theme's colours, with the
// text set on it.
func TestPNGRenders(t *testing.T) {
	for _, theme := range []string{"dark", "light"} {
		s := spec(theme)
		b, err := s.PNG()
		if err != nil {
			t.Fatal(err)
		}
		img, err := png.Decode(bytes.NewReader(b))
		if err != nil {
			t.Fatal(err)
		}
		if r := img.Bounds(); r.Dx() != W || r.Dy() != H {
			t.Fatalf("%s: %v", theme, r)
		}
		bg := rgb(s.Theme.BG)
		if color.RGBAModel.Convert(img.At(5, 5)).(color.RGBA) != bg {
			t.Fatalf("%s: the corner is not the background", theme)
		}
		// Somewhere in the big number's box, the accent was drawn.
		ink, found := rgb(s.ink()), false
		for x := 80; x < 600 && !found; x++ {
			for y := 200; y < 330 && !found; y++ {
				found = color.RGBAModel.Convert(img.At(x, y)).(color.RGBA) == ink
			}
		}
		if !found {
			t.Fatalf("%s: no big number drawn", theme)
		}
	}
}

// Words are escaped in the SVG; a bad accent falls back to the theme's.
func TestSVGEscapes(t *testing.T) {
	s := spec("dark")
	s.Domain = `<script>alert(1)</script>`
	s.Accent = `red"/><script>`
	b, err := s.SVG()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "<script>") || !strings.Contains(string(b), Themes["dark"].Accent) {
		t.Fatalf("svg: %s", b)
	}
	s.Accent = "#ff00aa"
	if b, _ := s.SVG(); !strings.Contains(string(b), "#ff00aa") {
		t.Fatal("a good accent is used")
	}
	if _, err := (Spec{Template: "nope"}).PNG(); err == nil {
		t.Fatal("an unknown template draws nothing")
	}
}

// The card's ghost is the brand's ghost: one logo, never a drifting copy.
func TestCardLogoMatchesTheBrand(t *testing.T) {
	src, err := os.ReadFile("../../../dashboard/src/brand/logo.ts")
	if err != nil {
		t.Skip("the dashboard source is not next to the server here")
	}
	for name, want := range map[string]string{"GHOST": logoGhost, "LINE": logoLine} {
		m := regexp.MustCompile(`const ` + name + ` = '([^']+)'`).FindSubmatch(src)
		if m == nil || string(m[1]) != want {
			t.Fatalf("%s in brand/logo.ts is %q; the card draws %q", name, m, want)
		}
	}
}
