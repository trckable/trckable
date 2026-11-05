//go:build ignore

// gen draws the flag sprite (flags.png) and its index (flags.txt) from the
// flag-icons package the dashboard already uses:
//
//	go run flags/gen.go <flag-icons>/flags/4x3 flags
//
// Every flag is 48 × 36 on a grid of 16 columns; flags.txt lists the codes in
// grid order. Only codes the report knows (the keys of the API's country
// table, passed in codes.txt next to this file) are drawn.
package main

import (
	"bytes"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/srwiley/oksvg"
	"github.com/srwiley/rasterx"
)

const (
	fw, fh = 48, 36
	cols   = 16
)

var (
	clip      = regexp.MustCompile(` clip-path="[^"]*"`)
	transform = regexp.MustCompile(`transform="([^"]*)"`)
	call      = regexp.MustCompile(`(\w+)\(([^)]*)\)`)
)

// matrix rewrites a transform attribute as one matrix with plain numbers: the
// rasteriser cannot read a number that starts with a dot, or a scale or a
// translate with one argument.
func matrix(attr []byte) []byte {
	m := [6]float64{1, 0, 0, 1, 0, 0}
	for _, c := range call.FindAllStringSubmatch(string(attr), -1) {
		var a []float64
		for _, f := range strings.FieldsFunc(c[2], func(r rune) bool { return r == ' ' || r == ',' }) {
			v, _ := strconv.ParseFloat(f, 64)
			a = append(a, v)
		}
		for len(a) < 6 {
			a = append(a, 0)
		}
		n := [6]float64{1, 0, 0, 1, 0, 0}
		switch c[1] {
		case "translate":
			n[4], n[5] = a[0], a[1]
		case "scale":
			n[0], n[3] = a[0], a[1]
			if !strings.ContainsAny(strings.TrimSpace(c[2]), " ,") {
				n[3] = a[0]
			}
		case "rotate":
			sin, cos := math.Sincos(a[0] * math.Pi / 180)
			n = [6]float64{cos, sin, -sin, cos, a[1] - a[1]*cos + a[2]*sin, a[2] - a[1]*sin - a[2]*cos}
		case "matrix":
			copy(n[:], a)
		}
		m = [6]float64{
			m[0]*n[0] + m[2]*n[1], m[1]*n[0] + m[3]*n[1],
			m[0]*n[2] + m[2]*n[3], m[1]*n[2] + m[3]*n[3],
			m[0]*n[4] + m[2]*n[5] + m[4], m[1]*n[4] + m[3]*n[5] + m[5],
		}
	}
	return []byte(fmt.Sprintf(`transform="matrix(%.6f %.6f %.6f %.6f %.4f %.4f)"`, m[0], m[1], m[2], m[3], m[4], m[5]))
}

func main() {
	src, out := os.Args[1], os.Args[2]
	raw, err := os.ReadFile(filepath.Join(out, "codes.txt"))
	check(err)
	codes := strings.Fields(string(raw))
	rows := (len(codes) + cols - 1) / cols
	sheet := image.NewRGBA(image.Rect(0, 0, cols*fw, rows*fh))
	var kept []string
	for _, c := range codes {
		svg, err := os.ReadFile(filepath.Join(src, strings.ToLower(c)+".svg"))
		if err != nil {
			continue
		}
		// The rasteriser has no clipping: the clip only trims what the tile cuts off anyway.
		svg = clip.ReplaceAll(svg, nil)
		svg = transform.ReplaceAllFunc(svg, matrix)
		icon, err := oksvg.ReadIconStream(bytes.NewReader(svg), oksvg.IgnoreErrorMode)
		if err != nil {
			continue
		}
		i := len(kept)
		tile := image.NewRGBA(image.Rect(0, 0, fw, fh))
		icon.SetTarget(0, 0, fw, fh)
		icon.Draw(rasterx.NewDasher(fw, fh, rasterx.NewScannerGV(fw, fh, tile, tile.Bounds())), 1)
		draw.Draw(sheet, image.Rect(i%cols*fw, i/cols*fh, i%cols*fw+fw, i/cols*fh+fh), tile, image.Point{}, draw.Src)
		kept = append(kept, c)
	}
	var b bytes.Buffer
	check((&png.Encoder{CompressionLevel: png.BestCompression}).Encode(&b, sheet))
	check(os.WriteFile(filepath.Join(out, "flags.png"), b.Bytes(), 0o644))
	check(os.WriteFile(filepath.Join(out, "flags.txt"), []byte(strings.Join(kept, " ")+"\n"), 0o644))
	fmt.Println(len(kept), "flags,", b.Len(), "bytes")
}

func check(err error) {
	if err != nil {
		panic(err)
	}
}
