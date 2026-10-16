package mailkit

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const evil = `<b>"x"</b>`

// every is one of each block, with something hostile in each text.
func every() []Block {
	return []Block{
		Heading{Eyebrow: evil, Title: "shop.example " + evil, Sub: "15 Oct 2026", Link: "https://stats.example.com/a?b=1&c=2"},
		Paragraph{Lead: evil, Text: "line one\nline two"},
		Badge{Text: evil, Tone: Good, Dot: true},
		Hero{Tone: Celebrate, Picture: &Cheer, Confetti: true, Badge: &Badge{Text: "Live"}, Eyebrow: "Right now", Live: true, Headline: evil, Big: "10,000", Unit: "pageviews", Strong: "1.9×", Line: "usual", Next: "Next up"},
		Stats{Items: []Stat{{Label: "Visitors", Value: "4,512", Change: "up 13%", Trend: 1}, {Label: "Pageviews", Value: "10,301", Change: "down 5%", Trend: -1}, {Label: "Bounce", Value: "45%"}}},
		Spark{Caption: "Per day", Values: []int64{1, 5, 3}, Ticks: []string{"Mon", "Tue", "Wed"}, Peak: true},
		List{Title: "Top pages", Rows: []Bar{{Name: "/" + evil, Value: "2,000", N: 2000}, {Name: "/b", Value: "10", N: 10}}},
		Callout{Tone: Bad, Title: evil, Text: "down since 15 Oct"},
		Rows{Title: "What we checked", Rows: [][2]string{{"Top page", "/" + strings.Repeat("a", 60) + "<end>"}}},
		Progress{Label: "Next up: 25,000", Note: "40% of the way", Value: 10, Of: 25},
		Divider{},
		Quote{Mark: Mark{Letter: "Y", Color: "#ff6600"}, Source: "Hacker News", Meta: "by pg", Title: evil, Text: evil, URL: "javascript:alert(1)"},
		Code{Code: "331 983"},
		Button{Label: "Open " + evil, URL: "https://stats.example.com/x?a=1&b=2"},
		Button{Label: "Never", URL: "javascript:alert(1)"},
	}
}

func TestEveryBlockEscapesAndKeepsLinksSafe(t *testing.T) {
	m := Email{Title: evil, Preheader: evil, Blocks: every(), Foot: Foot{Note: evil, Links: []Link{{"Stop these alerts", "javascript:x"}, {"Alert settings", "https://stats.example.com/s?a=1&b=2"}}}}
	h := m.HTML()
	for _, bad := range []string{evil, "<end>", "javascript:", "\u200b", "<script", "<link", "@import", `src="http`} {
		if strings.Contains(h, bad) {
			t.Errorf("the HTML carries %q", bad)
		}
	}
	for _, want := range []string{
		"&lt;b&gt;&#34;x&#34;&lt;/b&gt;", "shop.&#8203;example", "15&#8203; Oct 2026", "line one<br>line two", "…",
		`href="https://stats.example.com/a?b=1&amp;c=2"`, `href="https://stats.example.com/x?a=1&amp;b=2"`, "Open &lt;b&gt;", "→", "v:roundrect",
		"cid:" + LogoCID, "cid:" + Cheer.CID, "&#9650; up 13%", "&#9660; down 5%", "331983", "Alert settings", "trckable.com",
		"prefers-color-scheme:dark", "[data-ogsc] .tx", "max-width:600px", `width="600"`, "mso-hide:all", "x-apple-data-detectors", "format-detection",
	} {
		if !strings.Contains(h, want) {
			t.Errorf("the HTML misses %q", want)
		}
	}
	if strings.Contains(h, "Stop these alerts") || strings.Contains(h, "Never") {
		t.Error("a link that is not http(s) was drawn")
	}
}

// The plain text says what the HTML says, block by block, unescaped.
func TestTextIsTheTwin(t *testing.T) {
	m := Email{Blocks: every(), Foot: Foot{Links: []Link{{"Stop these alerts", "https://stats.example.com/u/a"}}}}
	txt := m.Text()
	for _, want := range []string{
		"shop.example " + evil, "15 Oct 2026", "line one\nline two", "10,000 pageviews", "1.9× usual", "Visitors: 4,512 (up 13%)", "Bounce: 45%",
		"Per day: Mon 1 · Tue 5 · Wed 3", "  /" + evil + " — 2,000", "What we checked\nTop page: /aaa", "Next up: 25,000 (40% of the way)",
		"Hacker News · by pg", "“" + evil + "”", "331 983", "Open " + evil + ": https://stats.example.com/x?a=1&b=2",
		"-- \nSent by trckable.\nStop these alerts: https://stats.example.com/u/a\ntrckable.com",
	} {
		if !strings.Contains(txt, want) {
			t.Errorf("the text misses %q:\n%s", want, txt)
		}
	}
	if strings.Contains(txt, "javascript:") || strings.Contains(txt, "Never") || strings.Contains(txt, "&#") || strings.Contains(txt, "\u200b") {
		t.Errorf("the text carries markup or an unsafe link:\n%s", txt)
	}
}

func TestPicturesTravelOnce(t *testing.T) {
	m := Email{Blocks: []Block{Hero{Picture: &Cheer}, Hero{Picture: &Cheer}}}
	imgs := m.Images()
	if len(imgs) != 2 || imgs[0].CID != LogoCID || imgs[1].CID != Cheer.CID || len(Cheer.Data) == 0 || len(Cheer.Data) > 15<<10 {
		t.Fatalf("%+v", imgs)
	}
	if n := len((Email{Brand: Brand{Name: "Acme"}}).Images()); n != 0 {
		t.Errorf("a client with only a name shows no picture: %d", n)
	}
	if imgs := (Email{Brand: Brand{Name: "Acme", Logo: []byte{1}, LogoType: "image/jpeg"}}).Images(); len(imgs) != 1 || imgs[0].Type != "image/jpeg" {
		t.Errorf("a client's logo: %+v", imgs)
	}
}

// A client's colour paints the button with ink that reads on it, and a
// hidden brand leaves trckable's name out.
func TestBrand(t *testing.T) {
	h := Email{Brand: Brand{Name: "Acme", Accent: "#ffee00", Hide: true}, Blocks: []Block{Button{Label: "Go", URL: "https://a.example"}}}.HTML()
	if !strings.Contains(h, "background:#ffee00") || !strings.Contains(h, "color:#111111") || strings.Contains(h, "trckable.com") || !strings.Contains(h, "Acme") {
		t.Error("a client's brand")
	}
	if Ink("#ffee00") != "#111111" || Ink("#112233") != "#ffffff" || Ink("nope") != "#ffffff" {
		t.Error("ink")
	}
	if h := (Email{Brand: Brand{Accent: "red"}}).HTML(); !strings.Contains(h, Lime) {
		t.Error("a colour that is not #rrggbb falls back to lime")
	}
}

func TestShortCutAndNumber(t *testing.T) {
	if got := Short("/blog/kualifikimi-i-mesuesve-2025-ëëë", 20); got != "…i-mesuesve-2025-ëëë" || len([]rune(got)) != 20 {
		t.Errorf("short %q", got)
	}
	if got := Cut("abcdef", 4); got != "abc…" || Cut("ab", 4) != "ab" {
		t.Errorf("cut %q", got)
	}
	if Number(1234567) != "1,234,567" || Number(-1200) != "-1,200" || Number(12) != "12" {
		t.Error("number")
	}
}

func TestEmptyBlocksDrawNothing(t *testing.T) {
	for _, b := range []Block{Spark{}, List{}, Rows{}, Progress{}, Button{Label: "x"}} {
		var p page
		b.html(&p)
		if p.Len() != 0 || b.text() != "" {
			t.Errorf("%T drew %q / %q", b, p.String(), b.text())
		}
	}
}

func TestWritePreview(t *testing.T) {
	dir := t.TempDir()
	m := Email{Blocks: []Block{Hero{Picture: &Cheer, Big: "1"}}}
	if err := WritePreview(dir, []Page{{Name: "one", Subject: "S <1>", HTML: m.HTML(), Text: m.Text(), Images: m.Images()}}); err != nil {
		t.Fatal(err)
	}
	one, _ := os.ReadFile(filepath.Join(dir, "one.html"))
	index, _ := os.ReadFile(filepath.Join(dir, "index.html"))
	text, _ := os.ReadFile(filepath.Join(dir, "one.txt"))
	if strings.Contains(string(one), "cid:") || !strings.Contains(string(one), "data:image/png;base64,") {
		t.Error("the pictures are not inlined")
	}
	if !strings.Contains(string(index), "srcdoc=") || !strings.Contains(string(index), "S &lt;1&gt;") || !strings.Contains(string(text), "trckable.com") {
		t.Error("the gallery")
	}
}
