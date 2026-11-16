package cards

// The badge is the same on every template that can carry it: it follows the domain on the line the template sets
// it on, and the domain gives up the room it needs.

// badgeSlot is the line the domain stands on: where it starts (x0), its baseline, its size, and the right edge that
// the domain and the badge together must stay left of (the period's pill, the corner's tile).
type badgeSlot struct {
	x0, base  int
	px, right float64
}

func (s Spec) slot() badgeSlot {
	l := s.layout()
	room := float64(l.Right)
	switch s.Template {
	case "overview", "numbers":
		// After the site's tile, left of the period's pill.
		return badgeSlot{x0: l.Left + l.Tile + l.n(18), base: l.TileY + l.n(36), px: l.px(30), right: room - measure(false, s.Foot, l.px(periodPx)) - float64(l.n(48))}
	case "spotlight":
		return badgeSlot{x0: l.Left, base: l.DomainY, px: l.px(28), right: room - float64(l.n(160))}
	}
	return badgeSlot{x0: l.Left, base: l.DomainY, px: l.px(28), right: room}
}

// shownDomain is the domain as the card writes it in room: the overview's clip first, then cut to fit.
func (s Spec) shownDomain(room float64) string {
	d := s.Domain
	if s.Template == "overview" || s.Template == "numbers" {
		d = clip(d, 34)
	}
	return fitWith(false, d, room, s.slot().px)
}

// runs are the template's lines; with a badge, the domain is cut to leave it room and its word is added.
func (s Spec) runs(t Template) []Run {
	runs := t.Runs(s)
	if !s.badged() {
		return runs
	}
	sl, g := s.slot(), badgeGeomOf(s)
	for i := range runs {
		if r := &runs[i]; r.X == sl.x0 && r.Y == sl.base && !r.End && !r.Mid {
			r.Spans[0].Text = s.shownDomain(sl.right - float64(sl.x0) - g.w - float64(s.layout().n(24)))
			break
		}
	}
	return append(runs, Run{X: int(g.tx), Y: int(g.y1), Px: g.px1, Spans: []Span{{Text: s.Badge, Ink: s.Theme.Muted}}})
}
