package server

import (
	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/mailkit"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/reports"
	"github.com/trckable/trckable/server/internal/store/sqlite"
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
func TestWeeklyEmail(t *testing.T) {
	from, cur, prev := weeklySample()
	link := "https://stats.example.com/demo.trckable.com?from=2026-09-28&to=2026-10-04&compare=previous"
	cur.Series = []query.Point{{T: "2026-09-28", Visitors: 600}, {T: "2026-09-29", Visitors: 900}, {T: "2026-09-30", Visitors: 700}}
	page := weeklyPage(weeklyEmail("demo.trckable.com", from, from.AddDate(0, 0, 7), cur, prev, aiWeek{Visitors: 702}, "Busiest: Tuesday", link, weeklyMentions(weekMentionSample(), "https://stats.example.com/demo.trckable.com/mentions"), ""), "https://stats.example.com/u/abc.def")
	for _, want := range []string{
		"cid:logo@report", "Your week", "demo.trckable.com", "Sep 28 – Oct 4",
		"Visitors", "4,512", "up 13%", "Pageviews", "Bounce rate", "45%", "Visit length", "2m 10s",
		"Top sources", "AI assistants", "Top pages",
		"AI assistants sent 702 visitors.", "Busiest: Tuesday",
		"Who talked about you", "Show HN: first", "1,240", "+1 more", `href="https://news.ycombinator.com/item?id=1"`, `href="https://stats.example.com/demo.trckable.com/mentions"`, "Open your week", `href="https://stats.example.com/demo.trckable.com?from=2026-09-28&amp;to=2026-10-04&amp;compare=previous"`,
		`href="https://stats.example.com/u/abc.def"`, "Stop receiving this report",
		"prefers-color-scheme:dark", `width="600"`, "max-width:600px", "Visitors per day", "Mon", "Tue",
	} {
		if !strings.Contains(page, want) {
			t.Errorf("missing %q", want)
		}
	}
	if strings.Contains(page, "<b>docs</b>") || strings.Contains(page, "with-more-segments") || !strings.Contains(page, "…") {
		t.Errorf("paths are escaped and long ones are cut with an ellipsis")
	}
	if strings.Contains(page, "<script") || strings.Count(page, "v:roundrect") != 2 || strings.Count(page, `class="hot"`) < 1+6 {
		t.Errorf("one button, no script, the best day and the bars lit")
	}
	if strings.Contains(quiet0(from, prev), "Who talked about you") {
		t.Errorf("a week with no mention has no mentions section")
	}
	// No address, no button; a week with nobody says so.
	quiet := weeklyPage(weeklyEmail("x.com", from, from.AddDate(0, 0, 7), &query.Result{}, prev, aiWeek{}, "", "", reports.Weekly{}, ""), "")
	if strings.Contains(quiet, "Open your week") || strings.Contains(quiet, "Stop receiving") || !strings.Contains(quiet, "No visitors arrived") {
		t.Errorf("a quiet week without links:\n%s", quiet)
	}
}

// weeklyPage is the weekly email as it is sent, with its stop link.
func weeklyPage(m *mailkit.Email, stop string) string {
	return alerts.Compose(alerts.Event{Title: "Your week", Unsubscribe: stop, Email: m}).HTML
}

func weekMentionSample() []sqlite.Mention {
	return []sqlite.Mention{
		{Source: "news", Host: "blog.example.org", URL: "https://blog.example.org/a", Title: "A small thanks", Visitors: 12},
		{Source: "hn", URL: "https://news.ycombinator.com/item?id=1", Title: "Show HN: first", Visitors: 1240},
		{Source: "ph", URL: "https://www.producthunt.com/posts/x", Title: "Launch day", Visitors: 300},
		{Source: "hn", URL: "https://news.ycombinator.com/item?id=2", Title: "Ask HN: none came", Visitors: 0},
		{Source: "news", Host: "other.example.org", URL: "https://other.example.org/b", Title: "Another", Visitors: 3},
	}
}

func quiet0(from time.Time, prev *query.Result) string {
	cur := &query.Result{KPIs: query.KPIs{Visitors: 10, Pageviews: 20}}
	return weeklyPage(weeklyEmail("x.com", from, from.AddDate(0, 0, 7), cur, prev, aiWeek{}, "", "", weeklyMentions([]sqlite.Mention{{Source: "hn", Title: "none", Visitors: 0}}, ""), ""), "")
}

// The section keeps the three that brought the most, counts the rest that
// brought anything, and leaves out the ones that brought nobody.
func TestWeeklyMentionsPicksTheTop(t *testing.T) {
	x := weeklyMentions(weekMentionSample(), "https://x/y/mentions")
	if len(x.Mentions) != 3 || x.MentionsMore != 1 || x.MentionsLink != "https://x/y/mentions" {
		t.Fatalf("got %d shown, %d more, link %q", len(x.Mentions), x.MentionsMore, x.MentionsLink)
	}
	if x.Mentions[0].Title != "Show HN: first" || x.Mentions[1].Title != "Launch day" || x.Mentions[2].Visitors != 12 {
		t.Errorf("most visitors first: %+v", x.Mentions)
	}
	if x.Mentions[0].Mark.Letter != "Y" || x.Mentions[0].Source != "Hacker News" || x.Mentions[2].Source != "blog.example.org" {
		t.Errorf("source marks: %+v", x.Mentions)
	}
	if got := weeklyMentions(nil, ""); len(got.Mentions) != 0 || got.MentionsMore != 0 {
		t.Errorf("no mentions, no section: %+v", got)
	}
}
