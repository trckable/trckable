package cards

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	xdraw "golang.org/x/image/draw"
)

// CARDS_SHEET=<folder> saves a contact sheet of the report pictures with busy sample words: every one in the link
// preview (dark), and the first in each size.
func TestContactSheet(t *testing.T) {
	dir := os.Getenv("CARDS_SHEET")
	if dir == "" {
		t.Skip("CARDS_SHEET saves the sheet")
	}
	th := Themes["dark"]
	base := Spec{Template: "digest", Theme: th, Domain: "example.com", Foot: "Last 30 days"}
	pics := []Spec{
		{Label: "People rose 38%, mostly from news.ycombinator.com.", Stats: []Stat{{Value: "12,408", Label: "Visitors"}, {Value: "31,022", Label: "Pageviews"}, {Value: "2m 14s", Label: "Avg time"}, {Value: "41%", Label: "Bounce rate"}},
			Rows: []Item{{Name: "news.ycombinator.com", Value: "+3,120", Share: 1}, {Name: "Home page", Value: "+1,480", Share: 0.47}, {Name: "google.com", Value: "−640", Share: 0.2}}},
		{Label: "Found on Google", Stats: []Stat{{Value: "4,210", Label: "Clicks"}, {Value: "96,300", Label: "Impressions"}},
			Rows: []Item{{Name: "privacy friendly analytics", Value: "812", Share: 1}, {Name: "plausible alternative", Value: "540", Share: 0.66}, {Name: "trckable", Value: "233", Share: 0.29}}},
		{Label: "AI and mentions", Stats: []Stat{{Value: "318", Label: "Visits from AI assistants"}, {Value: "12", Label: "Mentions"}},
			Rows: []Item{{Name: "ChatGPT", Value: "201", Share: 1}, {Name: "Perplexity", Value: "74", Share: 0.37}, {Name: "Claude", Value: "43", Share: 0.21}}},
		{Label: "Top goals", Rows: []Item{{Name: "Signed up", Value: "412", Share: 1}, {Name: "Started trial", Value: "188", Share: 0.46}, {Name: "Booked a demo", Value: "64", Share: 0.16}, {Name: "Downloaded the guide", Value: "41", Share: 0.1}}},
		{Label: "Sales", Stats: []Stat{{Value: "$12,480", Label: "Revenue"}, {Value: "214", Label: "Orders"}}},
		{Template: "spotlight", Big: "10,000", Label: "visitors", Foot: "Sep 21, 2026"},
	}
	var out [][]byte
	for _, p := range pics {
		s := base
		s.Label, s.Stats, s.Rows = p.Label, p.Stats, p.Rows
		if p.Template != "" {
			s.Template, s.Big, s.Label, s.Foot = p.Template, p.Big, p.Label, p.Foot
		}
		b, err := s.PNG()
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, b)
	}
	sheet := image.NewRGBA(image.Rect(0, 0, 1700, 20+3*(330+20)+20+270))
	draw.Draw(sheet, sheet.Bounds(), image.NewUniform(color.RGBA{34, 34, 34, 255}), image.Point{}, draw.Src)
	put := func(b []byte, x, y, w int) {
		img, err := png.Decode(bytes.NewReader(b))
		if err != nil {
			t.Fatal(err)
		}
		h := img.Bounds().Dy() * w / img.Bounds().Dx()
		xdraw.CatmullRom.Scale(sheet, image.Rect(x, y, x+w, y+h), img, img.Bounds(), xdraw.Src, nil)
	}
	for i, b := range out {
		put(b, 20+i%2*620, 20+i/2*350, 600)
	}
	y := 20 + 3*350 + 10
	x := 20
	for _, f := range Formats {
		s := base
		s.Format = f.ID
		s.Label, s.Stats, s.Rows = pics[0].Label, pics[0].Stats, pics[0].Rows
		b, err := s.PNG()
		if err != nil {
			t.Fatal(err)
		}
		w := 270 * f.W / f.H
		put(b, x, y, w)
		x += w + 20
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, sheet); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "contact-sheet-3.png"), buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
}
