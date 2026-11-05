//go:build ignore

// gen draws the flag sprite (flags.png) and its index (flags.txt) from the
// flag-icons package the dashboard already uses:
//
//	go run flags/gen.go <flag-icons>/flags/4x3 flags
//
// Each flag is rendered by rsvg-convert (brew install librsvg), which reads
// clip paths, masks and transforms in full, so flags with emblems come out
// right. Every flag is 48 × 36 on a grid of 16 columns; flags.txt lists the
// codes in grid order. Only codes the report knows (the keys of the API's
// country table, passed in codes.txt next to this file) are drawn.
package main

import (
	"bytes"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	fw, fh = 48, 36
	cols   = 16
)

func main() {
	src, out := os.Args[1], os.Args[2]
	raw, err := os.ReadFile(filepath.Join(out, "codes.txt"))
	check(err)
	codes := strings.Fields(string(raw))
	rows := (len(codes) + cols - 1) / cols
	sheet := image.NewRGBA(image.Rect(0, 0, cols*fw, rows*fh))
	var kept []string
	for _, c := range codes {
		path := filepath.Join(src, strings.ToLower(c)+".svg")
		if _, err := os.Stat(path); err != nil {
			continue
		}
		pngBytes, err := exec.Command("rsvg-convert", "-w", strconv.Itoa(fw), "-h", strconv.Itoa(fh), path).Output()
		check(err)
		tile, err := png.Decode(bytes.NewReader(pngBytes))
		check(err)
		i := len(kept)
		draw.Draw(sheet, image.Rect(i%cols*fw, i/cols*fh, i%cols*fw+fw, i/cols*fh+fh), tile, tile.Bounds().Min, draw.Src)
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
