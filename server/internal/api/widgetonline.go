package api

import (
	"context"
	"time"

	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/web"
)

// The "online" widget: how many people are on a site now, as a pill, a pill
// with a sparkline, or a card. Like every widget it is a page of HTML and CSS
// that reads itself again, so it runs no script of its own; the optional
// corner placement is a separate script (web.OnlineScript) that only frames it.
//
// It shows aggregates and never one person: below query.OnlineMin visitors
// the count reads "A few", the chart is left out, and a country or a page
// shows only when that many are on it.

// widgetFresh is how long a site's numbers are kept for a design: a minute,
// but an online count is read again within fifteen seconds.
func widgetFresh(kind string) time.Duration {
	if kind == "online" {
		return 15 * time.Second
	}
	return time.Minute
}

// widgetRefresh is how often a shown page reads itself again, in seconds.
func widgetRefresh(kind string) int {
	if kind == "online" {
		return 30
	}
	return 60
}

// fillOnline turns the numbers into what the online widget shows. The count
// is who was seen in the last five minutes, the same people the dashboard's
// Online counts.
func fillOnline(d *widgetData, wd sqlite.Widget, n widgetNumbers, words widgetWords) {
	d.Mode = onlineModeOf(wd)
	d.Pill = d.Mode != "card"
	d.Count, d.N = number(n.Online), number(n.Online)
	if n.Online > 0 && n.Online < query.OnlineMin {
		d.Count = words.msg("few")
	}
	// Minute by minute, a handful of people is a handful of dots on a line:
	// the chart waits until the thirty minutes hold enough to hide in.
	if n.Now < query.OnlineMin || d.Mode == "pill" {
		d.Bars = nil
	}
	if d.Mode != "card" {
		d.Countries, d.Pages = nil, nil
	}
}

// onlineModeOf reads the mode out of the widget's parts.
func onlineModeOf(wd sqlite.Widget) string {
	switch {
	case wd.Has("card"):
		return "card"
	case wd.Has("spark"):
		return "spark"
	}
	return "pill"
}

// onlineSize is the frame the corner script gives a widget, in px. The
// dashboard's own table (Widgets.tsx, size) is the same one for the pasted frame.
func onlineSize(wd sqlite.Widget) (w, h int) {
	switch onlineModeOf(wd) {
	case "spark":
		return 230, 44
	case "card":
		h = 214 + 34 // the heading, the count and the chart, and the brand line
		for _, p := range []string{"pages", "countries"} {
			if wd.Has(p) {
				h += 104
			}
		}
		return 280, h
	}
	return 180, 44
}

// OnlineLook is what the corner script needs to frame one widget: its size
// and its theme. It is false for a widget that does not exist, is off, or is
// of another design: the script then answers not found, and nothing shows.
func (a *API) OnlineLook(ctx context.Context, id string) (web.OnlineLook, bool) {
	wd, err := a.Ctl.WidgetByID(ctx, id)
	if err != nil || !wd.On || wd.Kind != "online" {
		return web.OnlineLook{}, false
	}
	if _, err := a.Ctl.SiteInfo(ctx, wd.SiteID); err != nil {
		return web.OnlineLook{}, false
	}
	w, h := onlineSize(wd)
	return web.OnlineLook{ID: wd.ID, W: w, H: h, Theme: wd.Theme}, true
}
