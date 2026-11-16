package cards

import (
	"fmt"
	"strings"
)

// Overflows lists every line of the card that the real font sets outside the card's margins or below its foot, one
// sentence each: empty when the picture fits. Words come in many lengths (a German label is twice an English one), so
// a test draws a card in every language and asks.
func (s Spec) Overflows() []string {
	f := FormatOf(s.Format)
	tp, ok := Templates[s.Template]
	if !ok {
		return []string{"no such template: " + s.Template}
	}
	var out []string
	for _, r := range tp.Runs(s) {
		w := 0.0
		var text strings.Builder
		for _, sp := range r.Spans {
			w += measure(sp.Bold, sp.Text, r.Px)
			text.WriteString(sp.Text)
		}
		x0, x1 := float64(r.X), float64(r.X)+w
		if r.End {
			x0, x1 = float64(r.X)-w, float64(r.X)
		} else if r.Mid {
			x0, x1 = float64(r.X)-w/2, float64(r.X)+w/2
		}
		if x0 < 0 || x1 > float64(f.W)-float64(f.W)/40 || r.Y < 0 || r.Y > f.H {
			out = append(out, fmt.Sprintf("%s %s: %q spans %.0f–%.0f at y %d, outside %d × %d", f.ID, s.Template, text.String(), x0, x1, r.Y, f.W, f.H))
		}
	}
	return out
}
