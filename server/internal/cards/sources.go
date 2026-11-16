package cards

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"sync"
)

// The marks of the sources that vouch for a picture's numbers (a "Verified" badge), keyed by the id the verified
// list uses (server/internal/api/verified.go): the payment providers here, Search Console ("gsc") drawn by hand in
// digest.go. The dashboard reads the same file (dashboard/src/features/verified/logos.json, kept equal by a test).
//
// Stripe, Paddle, Lemon Squeezy and Dodo Payments are the Simple Icons marks (https://simpleicons.org, CC0 1.0), the
// 24 by 24 single path of each, unchanged. A brand mark keeps its brand colour: the one exception to drawing with the
// card's theme. "ink" is the theme's text colour, and "light" the colour on a light card when the brand's does not
// read there (Paddle's yellow).
// TODO: official Polar mark. Simple Icons has none; a plain disc in the text colour stands in until we have it.
//
//go:embed logos/sources.json
var sourcesJSON []byte

type sourceMark struct {
	Name  string `json:"name"`
	Color string `json:"color"`
	Light string `json:"light"`
	D     string `json:"d"`
}

// markUnits is the side of the square the marks are drawn in.
const markUnits = 24.0

var (
	marksOnce sync.Once
	marks     map[string]sourceMark
)

func sourceMarks() map[string]sourceMark {
	marksOnce.Do(func() {
		if err := json.Unmarshal(sourcesJSON, &marks); err != nil {
			panic(fmt.Sprintf("cards: logos/sources.json: %v", err))
		}
	})
	return marks
}

// SourceKnown says whether a source has a mark to draw: Search Console and the providers in the list.
func SourceKnown(id string) bool {
	_, ok := sourceMarks()[id]
	return ok || id == SourceSearch
}

// SourceSearch is Search Console's id, as the verified list names it.
const SourceSearch = "gsc"

// badged is whether a card draws the badge: a word, and a source whose mark there is.
func (s Spec) badged() bool { return s.Badge != "" && SourceKnown(s.Source) }

// mark draws a provider's mark, its 24 by 24 square with the top left at (x, y) and sc pixels to the unit.
func mark(id string, s Spec, x, y, sc float64) string {
	m := sourceMarks()[id]
	c := m.Color
	if luminance(s.Theme.BG) > 0.5 && m.Light != "" {
		c = m.Light
	}
	if c == "ink" {
		c = s.Theme.FG
	}
	return fmt.Sprintf(`<path d="%s" fill="%s"/>`, movePath(m.D, x, y, sc), c)
}
