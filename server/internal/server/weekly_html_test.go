package server

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/query"
)

func weeklySample() (from time.Time, cur, prev *query.Result) {
	from = time.Date(2026, 9, 28, 0, 0, 0, 0, time.UTC)
	cur = &query.Result{
		KPIs: query.KPIs{Visitors: 4512, Pageviews: 10301, BounceRate: 0.45, AvgSessionS: 130},
		Dims: map[string][]query.Row{
			"channel":    {{Value: "Search", Visitors: 1203}, {Value: "AI", Visitors: 702}, {Value: "Direct", Visitors: 650}},
			"entry_page": {{Value: "/", Visitors: 2000}, {Value: "/blog/a-very-long-path-that-keeps-going-and-going-on-and-on/with-more-segments-after-it?utm=x", Visitors: 900}, {Value: "/<b>docs</b>", Visitors: 90}},
		},
		NewReferrers: []query.NewReferrer{{Referrer: "news.ycombinator.com", Visitors: 120}},
	}
	prev = &query.Result{KPIs: query.KPIs{Visitors: 4000, Pageviews: 9000}}
	return from, cur, prev
}

// The weekly email is a designed HTML page with the plain text beside it:
// tiles with their change, bars for the lists, one button, the stop link.
func TestWeeklyHTML(t *testing.T) {
	from, cur, prev := weeklySample()
	link := "https://stats.example.com/demo.trckable.com?from=2026-09-28&to=2026-10-04&compare=previous"
	page := weeklyHTML("demo.trckable.com", from, from.AddDate(0, 0, 7), cur, prev, aiWeek{Visitors: 702}, "Busiest: Tuesday", link)("https://stats.example.com/u/abc.def")
	for _, want := range []string{
		"cid:logo@report", "Your week", "demo.trckable.com", "Sep 28 – Oct 4",
		"Visitors", "4,512", "up 13%", "Pageviews", "Bounce rate", "45%", "Visit length", "2m 10s",
		"Top sources", "AI assistants", "Top pages",
		"AI assistants sent 702 visitors.", "Busiest: Tuesday",
		"Open your week", `href="https://stats.example.com/demo.trckable.com?from=2026-09-28&amp;to=2026-10-04&amp;compare=previous"`,
		`href="https://stats.example.com/u/abc.def"`, "Stop receiving this report",
		"prefers-color-scheme:dark", `width="600"`, "max-width:600px",
	} {
		if !strings.Contains(page, want) {
			t.Errorf("missing %q", want)
		}
	}
	if strings.Contains(page, "<b>docs</b>") || strings.Contains(page, "with-more-segments") || !strings.Contains(page, "…") {
		t.Errorf("paths are escaped and long ones are cut with an ellipsis")
	}
	if strings.Contains(page, "<script") || strings.Count(page, `class="tk-btn"`) != 1 {
		t.Errorf("one button, no script")
	}
	if os.Getenv("WEEKLY_HTML_OUT") != "" {
		if err := os.WriteFile(os.Getenv("WEEKLY_HTML_OUT"), []byte(page), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	// No address, no button; a week with nobody says so.
	quiet := weeklyHTML("x.com", from, from.AddDate(0, 0, 7), &query.Result{}, prev, aiWeek{}, "", "")("")
	if strings.Contains(quiet, "Open your week") || strings.Contains(quiet, "Stop receiving") || !strings.Contains(quiet, "No visitors arrived") {
		t.Errorf("a quiet week without links:\n%s", quiet)
	}
}
