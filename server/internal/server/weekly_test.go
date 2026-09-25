package server

import (
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/query"
)

func TestWeeklyIsDueOnceAWeekFromMondayMorning(t *testing.T) {
	berlin, _ := time.LoadLocation("Europe/Berlin")
	at := func(s string) time.Time { v, _ := time.ParseInLocation("2006-01-02 15:04", s, berlin); return v }
	mon8 := at("2026-09-21 08:00") // a Monday

	if _, _, due := weeklyDue(at("2026-09-21 07:59"), berlin, 1, 0); due {
		t.Fatal("due before Monday 08:00")
	}
	from, to, due := weeklyDue(mon8, berlin, 1, 0)
	if !due || !from.Equal(at("2026-09-14 00:00")) || !to.Equal(at("2026-09-21 00:00")) {
		t.Fatalf("Monday 08:00: due=%v %v – %v", due, from, to)
	}
	if _, _, due := weeklyDue(at("2026-09-21 09:30"), berlin, 1, mon8.Unix()); due {
		t.Fatal("sent twice in one week")
	}
	// Down all Monday: the report still goes out, for the same week.
	if from, _, due := weeklyDue(at("2026-09-24 11:00"), berlin, 1, at("2026-09-14 08:05").Unix()); !due || !from.Equal(at("2026-09-14 00:00")) {
		t.Fatalf("Thursday catch-up: due=%v from=%v", due, from)
	}
	// Sunday night belongs to the week already reported.
	if _, _, due := weeklyDue(at("2026-09-27 23:30"), berlin, 1, mon8.Unix()); due {
		t.Fatal("due again before the next Monday")
	}
	// The site's own clock decides: 08:00 in Auckland is still Sunday in Berlin.
	akl, _ := time.LoadLocation("Pacific/Auckland")
	if _, _, due := weeklyDue(time.Date(2026, 9, 20, 20, 30, 0, 0, time.UTC), akl, 1, 0); !due {
		t.Fatal("Monday 08:30 in Auckland is due")
	}
	// A site whose week starts on Sunday gets Sunday–Saturday, on Sunday.
	sun8 := at("2026-09-20 08:00")
	if _, _, due := weeklyDue(at("2026-09-20 07:59"), berlin, 0, 0); due {
		t.Fatal("due before Sunday 08:00")
	}
	if from, to, due := weeklyDue(sun8, berlin, 0, 0); !due || !from.Equal(at("2026-09-13 00:00")) || !to.Equal(at("2026-09-20 00:00")) {
		t.Fatalf("Sunday week: %v %v %v", from, to, due)
	}
}

func TestWeeklyText(t *testing.T) {
	from := time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)
	cur := &query.Result{
		KPIs: query.KPIs{Visitors: 4512, Pageviews: 10301, BounceRate: 0.45, AvgSessionS: 130},
		Dims: map[string][]query.Row{
			"channel":    {{Value: "Search", Visitors: 1203}, {Value: "AI", Visitors: 702}, {Value: "Direct", Visitors: 650}, {Value: "Email", Visitors: 10}},
			"entry_page": {{Value: "/", Visitors: 2000}, {Value: "/docs", Visitors: 900}},
		},
		Goals: []query.Row{{Value: "signup", Visitors: 312}},
		Money: &query.Money{Currency: "USD", Exponent: 2, Revenue: 421000, Payments: 38},
	}
	prev := &query.Result{KPIs: query.KPIs{Visitors: 4000}, Money: &query.Money{Revenue: 390000}}
	title, msg, data := weeklyText("demo.trckable.com", from, from.AddDate(0, 0, 7), cur, prev, "https://stats.example.com/demo.trckable.com")
	for _, want := range []string{
		"demo.trckable.com, Sep 14 – Sep 20",
		"4,512 visitors, up 13% on the week before.",
		"10,301 pageviews · bounce 45% · 2m10s a visit",
		"Top sources: Search 1,203 · AI assistants 702 · Direct 650",
		"Top pages: / 2,000 · /docs 900",
		"Top goal: signup, 312 visitors",
		"Revenue: $4,210 from 38 payments, up 8% on the week before",
		"https://stats.example.com/demo.trckable.com",
	} {
		if !strings.Contains(msg, want) {
			t.Errorf("missing %q in:\n%s", want, msg)
		}
	}
	if title != "Your week" || data["visitors"] != int64(4512) {
		t.Errorf("title %q data %v", title, data)
	}
	_, quiet, _ := weeklyText("x.com", from, from.AddDate(0, 0, 7), &query.Result{}, &query.Result{KPIs: query.KPIs{Visitors: 50}}, "")
	if !strings.Contains(quiet, "Nothing arrived this week") || !strings.Contains(quiet, "down 100%") {
		t.Errorf("an empty week says so:\n%s", quiet)
	}
}
