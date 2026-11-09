package api

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/query"
)

// The pill's words for a preset, a custom range and all time, and where each
// one ends: on the last full day, never the day still running.
func TestResolvePeriod(t *testing.T) {
	now := time.Date(2026, 11, 9, 15, 30, 0, 0, time.UTC)
	made := time.Date(2025, 3, 14, 8, 0, 0, 0, time.UTC)
	for _, c := range []struct {
		name, from, to, label, vs string
		days                      int
		compare                   bool
	}{
		{"30d", "", "", "10 Oct – 8 Nov 2026", "previous 30 days", 30, true},
		{"7d", "", "", "2 Nov – 8 Nov 2026", "", 7, false},
		{"24h", "", "", "Last 24 hours", "previous 24 hours", 0, true},
		{"all", "", "", "Since Mar 2025", "", 0, true},
		{"custom", "2026-12-28", "2027-01-03", "2 Nov – 8 Nov 2026", "previous 7 days", 7, true}, // not yet: falls back to a 7-day preset
		{"custom", "2025-12-28", "2026-01-03", "28 Dec 2025 – 3 Jan 2026", "previous 7 days", 7, true},
		{"custom", "2026-11-01", "2026-11-20", "1 Nov – 8 Nov 2026", "previous 8 days", 8, true}, // cut back to yesterday
		{"custom", "2026-11-05", "2026-11-05", "5 Nov 2026", "previous day", 1, true},
		{"nope", "", "", "2 Nov – 8 Nov 2026", "", 7, false},
	} {
		p := resolvePeriod(c.name, c.from, c.to, now, made, c.compare)
		if p.label != c.label || p.vs != c.vs || (c.days > 0 && p.days != c.days) {
			t.Errorf("%+v: %q vs %q, %d days", c, p.label, p.vs, p.days)
		}
		if p.hours == 0 && !p.to.Before(time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC)) {
			t.Errorf("%+v ends on %s, the day still running", c, p.to)
		}
	}
	// All time has nothing before it: no comparison, even when asked.
	if p := resolvePeriod("all", "", "", now, made, true); p.vs != "" {
		t.Errorf("all time compares: %q", p.vs)
	}
}

// The comparison: its sign, its words and its pill's colour, for each metric that has a before.
func TestCardChange(t *testing.T) {
	res := &query.Result{KPIs: query.KPIs{Visitors: 124, Pageviews: 300, Sessions: 100, BounceRate: 0.5}}
	before := &query.Result{KPIs: query.KPIs{Visitors: 100, Pageviews: 400, Sessions: 100, BounceRate: 0.5}}
	for metric, want := range map[string]string{"visitors": "+24% vs previous 30 days", "pageviews": "-25% vs previous 30 days", "engaged": ""} {
		n := cardWordsOf(res, "example.com", cardPeriodOf("30d"), metric)
		n.vs = "previous 30 days"
		n.overview(res, before, "", noIcon)
		if n.change != want {
			t.Errorf("%s: %q, want %q", metric, n.change, want)
		}
	}
	// No comparison asked (no before): no pill.
	n := cardWordsOf(res, "example.com", cardPeriodOf("30d"), "visitors")
	n.overview(res, nil, "", noIcon)
	if n.change != "" || n.dir != 0 {
		t.Errorf("no comparison asked: %+v", n)
	}
	up, down := cards.Spec{Theme: cards.Themes["dark"], Change: "+24%", Dir: 1}, cards.Spec{Theme: cards.Themes["dark"], Change: "-5%", Dir: -1}
	if !strings.Contains(string(mustSVG(t, up)), cards.Themes["dark"].Up) || !strings.Contains(string(mustSVG(t, down)), cards.Themes["dark"].Down) {
		t.Error("a rise is not green, or a fall not red")
	}
}

func mustSVG(t *testing.T, s cards.Spec) []byte {
	t.Helper()
	s.Template = "overview"
	b, err := s.SVG()
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// The route takes all time, a custom range and the comparison; a bad range is the default, never an error.
func TestCardRoutePeriods(t *testing.T) {
	g := newRig(t)
	noOutbound(t, g)
	owner := client()
	g.setup(t, owner)
	card := g.srv.URL + "/api/v1/sites/" + g.site + "/card"
	for _, q := range []string{"?period=all", "?period=all&compare=1", "?period=custom&from=2026-01-01&to=2026-01-31&compare=1", "?period=custom&from=x&to=y", "?period=30d&compare=1&theme=light", "?period=24h&compare=1"} {
		if code, ct, body := get(t, owner, card+q); code != http.StatusOK || ct != "image/png" || !strings.HasPrefix(body, "\x89PNG") {
			t.Fatalf("%s: %d %s", q, code, ct)
		}
	}
}
