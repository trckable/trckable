package reports

import (
	"bytes"
	"compress/zlib"
	"fmt"
	"image"
	"image/color"
	_ "image/gif" // registers the formats a logo can be in
	_ "image/jpeg"
	_ "image/png"
	"strings"

	"github.com/trckable/trckable/server/internal/query"
)

// PDF writes the report as a one-page PDF with no dependency: PDF is a plain
// file format, and a page of text, boxes, bars and one picture needs about as
// much code as a library's setup would. Text is set in Helvetica, one of the
// fourteen fonts every reader has, so nothing is embedded; that limits it to
// Western European letters (WinAnsi), which covers English, German, French,
// Spanish, Italian and Dutch. A character outside them is drawn as "?".
func PDF(d Data) []byte {
	pg := &page{}
	w, accent := d.words(), parseColor(d.Accent())
	const left, right = 40.0, 555.0
	pg.rect(0, 0, 595, 8, accent)

	// The logo, or the name.
	y := 40.0
	img := newImage(d.Brand.Logo, d.Brand.LogoType)
	if img != nil {
		h := 30.0
		ww := h * float64(img.w) / float64(img.h)
		if ww > 160 {
			ww, h = 160, 160*float64(img.h)/float64(img.w)
		}
		pg.image(left, y, ww, h)
		y += h + 22
	} else {
		pg.text(left, y+14, bold, 15, accent, d.Brand.Name)
		y += 40
	}

	title := d.Site
	if d.Client != "" {
		title = d.Client
	}
	pg.text(left, y, regular, 8.5, grey, strings.ToUpper(d.Title()))
	y += 24
	pg.text(left, y, bold, 20, ink, fit(bold, 20, title, right-left))
	y += 16
	pg.text(left, y, regular, 10, grey, fit(regular, 10, d.Site+" · "+w.Range(d.From, d.To), right-left))
	y += 26

	if d.Empty() {
		pg.text(left, y, regular, 11, ink, w.NoVisitors)
	} else {
		// Four tiles.
		const gap, th = 10.0, 62.0
		tw := (right - left - 3*gap) / 4
		for i, t := range d.Tiles() {
			x := left + float64(i)*(tw+gap)
			pg.box(x, y, tw, th, rule)
			pg.text(x+10, y+17, regular, 8, grey, fit(regular, 8, t.Label, tw-20))
			pg.text(x+10, y+39, bold, 16, ink, fit(bold, 16, t.Value, tw-20))
			if t.Change != "" {
				pg.text(x+10, y+54, regular, 7.5, grey, fit(regular, 7.5, t.Change, tw-20))
			}
		}
		y += th + 12
		pg.text(left, y, regular, 7.5, light, d.Against())
		y += 22
		if amount, change := d.Money(); amount != "" {
			line := w.Revenue + ": " + amount
			if change != "" {
				line += " (" + change + ")"
			}
			pg.text(left, y, bold, 11, ink, fit(bold, 11, line, right-left))
			y += 26
		}

		// The chart: a bar a day.
		pg.text(left, y, bold, 10, ink, w.DailyVisitors)
		y += 10
		const ch = 100.0
		pg.chart(left, y, right-left, ch, d.Cur.Series, accent)
		y += ch + 12
		pg.text(left, y, regular, 7.5, grey, w.Date(d.From))
		last := w.Date(d.To.AddDate(0, 0, -1))
		pg.text(right-width(regular, 7.5, last), y, regular, 7.5, grey, last)
		y += 28

		for _, list := range []struct {
			title string
			rows  []Row
		}{{w.TopSources, d.Sources()}, {w.TopPages, d.Pages()}, {w.TopGoals, d.Goals()}} {
			if len(list.rows) == 0 {
				continue
			}
			pg.text(left, y, bold, 10, ink, list.title)
			y += 8
			for _, r := range list.rows {
				pg.line(left, y, right, y, rule)
				y += 14
				v := w.Number(r.Value)
				pg.text(left, y, regular, 9.5, ink, fit(regular, 9.5, r.Name, right-left-70))
				pg.text(right-width(regular, 9.5, v), y, regular, 9.5, ink, v)
				y += 5
			}
			y += 18
		}
	}

	// The foot.
	foot := ""
	if !d.Brand.HideBrand {
		foot = fmt.Sprintf(w.SentBy, "trckable")
	}
	if foot != "" {
		pg.text(left, 812, regular, 8, light, foot)
	}
	return build(pg, img)
}

// ---- drawing ---------------------------------------------------------------

type rgb [3]float64

var (
	ink   = rgb{0.08, 0.09, 0.10}
	grey  = rgb{0.42, 0.45, 0.50}
	light = rgb{0.61, 0.64, 0.69}
	rule  = rgb{0.90, 0.91, 0.92}
)

func parseColor(hex string) rgb {
	var c rgb
	if len(hex) != 7 || hex[0] != '#' {
		return rgb{0.28, 0.5, 0}
	}
	for i := range c {
		var v int
		fmt.Sscanf(hex[1+2*i:3+2*i], "%02x", &v)
		c[i] = float64(v) / 255
	}
	return c
}

type face int

const (
	regular face = iota
	bold
)

func (f face) name() string { return [...]string{"F1", "F2"}[f] }

const pageH = 842.0

type page struct{ b bytes.Buffer }

func (p *page) fill(c rgb)   { fmt.Fprintf(&p.b, "%.3f %.3f %.3f rg\n", c[0], c[1], c[2]) }
func (p *page) stroke(c rgb) { fmt.Fprintf(&p.b, "%.3f %.3f %.3f RG\n", c[0], c[1], c[2]) }

// rect fills a box whose top-left is (x, y), y counted from the top of the page.
func (p *page) rect(x, y, w, h float64, c rgb) {
	p.fill(c)
	fmt.Fprintf(&p.b, "%.2f %.2f %.2f %.2f re f\n", x, pageH-y-h, w, h)
}

func (p *page) box(x, y, w, h float64, c rgb) {
	p.stroke(c)
	fmt.Fprintf(&p.b, "0.8 w %.2f %.2f %.2f %.2f re S\n", x, pageH-y-h, w, h)
}

func (p *page) line(x1, y1, x2, y2 float64, c rgb) {
	p.stroke(c)
	fmt.Fprintf(&p.b, "0.6 w %.2f %.2f m %.2f %.2f l S\n", x1, pageH-y1, x2, pageH-y2)
}

// text sets a line with its baseline at y.
func (p *page) text(x, y float64, f face, size float64, c rgb, s string) {
	p.fill(c)
	fmt.Fprintf(&p.b, "BT /%s %.1f Tf %.2f %.2f Td (%s) Tj ET\n", f.name(), size, x, pageH-y, pdfString(s))
}

func (p *page) image(x, y, w, h float64) {
	fmt.Fprintf(&p.b, "q %.2f 0 0 %.2f %.2f %.2f cm /Im1 Do Q\n", w, h, x, pageH-y-h)
}

// chart draws a bar for each point, tallest to the top of the box.
func (p *page) chart(x, y, w, h float64, pts []query.Point, c rgb) {
	p.line(x, y+h, x+w, y+h, rule)
	var max int64
	for _, pt := range pts {
		max = maxInt(max, pt.Visitors)
	}
	if len(pts) == 0 || max == 0 {
		return
	}
	slot := w / float64(len(pts))
	bar := slot * 0.7
	for i, pt := range pts {
		bh := h * float64(pt.Visitors) / float64(max)
		if pt.Visitors > 0 && bh < 1 {
			bh = 1
		}
		p.rect(x+float64(i)*slot+(slot-bar)/2, y+h-bh, bar, bh, c)
	}
}

func maxInt(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// ---- text ------------------------------------------------------------------

// winAnsi maps a character to its byte in Windows-1252, the encoding the
// standard fonts are read in; ok is false outside it.
func winAnsi(r rune) (byte, bool) {
	switch {
	case r >= 32 && r < 127, r >= 160 && r <= 255:
		return byte(r), true
	}
	if b, ok := map[rune]byte{'€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, ' ': 32, ' ': 160}[r]; ok {
		return b, true
	}
	return '?', false
}

// pdfString writes s as the inside of a PDF string: its bytes in WinAnsi,
// with the characters a string cannot hold plainly escaped.
func pdfString(s string) string {
	var out []byte
	for _, r := range s {
		b, _ := winAnsi(r)
		switch {
		case b == '(' || b == ')' || b == '\\':
			out = append(out, '\\', b)
		case b < 32:
			out = append(out, ' ')
		default:
			out = append(out, b)
		}
	}
	return string(out)
}

// Helvetica's advance widths for the characters 32 to 126, in thousandths of
// the size: the font's own metrics.
var helv = [95]int{278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
	1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
	333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584}

var helvBold = [95]int{278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
	975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
	333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584}

// width is how wide s is set, in points. A letter with an accent is as wide
// as its plain one, near enough for aligning and cutting.
func width(f face, size float64, s string) float64 {
	table := &helv
	if f == bold {
		table = &helvBold
	}
	var n int
	for _, r := range s {
		if r >= 32 && r < 127 {
			n += table[r-32]
		} else {
			n += 556
		}
	}
	return float64(n) * size / 1000
}

// fit cuts s with an ellipsis so it is no wider than max.
func fit(f face, size float64, s string, max float64) string {
	if width(f, size, s) <= max {
		return s
	}
	r := []rune(s)
	for len(r) > 0 && width(f, size, string(r)+"…") > max {
		r = r[:len(r)-1]
	}
	return string(r) + "…"
}

// ---- the picture -----------------------------------------------------------

type pdfImage struct {
	w, h   int
	space  string // /DeviceRGB or /DeviceGray
	filter string // "DCTDecode" for a JPEG kept as it is, "FlateDecode" for raw pixels
	data   []byte
}

// maxLogoDraw bounds the pixels kept for a logo: a header is a few centimetres.
const maxLogoDraw = 480

// newImage makes the picture a logo is drawn from; nil for none, or for one
// it cannot draw (a CMYK JPEG, anything that fails to read).
func newImage(data []byte, typ string) *pdfImage {
	if len(data) == 0 {
		return nil
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width < 1 || cfg.Height < 1 {
		return nil
	}
	if typ == "image/jpeg" && cfg.Width <= maxLogoDraw*2 {
		switch cfg.ColorModel {
		case color.YCbCrModel:
			return &pdfImage{cfg.Width, cfg.Height, "/DeviceRGB", "DCTDecode", data}
		case color.GrayModel:
			return &pdfImage{cfg.Width, cfg.Height, "/DeviceGray", "DCTDecode", data}
		}
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil
	}
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w > maxLogoDraw || h > maxLogoDraw {
		scale := float64(maxLogoDraw) / float64(max(w, h))
		w, h = max(1, int(float64(w)*scale)), max(1, int(float64(h)*scale))
	}
	pix := make([]byte, 0, w*h*3)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			r, g, bl, a := src.At(b.Min.X+x*b.Dx()/w, b.Min.Y+y*b.Dy()/h).RGBA()
			// Over white, the page's own colour.
			over := func(c uint32) byte { return byte((c + (0xffff - a)) >> 8) }
			pix = append(pix, over(r), over(g), over(bl))
		}
	}
	return &pdfImage{w, h, "/DeviceRGB", "FlateDecode", deflate(pix)}
}

func deflate(b []byte) []byte {
	var out bytes.Buffer
	zw := zlib.NewWriter(&out)
	_, _ = zw.Write(b)
	_ = zw.Close()
	return out.Bytes()
}

// ---- the file --------------------------------------------------------------

// build assembles the objects and the cross-reference table the reader finds
// them by.
func build(pg *page, img *pdfImage) []byte {
	var objs [][]byte
	add := func(s string) int { objs = append(objs, []byte(s)); return len(objs) }
	add("<< /Type /Catalog /Pages 2 0 R >>")
	add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
	res := "/Font << /F1 5 0 R /F2 6 0 R >>"
	if img != nil {
		res += " /XObject << /Im1 8 0 R >>"
	}
	add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << " + res + " >> /Contents 4 0 R >>")
	content := deflate(pg.b.Bytes())
	add(fmt.Sprintf("<< /Length %d /Filter /FlateDecode >>\nstream\n%s\nendstream", len(content), content))
	add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
	add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
	add("<< /Producer (trckable) >>")
	if img != nil {
		add(fmt.Sprintf("<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace %s /BitsPerComponent 8 /Filter /%s /Length %d >>\nstream\n%s\nendstream",
			img.w, img.h, img.space, img.filter, len(img.data), img.data))
	}
	var out bytes.Buffer
	out.WriteString("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
	offsets := make([]int, len(objs))
	for i, o := range objs {
		offsets[i] = out.Len()
		fmt.Fprintf(&out, "%d 0 obj\n%s\nendobj\n", i+1, o)
	}
	xref := out.Len()
	fmt.Fprintf(&out, "xref\n0 %d\n0000000000 65535 f \n", len(objs)+1)
	for _, off := range offsets {
		fmt.Fprintf(&out, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&out, "trailer\n<< /Size %d /Root 1 0 R /Info 7 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objs)+1, xref)
	return out.Bytes()
}
