package cards

import (
	"bytes"
	_ "embed"
	"image"
	"image/color"
	"image/png"
	"strconv"
	"sync"

	"github.com/srwiley/oksvg"
	"github.com/srwiley/rasterx"
	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

//go:embed fonts/Geist-Bold.ttf
var geistBold []byte

//go:embed fonts/Geist-Regular.ttf
var geistRegular []byte

var (
	fontsOnce     sync.Once
	boldF, plainF *opentype.Font
	fontErr       error
)

func loadFonts() error {
	fontsOnce.Do(func() {
		if boldF, fontErr = opentype.Parse(geistBold); fontErr != nil {
			return
		}
		plainF, fontErr = opentype.Parse(geistRegular)
	})
	return fontErr
}

func rgb(s string) color.RGBA {
	v, _ := strconv.ParseUint(s[1:], 16, 32)
	return color.RGBA{uint8(v >> 16 & 0xff), uint8(v >> 8 & 0xff), uint8(v & 0xff), 0xff} //nolint:gosec // masked to a byte
}

// PNG draws the card as a PNG.
func (s Spec) PNG() ([]byte, error) {
	if err := loadFonts(); err != nil {
		return nil, err
	}
	svg, err := s.shapes(true)
	if err != nil {
		return nil, err
	}
	icon, err := oksvg.ReadIconStream(bytes.NewReader(append(svg, "</svg>"...)), oksvg.WarnErrorMode)
	if err != nil {
		return nil, err
	}
	img := image.NewRGBA(image.Rect(0, 0, W, H))
	icon.SetTarget(0, 0, W, H)
	icon.Draw(rasterx.NewDasher(W, H, rasterx.NewScannerGV(W, H, img, img.Bounds())), 1)

	t, _ := s.template()
	for _, r := range t.Runs(s) {
		if err := drawRun(img, r); err != nil {
			return nil, err
		}
	}
	var out bytes.Buffer
	if err := (&png.Encoder{CompressionLevel: png.BestSpeed}).Encode(&out, img); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// drawRun sets one line: its spans side by side, ending at X for End.
func drawRun(img *image.RGBA, r Run) error {
	faces := make([]font.Face, len(r.Spans))
	width := fixed.Int26_6(0)
	for i, sp := range r.Spans {
		f := plainF
		if sp.Bold {
			f = boldF
		}
		fc, err := opentype.NewFace(f, &opentype.FaceOptions{Size: r.Px, DPI: 72, Hinting: font.HintingNone})
		if err != nil {
			return err
		}
		faces[i] = fc
		width += font.MeasureString(fc, sp.Text)
	}
	dot := fixed.P(r.X, r.Y)
	if r.End {
		dot.X -= width
	}
	for i, sp := range r.Spans {
		if sp.Text == "" || !validHex(sp.Ink) {
			continue
		}
		d := font.Drawer{Dst: img, Src: image.NewUniform(rgb(sp.Ink)), Face: faces[i], Dot: dot}
		d.DrawString(sp.Text)
		dot = d.Dot
	}
	return nil
}
