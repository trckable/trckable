package api

import (
	"fmt"
	"strings"

	"github.com/trckable/trckable/server/internal/cards"
)

// specPost is the text of a post for a picture other than the overview's two: what the picture says, in its words,
// and nothing it does not (a picture with nothing behind it says that line).
func specPost(s cards.Spec, tpl string, n cardNumbers) string {
	var parts []string
	say := func(text string) {
		if text = strings.TrimSpace(text); text != "" {
			if !strings.HasSuffix(text, ".") {
				text += "."
			}
			parts = append(parts, text)
		}
	}
	if s.Template == "spotlight" {
		// A milestone says its number first, a hero its words first.
		if tpl == "milestone" {
			say(s.Big + " " + s.Label)
		} else {
			say(s.Label + " " + s.Big)
		}
		return fmt.Sprintf("%s: %s %s", n.domain, strings.Join(parts, " "), cardWords.counted)
	}
	if len(s.Stats) == 0 && len(s.Rows) == 0 {
		say(s.Big)
		return fmt.Sprintf("%s: %s %s", n.domain, strings.Join(parts, " "), cardWords.counted)
	}
	say(s.Label)
	var stats, rows []string
	for _, st := range s.Stats {
		stats = append(stats, st.Value+" "+st.Label)
	}
	for _, it := range s.Rows {
		rows = append(rows, it.Name+" "+it.Value)
	}
	say(strings.Join(stats, ", "))
	say(strings.Join(rows, ", "))
	return fmt.Sprintf("%s in %s: %s %s", n.domain, n.said, strings.Join(parts, " "), cardWords.counted)
}
