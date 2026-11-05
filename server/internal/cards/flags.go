package cards

import (
	"bytes"
	_ "embed"
	"image"
	"image/png"
	"strings"
	"sync"
)

// The flags are one small sprite, drawn from the flag-icons package the
// dashboard shows (go run flags/gen.go rebuilds it): 48 × 36 each, 16 to a row,
// in the order flags.txt lists. A country without one is written without it.
const (
	flagW, flagH = 48, 36
	flagCols     = 16
)

//go:embed flags/flags.png
var flagSheet []byte

//go:embed flags/flags.txt
var flagCodes string

var (
	flagsOnce  sync.Once
	flagImg    image.Image
	flagByCode map[string]int
)

func loadFlags() {
	flagByCode = map[string]int{}
	for i, c := range strings.Fields(flagCodes) {
		flagByCode[c] = i
	}
	flagImg, _ = png.Decode(bytes.NewReader(flagSheet))
}

// Flag is a country's flag (its two-letter code) as a 48 × 36 picture, nil
// for a code with none.
func Flag(code string) image.Image {
	flagsOnce.Do(loadFlags)
	i, ok := flagByCode[strings.ToUpper(code)]
	if !ok || flagImg == nil {
		return nil
	}
	x, y := i%flagCols*flagW, i/flagCols*flagH
	return flagImg.(interface {
		SubImage(image.Rectangle) image.Image
	}).SubImage(image.Rect(x, y, x+flagW, y+flagH))
}
