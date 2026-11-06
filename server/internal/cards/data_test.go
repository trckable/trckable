package cards

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"slices"
	"strings"
	"testing"
)

// The data templates draw with data, without it, and with a flat line.
func TestDataTemplatesRender(t *testing.T) {
	_, th := ThemeOf("light")
	for _, s := range []Spec{
		{Template: "leaderboard", Theme: th, Domain: "example.com", Label: "Top pages", Foot: "Last 7 days",
			Rows: []Item{{Name: "/", Value: "1,200", Share: 1}, {Name: "/pricing", Value: "300", Share: 0.25}}},
		{Template: "leaderboard", Theme: th, Domain: "example.com", Label: "Top pages", Big: "No visits yet"},
		{Template: "overview", Theme: th, Domain: "example.com", Big: "1,200", Label: "visitors", Foot: "Last 7 days", Change: "+12%", Dir: 1, Series: []float64{1, 5, 3, 9},
			Stats: []Stat{{Value: "900", Label: "Engaged visits"}, {Value: "2m 10s", Label: "Avg time"}, {Value: "Germany", Label: "Top country", Flag: "DE"}}},
		{Template: "overview", Theme: th, Domain: "example.com", Big: "0", Label: "visitors", Change: "-5%", Dir: -1, Series: []float64{0, 0, 0}},
		{Template: "overview", Theme: th, Domain: "example.com", Big: "0", Label: "visitors"},
		{Template: "overview", Theme: Themes["dark"], Domain: "example.com", Big: "7", Label: "visitors", Series: []float64{2, 2}},
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

// The overview's chart has no edge: its line fades at both sides, and there is no end dot.
func TestOverviewChartFades(t *testing.T) {
	s := Spec{Template: "overview", Theme: Themes["dark"], Series: []float64{1, 5, 3, 9}}
	svg, err := s.SVG()
	if err != nil || strings.Contains(string(svg), `r="11"`) || !strings.Contains(string(svg), `stroke="url(#edge)"`) {
		t.Fatalf("chart: %v", err)
	}
}

// The site's icon fills the overview's tile and the top country gets its
// flag; with neither, the tile keeps the initial and the name stands alone.
func TestOverviewIconAndFlag(t *testing.T) {
	_, th := ThemeOf("dark")
	icon := image.NewRGBA(image.Rect(0, 0, 16, 16))
	draw.Draw(icon, icon.Bounds(), &image.Uniform{color.RGBA{0, 200, 0, 255}}, image.Point{}, draw.Src)
	s := Spec{Template: "overview", Theme: th, Domain: "example.com", Big: "1,200", Label: "visitors", Series: []float64{1, 5, 3, 9},
		Stats: []Stat{{Value: "900", Label: "Engaged visits"}, {Value: "2m 10s", Label: "Avg time"}, {Value: "Germany", Label: "Top country", Flag: "DE"}}, Icon: icon}
	at := func(s Spec, x, y int) color.RGBA {
		b, err := s.PNG()
		if err != nil {
			t.Fatal(err)
		}
		img, err := png.Decode(bytes.NewReader(b))
		if err != nil {
			t.Fatal(err)
		}
		return color.RGBAModel.Convert(img.At(x, y)).(color.RGBA)
	}
	// The middle of the tile, and the middle of the flag's red band.
	if c := at(s, left+tile/2, tileY+tile/2); c != (color.RGBA{0, 200, 0, 255}) {
		t.Fatalf("tile: %v", c)
	}
	if c := at(s, left+2*statStep+flagBoxW/2, statValueY-flagBoxH/2+2); c.R < 200 || c.G > 40 {
		t.Fatalf("flag: %v", c)
	}
	// Without them the tile is the translucent square, and where the flag was (its name gone too) is bare.
	s.Icon, s.Stats[2].Flag, s.Stats[2].Value = nil, "", ""
	if c := at(s, left+tile-4, tileY+tile/2); c == (color.RGBA{0, 200, 0, 255}) {
		t.Fatalf("the icon is still there: %v", c)
	}
	if c := at(s, left+2*statStep+flagBoxW/2, statValueY-flagBoxH/2+2); c.R > 100 {
		t.Fatalf("a flag with no flag: %v", c)
	}
}

func TestFlags(t *testing.T) {
	if f := Flag("de"); f == nil || f.Bounds().Dx() != flagW || f.Bounds().Dy() != flagH {
		t.Fatalf("de: %v", f)
	}
	for _, code := range []string{"", "ZZ", "XYZ"} {
		if Flag(code) != nil {
			t.Errorf("%q has no flag", code)
		}
	}
}

// Icons come as PNG, or in an .ico file as a PNG or a bitmap; anything else is no icon.
func TestDecodeIcon(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 4, 4))
	draw.Draw(src, src.Bounds(), &image.Uniform{color.NRGBA{200, 0, 0, 255}}, image.Point{}, draw.Src)
	var p bytes.Buffer
	_ = png.Encode(&p, src)
	if img := DecodeIcon(p.Bytes()); img == nil || img.Bounds().Dx() != 4 {
		t.Fatalf("png: %v", img)
	}
	entry := func(dir []byte, size, off int) []byte {
		e := []byte{4, 4, 0, 0, 1, 0, 32, 0}
		e = binary.LittleEndian.AppendUint32(e, uint32(size))                   //nolint:gosec // a test icon's few bytes
		return append(dir, binary.LittleEndian.AppendUint32(e, uint32(off))...) //nolint:gosec // as above
	}
	dir := []byte{0, 0, 1, 0, 1, 0}
	if img := DecodeIcon(append(entry(slices.Clone(dir), p.Len(), 22), p.Bytes()...)); img == nil {
		t.Fatal("ico with a png")
	}
	// A 4 × 4, 32-bit bitmap with its mask (the height counts both).
	dib := binary.LittleEndian.AppendUint32(nil, 40)
	dib = binary.LittleEndian.AppendUint32(dib, 4)
	dib = binary.LittleEndian.AppendUint32(dib, 8)
	dib = append(dib, 1, 0, 32, 0)
	dib = append(dib, make([]byte, 24)...)
	for range 16 {
		dib = append(dib, 0, 0, 200, 255) // BGRA
	}
	dib = append(dib, make([]byte, 16)...) // the mask
	img := DecodeIcon(append(entry(slices.Clone(dir), len(dib), 22), dib...))
	if img == nil {
		t.Fatal("ico with a bitmap")
	}
	if r, g, b, _ := img.At(1, 1).RGBA(); r>>8 < 190 || g != 0 || b != 0 {
		t.Fatalf("bitmap pixel: %d %d %d", r>>8, g, b)
	}
	for _, bad := range [][]byte{nil, []byte("<svg/>"), {0, 0, 1, 0, 1, 0, 4, 4}, append(entry(slices.Clone(dir), 5000, 22), 1, 2, 3)} {
		if DecodeIcon(bad) != nil {
			t.Errorf("%q is no icon", bad)
		}
	}
}

// A stat that is a site draws its icon in a square before the name, and the
// cache key tells a card with the icon from one without.
func TestOverviewStatIcon(t *testing.T) {
	_, th := ThemeOf("dark")
	icon := image.NewRGBA(image.Rect(0, 0, 16, 16))
	draw.Draw(icon, icon.Bounds(), &image.Uniform{color.RGBA{0, 0, 220, 255}}, image.Point{}, draw.Src)
	s := Spec{Template: "overview", Theme: th, Domain: "example.com", Big: "9", Label: "pageviews", Series: []float64{1, 5, 3, 9},
		Stats: []Stat{{Value: "/pricing", Label: "Top page"}, {Value: "news.example.org", Label: "Top source", Icon: icon}}}
	b, err := s.PNG()
	if err != nil {
		t.Fatal(err)
	}
	img, err := png.Decode(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	if c := color.RGBAModel.Convert(img.At(left+statStep+flagBoxH/2, statValueY-flagBoxH/2+2)).(color.RGBA); c.B < 200 || c.R > 40 {
		t.Fatalf("icon: %v", c)
	}
	bare := s
	bare.Stats = []Stat{s.Stats[0], {Value: "news.example.org", Label: "Top source"}}
	if s.Key() == bare.Key() {
		t.Fatal("the key ignores the icon")
	}
}

// A WebP icon is an icon (the server keeps them).
func TestDecodeIconWebP(t *testing.T) {
	b, _ := base64.StdEncoding.DecodeString("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==")
	if img := DecodeIcon(b); img == nil {
		t.Fatal("webp")
	}
}

// A long value is cut to its room, wide letters sooner than narrow ones, and a short one is left whole.
func TestFit(t *testing.T) {
	for _, c := range []struct {
		in   string
		room float64
		want string
	}{
		{"Germany", 222, "Germany"},
		{"United Kingdom", 222, "United Ki…"},
		{"/pricing/team/enterprise", 222, "/pricing/…"},
		{"MMMMMMMMMM", 222, "MMMMM…"},
		{"", 10, ""},
	} {
		if got := fit(c.in, c.room, statPx); got != c.want {
			t.Errorf("%q: %q, want %q", c.in, got, c.want)
		}
	}
	// A stat shrinks before it is cut: a long country fits whole and smaller.
	if text, px := fitStat("United Kingdom", markX-statGap-(left+2*statStep)-flagBoxW-flagGap); text != "United Kingdom" || px >= statPx || px < statMinPx {
		t.Errorf("United Kingdom: %q at %v", text, px)
	}
	if text, px := fitStat("59%", 176); text != "59%" || px != statPx {
		t.Errorf("59%%: %q at %v", text, px)
	}
}
