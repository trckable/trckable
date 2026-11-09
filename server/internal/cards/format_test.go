package cards

import (
	"bytes"
	"encoding/json"
	"image/png"
	"os"
	"strings"
	"testing"
)

// sample is a busy card for the template: long words, a comparison, three stats.
func sample(tpl, format, theme string) Spec {
	_, th := ThemeOf(theme)
	s := Spec{Template: tpl, Format: format, Theme: th, Domain: "a-very-long-domain-name.example.com", Big: "1,234,567", Label: "Visitors", Foot: "Oct 11 – Nov 9, 2026",
		Series: []float64{3, 8, 5, 9, 14, 11, 18}, Change: "+124%", Dir: 1,
		Stats: []Stat{{Value: "83%", Label: "Engaged visits"}, {Value: "2m 14s", Label: "Avg time"}, {Value: "United Kingdom", Label: "Top country", Flag: "gb"}}}
	if tpl == "leaderboard" {
		s.Label, s.Big = "Top pages", ""
		for _, n := range []string{"/", "/pricing/team/enterprise/with/a/very/long/path/that/goes/on", "/blog/how-we-built-it", "/docs", "/about"} {
			s.Rows = append(s.Rows, Item{Name: n, Value: "12,345", Share: 0.8})
		}
	}
	return s
}

// Every format draws a PNG of exactly its size, for every template and theme.
func TestPNGSizePerFormat(t *testing.T) {
	for _, f := range Formats {
		for tpl := range Templates {
			for _, theme := range []string{"dark", "light"} {
				b, err := sample(tpl, f.ID, theme).PNG()
				if err != nil {
					t.Fatalf("%s %s: %v", f.ID, tpl, err)
				}
				img, err := png.Decode(bytes.NewReader(b))
				if err != nil {
					t.Fatal(err)
				}
				if r := img.Bounds(); r.Dx() != f.W || r.Dy() != f.H {
					t.Errorf("%s %s %s: %v, want %d × %d", f.ID, tpl, theme, r, f.W, f.H)
				}
			}
		}
	}
}

// The layout fits: every line, measured in the real font, stays inside the
// card's margins, and no line sits below the foot of the card.
func TestLayoutFitsEveryFormat(t *testing.T) {
	for _, f := range Formats {
		for tpl, tp := range Templates {
			s := sample(tpl, f.ID, "dark")
			if tpl == "spotlight" {
				s.Big = "1,234,567,890"
			}
			for _, r := range tp.Runs(s) {
				w := 0.0
				var text strings.Builder
				for _, sp := range r.Spans {
					w += measure(sp.Bold, sp.Text, r.Px)
					text.WriteString(sp.Text)
				}
				x0, x1 := float64(r.X), float64(r.X)+w
				if r.End {
					x0, x1 = float64(r.X)-w, float64(r.X)
				} else if r.Mid {
					x0, x1 = float64(r.X)-w/2, float64(r.X)+w/2
				}
				if x0 < 0 || x1 > float64(f.W)-float64(f.W)/40 || r.Y < 0 || r.Y > f.H {
					t.Errorf("%s %s: %q spans %.0f–%.0f at y %d, outside %d × %d", f.ID, tpl, text.String(), x0, x1, r.Y, f.W, f.H)
				}
			}
		}
	}
}

// The big number never leaves the margins, however long it is.
func TestBigNumberFits(t *testing.T) {
	for _, f := range Formats {
		l := layoutFor(f)
		for _, big := range []string{"7", "12,345", "1,234,567", "1,234,567,890", "€1,234,567.89"} {
			for _, tpl := range []string{"overview", "spotlight"} {
				s := sample(tpl, f.ID, "dark")
				s.Big = big
				for _, r := range Templates[tpl].Runs(s) {
					if len(r.Spans) == 1 && r.Spans[0].Text == big && measure(true, big, r.Px) > float64(l.Right-l.Left)+1 {
						t.Errorf("%s %s: %q is %.0f wide in %d", f.ID, tpl, big, measure(true, big, r.Px), l.Right-l.Left)
					}
				}
			}
		}
	}
}

// An unknown format is the link preview; the keys of two formats differ.
func TestFormatOf(t *testing.T) {
	if FormatOf("nope").ID != "link" || FormatOf("").ID != "link" {
		t.Fatal("the default is the link preview")
	}
	if sample("overview", "square", "dark").Key() == sample("overview", "story", "dark").Key() {
		t.Fatal("two formats share a cache key")
	}
}

// The panel reads the same list: dashboard/src/features/share/formats.json.
func TestFormatsMatchThePanel(t *testing.T) {
	src, err := os.ReadFile("../../../dashboard/src/features/share/formats.json")
	if err != nil {
		t.Skip("the dashboard source is not next to the server here")
	}
	var got []struct {
		ID   string `json:"id"`
		W, H int
	}
	if err := json.Unmarshal(src, &got); err != nil || len(got) != len(Formats) {
		t.Fatalf("formats.json: %v (%d formats)", err, len(got))
	}
	for i, f := range Formats {
		if got[i].ID != f.ID || got[i].W != f.W || got[i].H != f.H {
			t.Errorf("formats.json has %+v; the server draws %+v", got[i], f)
		}
	}
}

// The Overview pictures with nothing to show (no stats, an empty series) still draw, at every size.
func TestOverviewPicturesWithNoData(t *testing.T) {
	for _, f := range Formats {
		for _, tpl := range []string{"numbers", "grid"} {
			s := sample(tpl, f.ID, "light")
			s.Stats, s.Series, s.Change, s.Dir = nil, nil, "", 0
			if _, err := s.PNG(); err != nil {
				t.Errorf("%s %s: %v", f.ID, tpl, err)
			}
			if got := len(Templates[tpl].Runs(s)); got == 0 {
				t.Errorf("%s %s: no text at all", f.ID, tpl)
			}
		}
	}
}

// The numbers and the grid close the gap a missing number would leave: the
// cards share the whole row (or the whole grid), whatever their count, and
// no picture ever says a dash.
func TestPicturesCloseTheGap(t *testing.T) {
	for _, f := range Formats {
		l := layoutFor(f)
		stats := func(n int) []Stat {
			out := make([]Stat, n)
			for i := range out {
				out[i] = Stat{Value: "1,234", Label: "Visitors"}
			}
			return out
		}
		for n := 1; n <= MaxStats; n++ {
			s := sample("numbers", f.ID, "dark")
			s.Stats = stats(n)
			bs := numberBoxes(s)
			if len(bs) != n || bs[0].x != l.Left || bs[n-1].x+bs[n-1].w < l.Right-n {
				t.Errorf("%s numbers %d: %+v", f.ID, n, bs)
			}
		}
		for n := 1; n <= MaxGrid; n++ {
			s := sample("grid", f.ID, "dark")
			s.Stats = stats(n)
			bs := gridBoxes(s)
			bottom, right := 0, 0
			for _, b := range bs {
				bottom, right = max(bottom, b.y+b.h), max(right, b.x+b.w)
			}
			if len(bs) != n || right < l.Right-2 || bottom < l.GridTop+2*l.GridH+l.GridGap-2 {
				t.Errorf("%s grid %d: %+v", f.ID, n, bs)
			}
			for _, r := range Templates["grid"].Runs(s) {
				for _, sp := range r.Spans {
					if sp.Text == "–" {
						t.Errorf("%s grid %d: a dash", f.ID, n)
					}
				}
			}
		}
	}
}

// Every background, with or without the site's name and date, draws at every size and differs from the others.
func TestBackgroundsAndHiddenParts(t *testing.T) {
	for _, f := range Formats {
		for _, tpl := range []string{"overview", "numbers", "grid", "leaderboard", "spotlight"} {
			seen := map[string]bool{}
			for _, bg := range append([]string{""}, Backgrounds...) {
				s := sample(tpl, f.ID, "dark")
				s.Bg = bg
				if _, err := s.PNG(); err != nil {
					t.Fatalf("%s %s %q: %v", f.ID, tpl, bg, err)
				}
				seen[s.Key()] = true
			}
			if len(seen) != len(Backgrounds) { // "" is the gradient
				t.Errorf("%s %s: %d distinct keys, want %d", f.ID, tpl, len(seen), len(Backgrounds))
			}
			s := sample(tpl, f.ID, "light")
			s.Domain, s.Foot = "", ""
			if _, err := s.PNG(); err != nil {
				t.Errorf("%s %s without name and date: %v", f.ID, tpl, err)
			}
			for _, r := range Templates[tpl].Runs(s) {
				for _, sp := range r.Spans {
					if sp.Text == "?" {
						t.Errorf("%s %s: an initial without a name", f.ID, tpl)
					}
				}
			}
		}
	}
}

// The story fills its height: the numbers stand one under the other and the lowest content reaches the foot.
func TestStoryFillsItsHeight(t *testing.T) {
	l := layoutFor(FormatOf("story"))
	for n := 1; n <= MaxStats; n++ {
		s := sample("numbers", "story", "dark")
		s.Stats = s.Stats[:n]
		bs := numberBoxes(s)
		if len(bs) != n || bs[0].w != l.Right-l.Left {
			t.Fatalf("%d cards: %+v", n, bs)
		}
	}
	s := sample("numbers", "story", "dark")
	bs := numberBoxes(s)
	if bottom := bs[len(bs)-1].y + bs[len(bs)-1].h; bottom < l.H*85/100 {
		t.Errorf("numbers end at %d of %d", bottom, l.H)
	}
	g := gridBoxes(sample("grid", "story", "dark"))
	if bottom := g[len(g)-1].y + g[len(g)-1].h; bottom < l.H*75/100 {
		t.Errorf("grid ends at %d of %d", bottom, l.H)
	}
	if bottom := l.RowTop + 4*l.RowStep + l.RowH; bottom < l.H*85/100 {
		t.Errorf("rows end at %d of %d", bottom, l.H)
	}
	if l.StatLabelY < l.H*80/100 {
		t.Errorf("stats at %d of %d", l.StatLabelY, l.H)
	}
}
