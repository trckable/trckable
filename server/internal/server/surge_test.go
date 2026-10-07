package server

import (
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/surge"
)

var facebookSurge = surge.Surge{
	ID: "surge_1", Site: "tkb_x", Started: time.Date(2026, 10, 6, 18, 45, 0, 0, time.UTC).Unix(), Online: 53, Usual: 20,
	Why: surge.Why{Source: "Facebook", SourceDim: "referrer", SourceValue: "l.facebook.com", SourceN: 34, SourceUsual: 2, Page: "/blog/launch-post", PageN: 30, Before: 20, Minutes: 15},
}

// The email says what was counted and nothing more: the people online, how
// many times the usual, who sent most of them, the page, and a link into the
// dashboard filtered to that source.
func TestSurgeEmailWords(t *testing.T) {
	ev := surgeEvent(facebookSurge, "shop.example.com", "https://stats.example.com/shop.example.com?f=referrer%3Al.facebook.com", time.Now(), time.UTC)
	if ev.Title != "Your site is having a moment" || ev.Kind != "surge" {
		t.Fatalf("title %q kind %q", ev.Title, ev.Kind)
	}
	for _, want := range []string{
		"Right now 53 people are on shop.example.com, about 2.7× usual for this time.",
		"34 of them came from Facebook (usually about 2).",
		"The page most of them are on is /blog/launch-post.",
		"Worth a look while it is happening.",
		"https://stats.example.com/shop.example.com?f=referrer%3Al.facebook.com",
	} {
		if !strings.Contains(ev.Message, want) {
			t.Errorf("missing %q in:\n%s", want, ev.Message)
		}
	}
	for _, never := range []string{"viral", "went", "!"} {
		if strings.Contains(ev.Message, never) {
			t.Errorf("claims too much (%q):\n%s", never, ev.Message)
		}
	}
}

// With no source or page to name, the email still says the numbers, and a
// site with no public address sends no link.
func TestSurgeEmailWithoutReasons(t *testing.T) {
	s := surge.Surge{Online: 12, Usual: 4}
	msg := surgeEvent(s, "x.com", "", time.Now(), time.UTC).Message
	if msg != "Right now 12 people are on x.com, about 3× usual for this time. Worth a look while it is happening." {
		t.Fatalf("%q", msg)
	}
}

func TestSurgeLinkIsFilteredToTheSource(t *testing.T) {
	s := newTestServer(t, config.Config{BaseURL: "https://stats.example.com/"})
	if got := s.surgeLink("shop.example.com", facebookSurge); got != "https://stats.example.com/shop.example.com?f=referrer%3Al.facebook.com" {
		t.Fatalf("%q", got)
	}
	if got := s.surgeLink("shop.example.com", surge.Surge{}); got != "https://stats.example.com/shop.example.com" {
		t.Fatalf("no source, no filter: %q", got)
	}
	if got := newTestServer(t, config.Config{}).surgeLink("shop.example.com", facebookSurge); got != "" {
		t.Fatalf("no public address, no link: %q", got)
	}
}

// One message at most every three hours, only from an enabled alert of this
// site's own: a switched-off alert, another site's and another kind's do not send.
func TestSurgeAlertIsDebouncedAndRespectsTheSwitch(t *testing.T) {
	now := time.Date(2026, 10, 6, 19, 0, 0, 0, time.UTC)
	a := sqlite.Alert{SiteID: "tkb_x", Kind: "surge", Enabled: true}
	if !surgeDue(a, "tkb_x", now) {
		t.Fatal("never sent: due")
	}
	a.LastFired = now.Add(-2 * time.Hour).Unix()
	if surgeDue(a, "tkb_x", now) {
		t.Fatal("sent two hours ago: not due")
	}
	a.LastFired = now.Add(-3 * time.Hour).Unix()
	if !surgeDue(a, "tkb_x", now) {
		t.Fatal("three hours ago: due")
	}
	off := a
	off.Enabled = false
	if surgeDue(off, "tkb_x", now) || surgeDue(a, "tkb_other", now) {
		t.Fatal("off, or another site's")
	}
	a.Kind = "spike"
	if surgeDue(a, "tkb_x", now) {
		t.Fatal("another kind")
	}
}

func TestWeeklyTellsTheBusiestMoment(t *testing.T) {
	line := surge.Busiest(facebookSurge, time.Date(2026, 10, 6, 18, 45, 0, 0, time.UTC))
	if line != "Busiest moment: Tue 18:45, 53 people online, mostly from Facebook." {
		t.Fatalf("%q", line)
	}
	from := time.Date(2026, 10, 5, 0, 0, 0, 0, time.UTC)
	cur := &query.Result{KPIs: query.KPIs{Visitors: 900, Pageviews: 2000}}
	prev := &query.Result{KPIs: query.KPIs{Visitors: 800}}
	_, msg, _ := weeklyText("x.com", from, from.AddDate(0, 0, 7), cur, prev, aiWeek{}, line, "")
	if !strings.Contains(msg, line) {
		t.Fatalf("the report leaves it out:\n%s", msg)
	}
	if _, msg, _ = weeklyText("x.com", from, from.AddDate(0, 0, 7), cur, prev, aiWeek{}, "", ""); strings.Contains(msg, "Busiest") {
		t.Fatalf("no surge, no line:\n%s", msg)
	}
}

// The designed email: the number, the ratio, the rows with a long page cut
// from the start, the button and the footer; every name escaped.
func TestSurgeEmailCard(t *testing.T) {
	sg := facebookSurge
	sg.Why.Page = "/blog/" + strings.Repeat("kualifikimi-", 5) + "<script>alert(1)</script>"
	ev := surgeEvent(sg, "shop.example.com", "https://stats.example.com/shop.example.com", time.Now(), time.UTC)
	if ev.Subject != "shop.example.com is having a moment" || ev.Card == nil {
		t.Fatalf("subject %q card %v", ev.Subject, ev.Card)
	}
	h := ev.Card.HTML("https://stats.example.com/u/a.sig", "https://stats.example.com/settings?site=tkb_x&tab=alerts")
	for _, want := range []string{"53 people", "2.7×", "what&#39;s usual at this time", "From Facebook", "34 (usually 2)", "…", "&lt;/script&gt;", "6:45 PM", "Open Live →", "Stop these alerts", "Alert settings"} {
		if !strings.Contains(h, want) {
			t.Errorf("missing %q", want)
		}
	}
	if strings.Contains(h, "<script>") || strings.Contains(h, "/blog/kualifikimi-kualifikimi") {
		t.Error("unescaped or not shortened")
	}
}
