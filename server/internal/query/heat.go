package query

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"time"
)

// The heatmaps: what the heatmaps script reported for one page, as counters
// per element, and how far down people scrolled it. Nothing here is a visit:
// a spot is "this element was clicked this many times, about here".

// HeatWidths are the window widths a page is looked at in, the same as the
// ones the script's reports are filed under (ingest.HeatPhone and the others).
var HeatWidths = []int{390, 768, 1280}

// HeatSpot is one place on a page that was clicked: an element, a tenth of its
// width and height, and the average place and size the element had when it was.
// X and Width are thousandths of the window, Y and Height pixels from the top.
type HeatSpot struct {
	El     string `json:"el"`
	CX     int    `json:"cx"`
	CY     int    `json:"cy"`
	N      int64  `json:"n"`
	X      int    `json:"x"`
	Y      int    `json:"y"`
	Width  int    `json:"w"`
	Height int    `json:"h"`
}

// HeatElement is one element's totals: its clicks, and how many of them went
// nowhere or were repeated at once.
type HeatElement struct {
	El     string `json:"el"`
	Clicks int64  `json:"clicks"`
	Dead   int64  `json:"dead"`
	Rage   int64  `json:"rage"`
}

// HeatField is one form field: how many times it was reached, and how many
// times it was the last one before the form was left.
type HeatField struct {
	Form    string `json:"form"`
	Field   string `json:"field"`
	Reached int64  `json:"reached"`
	Left    int64  `json:"left"`
}

// HeatWidth says how many page views were counted at one window width.
type HeatWidth struct {
	Width int   `json:"width"`
	Views int64 `json:"views"`
}

// Heat is one page's heatmap at one window width.
type Heat struct {
	Path   string      `json:"path"`
	Width  int         `json:"width"`  // the bucket shown
	Widths []HeatWidth `json:"widths"` // every bucket, with its views
	Views  int64       `json:"views"`  // page views counted at this width
	Window int         `json:"window"` // the window's average width, px
	Height int         `json:"height"` // the page's average height, px
	Clicks []HeatSpot  `json:"clicks"`
	Dead   []HeatSpot  `json:"dead"`
	Rage   []HeatSpot  `json:"rage"`
	// Elements are the most clicked, busiest first.
	Elements []HeatElement `json:"elements"`
	Fields   []HeatField   `json:"fields"`
	// Scroll is the share of page views that got at least 10, 20 … 100 % of the
	// way down, from the same reports the Scroll tab reads. Empty when no page
	// view at this width reported its depth.
	Scroll       []float64 `json:"scroll"`
	ScrollSample int64     `json:"scroll_views"`
}

const (
	heatSpotLimit = 400  // spots per kind: the busiest places are the map
	heatSpotRows  = 1500 // and the rows read for all three: a page with thousands of places is not read whole
	heatElLimit   = 30
	heatFldLimit  = 40
)

// HeatFor reads one page's heatmap for the days of [p.From, p.To) as the
// period names them. width is one of HeatWidths, or 0 for the one with the
// most page views.
func (q Q) HeatFor(ctx context.Context, p Params, path string, width int) (*Heat, error) {
	loc, err := time.LoadLocation(p.TZ)
	if err != nil {
		loc = time.UTC
	}
	from := p.From.In(loc).Format(time.DateOnly)
	to := p.To.In(loc).Add(-time.Nanosecond).AddDate(0, 0, 1).Format(time.DateOnly)
	out := &Heat{Path: path, Clicks: []HeatSpot{}, Dead: []HeatSpot{}, Rage: []HeatSpot{}, Elements: []HeatElement{}, Fields: []HeatField{}, Scroll: []float64{}}

	views := map[int]int64{}
	rows, err := q.DB.QueryContext(ctx, `
		SELECT width, sum(n)::BIGINT FROM heat_daily
		WHERE site_id = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE) AND path = ? AND kind = 'v'
		GROUP BY width`, p.Site, from, to, path)
	if err != nil {
		return nil, fmt.Errorf("heatmap: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var w int
		var n int64
		if err := rows.Scan(&w, &n); err != nil {
			return nil, err
		}
		views[w] = n
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, w := range HeatWidths {
		out.Widths = append(out.Widths, HeatWidth{Width: w, Views: views[w]})
	}
	if views[width] == 0 && !validHeatWidth(width) {
		width = 0
	}
	if width == 0 { // the width with the most views; the desktop on a tie
		for _, w := range HeatWidths {
			if views[w] >= views[width] {
				width = w
			}
		}
	}
	out.Width, out.Views = width, views[width]

	// The page as it was: the window and the height, averaged over its views.
	var sw, sh int64
	if err := q.DB.QueryRowContext(ctx, `
		SELECT coalesce(sum(sw), 0)::BIGINT, coalesce(sum(sh), 0)::BIGINT FROM heat_daily
		WHERE site_id = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE) AND path = ? AND width = ? AND kind = 'v'`,
		p.Site, from, to, path, width).Scan(&sw, &sh); err != nil {
		return nil, fmt.Errorf("heatmap: %w", err)
	}
	if out.Views > 0 {
		out.Window, out.Height = int(sw/out.Views), int(sh/out.Views)
	}

	spots, err := q.DB.QueryContext(ctx, `
		SELECT kind, el, cx, cy, sum(n)::BIGINT AS n,
		       (sum(sx) / sum(n))::BIGINT, (sum(sy) / sum(n))::BIGINT, (sum(sw) / sum(n))::BIGINT, (sum(sh) / sum(n))::BIGINT
		FROM heat_daily
		WHERE site_id = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE) AND path = ? AND width = ? AND kind IN ('c', 'd', 'r')
		GROUP BY kind, el, cx, cy
		ORDER BY n DESC, el, cx, cy
		LIMIT ?`, p.Site, from, to, path, width, heatSpotRows)
	if err != nil {
		return nil, fmt.Errorf("heatmap: %w", err)
	}
	defer spots.Close()
	byEl := map[string]*HeatElement{}
	for spots.Next() {
		var kind string
		var s HeatSpot
		if err := spots.Scan(&kind, &s.El, &s.CX, &s.CY, &s.N, &s.X, &s.Y, &s.Width, &s.Height); err != nil {
			return nil, err
		}
		e := byEl[s.El]
		if e == nil {
			e = &HeatElement{El: s.El}
			byEl[s.El] = e
		}
		list := &out.Clicks
		switch kind {
		case "c":
			e.Clicks += s.N
		case "d":
			e.Dead += s.N
			list = &out.Dead
		case "r":
			e.Rage += s.N
			list = &out.Rage
		}
		if len(*list) < heatSpotLimit {
			*list = append(*list, s)
		}
	}
	if err := spots.Err(); err != nil {
		return nil, err
	}
	for _, e := range byEl {
		out.Elements = append(out.Elements, *e)
	}
	sort.Slice(out.Elements, func(i, j int) bool {
		a, b := out.Elements[i], out.Elements[j]
		if a.Clicks != b.Clicks {
			return a.Clicks > b.Clicks
		}
		return a.El < b.El
	})
	if len(out.Elements) > heatElLimit {
		out.Elements = out.Elements[:heatElLimit]
	}

	flds, err := q.DB.QueryContext(ctx, `
		SELECT el, sum(n) FILTER (WHERE kind = 'fr')::BIGINT, coalesce(sum(n) FILTER (WHERE kind = 'fd'), 0)::BIGINT
		FROM heat_daily
		WHERE site_id = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE) AND path = ? AND width = ? AND kind IN ('fr', 'fd')
		GROUP BY el ORDER BY 2 DESC NULLS LAST, el LIMIT ?`, p.Site, from, to, path, width, heatFldLimit)
	if err != nil {
		return nil, fmt.Errorf("heatmap: %w", err)
	}
	defer flds.Close()
	for flds.Next() {
		var el string
		var reached *int64
		var f HeatField
		if err := flds.Scan(&el, &reached, &f.Left); err != nil {
			return nil, err
		}
		if reached != nil {
			f.Reached = *reached
		}
		f.Form, f.Field = splitField(el)
		out.Fields = append(out.Fields, f)
	}
	if err := flds.Err(); err != nil {
		return nil, err
	}

	return out, q.heatScroll(ctx, p, path, width, out)
}

func validHeatWidth(w int) bool {
	for _, x := range HeatWidths {
		if x == w {
			return true
		}
	}
	return false
}

// splitField is "signup>email" as the form and the field.
func splitField(el string) (form, field string) {
	for i := 0; i < len(el); i++ {
		if el[i] == '>' {
			return el[:i], el[i+1:]
		}
	}
	return "", el
}

// heatScroll fills in how far down people read the page at this width: the
// engagement pings the base script already sends, nothing new. A page view's
// depth is the largest of its pings; its width is the screen it began on,
// filed the way the heatmaps file theirs.
func (q Q) heatScroll(ctx context.Context, p Params, path string, width int, out *Heat) error {
	lo, hi := 0, 1<<30
	switch width {
	case 390:
		hi = 640
	case 768:
		lo, hi = 640, 1024
	default:
		lo = 1024
	}
	args := []any{p.From, p.To, p.Site, p.From, p.To, path, lo, hi}
	row := q.DB.QueryRowContext(ctx, `
		WITH pv AS (
			SELECT e.pageview_id, max(coalesce(x.scroll_pct, 0)) AS depth
			FROM events e JOIN events x
			  ON x.site_id = e.site_id AND x.pageview_id = e.pageview_id AND x.kind = 3
			 AND x.ts >= ? AND x.ts < ? + INTERVAL 1 DAY
			WHERE e.site_id = ? AND e.ts >= ? AND e.ts < ? AND e.kind = 1 AND e.path = ?
			  AND coalesce(e.screen, 1280) >= ? AND coalesce(e.screen, 1280) < ?
			GROUP BY e.pageview_id)
		SELECT count(*),
		       coalesce(avg((depth >= 10)::INT), 0), coalesce(avg((depth >= 20)::INT), 0), coalesce(avg((depth >= 30)::INT), 0),
		       coalesce(avg((depth >= 40)::INT), 0), coalesce(avg((depth >= 50)::INT), 0), coalesce(avg((depth >= 60)::INT), 0),
		       coalesce(avg((depth >= 70)::INT), 0), coalesce(avg((depth >= 80)::INT), 0), coalesce(avg((depth >= 90)::INT), 0),
		       coalesce(avg((depth >= 100)::INT), 0)
		FROM pv`, args...)
	vals := make([]float64, 10)
	dest := []any{&out.ScrollSample}
	for i := range vals {
		dest = append(dest, &vals[i])
	}
	if err := row.Scan(dest...); err != nil {
		return fmt.Errorf("heatmap scroll: %w", err)
	}
	if out.ScrollSample > 0 {
		out.Scroll = vals
	}
	return nil
}

// HeatAsk says whether a page is busy enough to be worth a heatmap: the page
// with the most views on the given day, and how many it had, when that is at
// least min. It reads the page views already kept, so it works with the module
// off, which is when it is asked.
func (q Q) HeatAsk(ctx context.Context, site string, dayStart, dayEnd time.Time, min int64) (path string, views int64, err error) {
	err = q.DB.QueryRowContext(ctx, `
		SELECT path, count(*)::BIGINT AS n FROM events
		WHERE site_id = ? AND ts >= ? AND ts < ? AND kind = 1 AND path IS NOT NULL
		GROUP BY path ORDER BY n DESC, path LIMIT 1`, site, dayStart, dayEnd).Scan(&path, &views)
	if errors.Is(err, sql.ErrNoRows) {
		return "", 0, nil
	}
	if err != nil || views < min {
		return "", views, err
	}
	return path, views, nil
}
