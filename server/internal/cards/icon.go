package cards

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif"  // a site's icon may be a GIF,
	_ "image/jpeg" // a JPEG,
	"image/png"    // or a PNG
	"math"

	"golang.org/x/image/bmp"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // a WebP: the server keeps those as icons too
)

// Pic is a picture on a card: where it goes, and how round its corners are.
// The SVG form of a card leaves pictures out; the PNG is the card.
type Pic struct {
	Img    image.Image
	Box    image.Rectangle
	Radius int
}

// DecodeIcon reads a site's icon (PNG, JPEG, GIF, WebP or ICO), nil for anything
// else or anything that does not decode.
func DecodeIcon(data []byte) image.Image {
	if len(data) > 6 && binary.LittleEndian.Uint32(data) == 0x00010000 {
		return decodeICO(data)
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil
	}
	return img
}

// decodeICO takes the largest picture in an .ico file: a PNG inside, or a
// plain bitmap (whose height counts its transparency mask too).
func decodeICO(b []byte) image.Image {
	n := int(binary.LittleEndian.Uint16(b[4:]))
	best, bestArea := -1, 0
	for i := 0; i < n && 6+16*(i+1) <= len(b); i++ {
		e := b[6+16*i:]
		w, h := int(e[0]), int(e[1])
		if w == 0 {
			w = 256
		}
		if h == 0 {
			h = 256
		}
		if w*h > bestArea {
			best, bestArea = i, w*h
		}
	}
	if best < 0 {
		return nil
	}
	e := b[6+16*best:]
	size, off := int(binary.LittleEndian.Uint32(e[8:])), int(binary.LittleEndian.Uint32(e[12:]))
	if off < 0 || size < 40 || off+size > len(b) {
		return nil
	}
	d := b[off : off+size]
	if bytes.HasPrefix(d, []byte("\x89PNG")) {
		img, err := png.Decode(bytes.NewReader(d))
		if err != nil {
			return nil
		}
		return img
	}
	// A bitmap file is its header, the palette, then the pixels.
	hdr := int(binary.LittleEndian.Uint32(d))
	bpp := int(binary.LittleEndian.Uint16(d[14:]))
	colors := int(binary.LittleEndian.Uint32(d[32:]))
	if colors == 0 && bpp <= 8 {
		colors = 1 << bpp
	}
	fixed := append([]byte(nil), d...)
	binary.LittleEndian.PutUint32(fixed[8:], uint32(int32(binary.LittleEndian.Uint32(d[8:]))/2)) //nolint:gosec // a bitmap's height, halved: the other half is the mask
	file := make([]byte, 14, 14+len(fixed))
	copy(file, "BM")
	binary.LittleEndian.PutUint32(file[2:], uint32(14+len(fixed)))    //nolint:gosec // an icon is at most 64 KB
	binary.LittleEndian.PutUint32(file[10:], uint32(14+hdr+4*colors)) //nolint:gosec // as above
	img, err := bmp.Decode(bytes.NewReader(append(file, fixed...)))
	if err != nil {
		return nil
	}
	return img
}

// drawPic puts one picture on the card, scaled to fit its box (centred, the
// aspect kept) and cut to its rounded corners.
func drawPic(dst *image.RGBA, p Pic) {
	sb, box := p.Img.Bounds(), p.Box
	if sb.Empty() || box.Empty() {
		return
	}
	w, h := box.Dx(), box.Dy()
	if sb.Dx()*h > sb.Dy()*w {
		h = max(sb.Dy()*w/sb.Dx(), 1)
	} else {
		w = max(sb.Dx()*h/sb.Dy(), 1)
	}
	x, y := box.Min.X+(box.Dx()-w)/2, box.Min.Y+(box.Dy()-h)/2
	at := image.Rect(x, y, x+w, y+h)
	scaled := image.NewRGBA(image.Rect(0, 0, w, h))
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), p.Img, sb, xdraw.Src, nil)
	draw.DrawMask(dst, at, scaled, image.Point{}, roundMask(w, h, p.Radius), image.Point{}, draw.Over)
}

// roundMask is w × h opaque with corners of radius r, edged smoothly.
func roundMask(w, h, r int) *image.Alpha {
	m := image.NewAlpha(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			// How far the pixel's centre is past the corner's centre, if in a corner.
			dx := math.Max(float64(r)-float64(x)-0.5, float64(x)+0.5-float64(w-r))
			dy := math.Max(float64(r)-float64(y)-0.5, float64(y)+0.5-float64(h-r))
			a := 1.0
			if dx > 0 && dy > 0 {
				a = math.Min(math.Max(float64(r)-math.Hypot(dx, dy)+0.5, 0), 1)
			}
			m.SetAlpha(x, y, color.Alpha{A: uint8(a * 255)})
		}
	}
	return m
}
