package cards

import "math"

// Format is a card's size: one layout engine places the blocks for each.
// The list is mirrored by dashboard/src/features/share/formats.json, the one
// source the panel reads (TestFormatsMatchThePanel keeps them equal).
type Format struct {
	ID   string
	W, H int
}

// Formats are the sizes there are: the link preview (1.91:1, X and LinkedIn),
// square (Instagram, LinkedIn), story (9:16) and wide (16:9).
var Formats = []Format{
	{"link", 1200, 630},
	{"square", 1080, 1080},
	{"story", 1080, 1920},
	{"wide", 1600, 900},
}

// FormatOf is a format by id, the link preview for anything unknown.
func FormatOf(id string) Format {
	for _, f := range Formats {
		if f.ID == id {
			return f
		}
	}
	return Formats[0]
}

// Layout is where every block of every template sits on one format: the
// templates read it and never a pixel of their own. The link preview's values
// are the original design; wide is the same design scaled; square and story
// give the extra height to the big number and the chart (or the rows).
type Layout struct {
	Format
	// K scales type and the horizontal sizes against the link preview's 1200;
	// Display scales the big number on top of it.
	K, Display float64

	Left, Right int
	DomainY     int
	FootY       int

	// Overview.
	Tile, TileY, TileR     int
	BigY, LabelY           int
	ChartTop, ChartBase    float64
	StatValueY, StatLabelY int
	StatStep               int
	MarkX                  int
	GhostX, GhostY         float64
	GhostK                 float64

	// Spotlight: the number, its label, the rising line, the corner ghost.
	SpotBigY, SpotLabelY int
	LineLo, LineHi       float64
	CornerGhostX         float64
	CornerGhostY         float64
	CornerGhostK         float64
	LineW                float64

	// Numbers (three cards in a row) and the grid (two by two).
	NumTop, NumH            int
	NumPx                   float64
	GridTop, GridH, GridGap int
	GridPx                  float64

	// Leaderboard.
	TitleY, RowTop, RowStep, RowH int
	TitlePx, RowPx                float64
	BarGap                        int
}

// n is a horizontal size or a type size at this format's scale.
func (l Layout) n(v float64) int { return int(math.Round(v * l.K)) }

// px is a type size at this format's scale.
func (l Layout) px(v float64) float64 { return math.Round(v*l.K*10) / 10 }

// layoutFor places the blocks for a format.
func layoutFor(f Format) Layout {
	k := float64(f.W) / 1200
	vy := float64(f.H) / 630
	y := func(v float64) int { return int(math.Round(v * vy)) }
	l := Layout{
		Format: f, K: k, Display: 1,
		Left: int(math.Round(88 * k)), Right: f.W - int(math.Round(88*k)),
		DomainY: y(128), FootY: y(556),
		Tile: int(math.Round(52 * k)), TileY: y(70), TileR: int(math.Round(15 * k)),
		BigY: y(262), LabelY: y(316),
		ChartTop: 352 * vy, ChartBase: 486 * vy,
		StatValueY: y(540), StatLabelY: y(572), StatStep: int(math.Round(250 * k)),
		MarkX: f.W - int(math.Round(308*k)), GhostX: 892 * k, GhostY: 520 * vy,
		SpotBigY: y(316), SpotLabelY: y(372), LineLo: 500 * vy, LineHi: 270 * vy,
		CornerGhostX: float64(f.W) - 168*k, CornerGhostY: 72 * vy,
		NumTop: y(366), NumH: y(148), NumPx: 56 * k,
		GridTop: y(222), GridH: y(140), GridGap: int(math.Round(16 * k)), GridPx: 60 * k,
		TitleY: y(184), RowTop: y(222), RowStep: y(58), RowH: y(44),
		TitlePx: 40 * k, RowPx: 26 * k, BarGap: int(math.Round(150 * k)),
	}
	switch f.ID {
	case "square":
		l.K, l.Display = 1.15, 1.4
		l.Left, l.Right = 88, f.W-88
		l.Tile, l.TileR, l.StatStep = 60, 17, (f.W-176)/3
		l.DomainY, l.FootY, l.TileY = 150, 1024, 100
		l.BigY, l.LabelY = 420, 492
		l.ChartTop, l.ChartBase = 570, 850
		l.StatValueY, l.StatLabelY = 920, 962
		l.MarkX, l.GhostX, l.GhostY = f.W-354, float64(f.W-354), float64(1024-41)
		l.SpotBigY, l.SpotLabelY, l.LineLo, l.LineHi = 560, 640, 940, 660
		l.CornerGhostX, l.CornerGhostY = float64(f.W)-186, 100
		l.NumTop, l.NumH, l.NumPx = 580, 290, 76
		l.GridTop, l.GridH, l.GridGap, l.GridPx = 310, 300, 24, 92
		l.TitleY, l.RowTop, l.RowStep, l.RowH = 250, 310, 124, 100
		l.TitlePx, l.RowPx, l.BarGap = 58, 38, 160
	case "story":
		l.K, l.Display = 1.3, 1.55
		l.Left, l.Right = 92, f.W-92
		l.Tile, l.TileR, l.StatStep = 68, 20, (f.W-184)/3
		l.DomainY, l.FootY, l.TileY = 215, 1790, 180
		l.BigY, l.LabelY = 720, 806
		l.ChartTop, l.ChartBase = 900, 1330
		l.StatValueY, l.StatLabelY = 1470, 1520
		l.MarkX, l.GhostX, l.GhostY = f.W-400, float64(f.W-400), float64(1790-47)
		l.SpotBigY, l.SpotLabelY, l.LineLo, l.LineHi = 960, 1050, 1540, 1120
		l.CornerGhostX, l.CornerGhostY = float64(f.W)-206, 180
		l.NumTop, l.NumH, l.NumPx = 940, 330, 84
		l.GridTop, l.GridH, l.GridGap, l.GridPx = 540, 420, 28, 104
		l.TitleY, l.RowTop, l.RowStep, l.RowH = 440, 540, 220, 168
		l.TitlePx, l.RowPx, l.BarGap = 70, 46, 170
	}
	l.LineW, l.CornerGhostK, l.GhostK = 7*l.K, 1.1*l.K, 0.6*l.K
	return l
}

// layout is the spec's, by its format.
func (s Spec) layout() Layout { return layoutFor(FormatOf(s.Format)) }

// fitPx is the largest size up to px at which s fits its room in the bold
// font, never below min.
func fitPx(s string, px, min, room float64) float64 {
	for px > min && wide(s, px) > room {
		px -= 2
	}
	return px
}

// fitWith keeps s inside its room, measured in the real font (bold or
// regular) at size em, ending in an ellipsis when it does not fit.
func fitWith(bold bool, s string, room, em float64) string {
	if measure(bold, s, em) <= room {
		return s
	}
	r := []rune(s)
	for i := len(r) - 1; i > 0; i-- {
		if t := string(r[:i]) + "…"; measure(bold, t, em) <= room {
			return t
		}
	}
	return "…"
}
