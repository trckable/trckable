package answers

import (
	"strings"
	"unicode"

	"github.com/trckable/trckable/server/internal/mentions"
)

// Index is where kw first stands in text as a word of its own, in any case
// (the same word edges as mentions.Has), or -1. The number is an offset into
// the lowered text: use it to order names, not to slice the original.
func Index(text, kw string) int {
	text, kw = strings.ToLower(mentions.Defang(text)), strings.ToLower(strings.TrimSpace(kw))
	if kw == "" {
		return -1
	}
	for from := 0; from <= len(text); {
		i := strings.Index(text[from:], kw)
		if i < 0 {
			return -1
		}
		i += from
		if edgeBefore(text, i) && edgeAfter(text, i+len(kw)) {
			return i
		}
		from = i + 1
	}
	return -1
}

func edgeBefore(s string, at int) bool {
	if at == 0 {
		return true
	}
	rs := []rune(s[:at])
	return !wordRune(rs[len(rs)-1])
}

func edgeAfter(s string, at int) bool {
	if at >= len(s) {
		return true
	}
	return !wordRune([]rune(s[at:])[0])
}

func wordRune(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) }
