package milestones

import (
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// clickDays builds n days of Google clicks from start, each with c.
func clickDays(start string, n int, c float64) []ClickDay {
	t0, _ := time.Parse(time.DateOnly, start)
	out := make([]ClickDay, n)
	for i := range out {
		out[i] = ClickDay{Day: t0.AddDate(0, 0, i).Format(time.DateOnly), Clicks: c}
	}
	return out
}

// The reading is the clicks of the 28 days ending that day; a day Google has
// no row for counts as none, and the last day is the data's own.
func TestSearchWindowIsTwentyEightDays(t *testing.T) {
	win := windowed(clickDays("2026-01-01", 40, 10))
	if len(win) != 40 || win[0].Clicks != 10 || win[27].Clicks != 280 || win[28].Clicks != 280 || win[39].Day != "2026-02-09" {
		t.Fatalf("window: first %v, 28th %v, 29th %v, last %v", win[0], win[27], win[28], win[39])
	}
	gap := windowed([]ClickDay{{Day: "2026-01-01", Clicks: 5}, {Day: "2026-01-04", Clicks: 7}})
	if len(gap) != 4 || gap[2].Clicks != 5 || gap[3].Clicks != 12 {
		t.Fatalf("gap: %+v", gap)
	}
}

// Steps are dated by the first day the 28-day reading reaches them, and the
// ladder is Google's: every thousand up to 10K, then 25K.
func TestSearchClicksSteps(t *testing.T) {
	got := keys(searchCrossings(clickDays("2026-01-01", 60, 40))) // 28 days at 40 = 1,120
	if got["search_clicks/100"].Day != "2026-01-03" || got["search_clicks/1000"].Day != "2026-01-25" || len(got) != 4 {
		t.Fatalf("crossings: %+v", got)
	}
	if _, ok := got["search_clicks/2500"]; ok {
		t.Fatalf("a step the reading never reached: %+v", got)
	}
	want := []float64{100, 250, 500, 1_000, 2_500, 5_000, 6_000, 7_000, 8_000, 9_000, 10_000, 25_000}
	for i, v := range want {
		if Steps[SearchClicks][i] != v {
			t.Fatalf("step %d is %v, want %v", i, Steps[SearchClicks][i], v)
		}
	}
	// A reading that falls back keeps what it reached.
	dip := append(clickDays("2026-01-01", 28, 40), clickDays("2026-01-29", 28, 0)...)
	if k := keys(searchCrossings(dip)); k["search_clicks/1000"].Day == "" {
		t.Fatalf("a reached step was lost: %+v", k)
	}
}

// Not connected means no clicks, so no family and no next step.
func TestSearchClicksNeedSearchConsole(t *testing.T) {
	h := days("2026-01-01", 10, 50)
	for _, fam := range Reached(h, "", nil) {
		for _, m := range fam {
			if m.Kind == SearchClicks {
				t.Fatalf("a search milestone without Search Console: %+v", m)
			}
		}
	}
	for _, n := range NextSteps(h, "", "2026-01-11", nil) {
		if n.Kind == SearchClicks {
			t.Fatalf("a next search step without Search Console: %+v", n)
		}
	}
}

// The next step says where the reading stands on the data's last day and how
// fast the reading itself is growing, not the daily average.
func TestSearchClicksNext(t *testing.T) {
	clicks := append(clickDays("2026-01-01", 28, 10), clickDays("2026-01-29", 28, 20)...)
	var got Next
	for _, n := range NextSteps(nil, "", "2026-03-01", clicks) {
		if n.Kind == SearchClicks {
			got = n
		}
	}
	// 28 days at 20 = 560 on the last day, 280 a window earlier: 10 a day of growth.
	if got.Step != 1000 || got.Now != 560 || got.PerDay != 10 {
		t.Fatalf("next: %+v", got)
	}
	level := clickDays("2026-01-01", 90, 10)
	for _, n := range NextSteps(nil, "", "2026-04-01", level) {
		if n.Kind == SearchClicks && n.PerDay != 0 {
			t.Fatalf("a level reading has a pace: %+v", n)
		}
	}
}

// AI visits add up from each day's visitors the assistants sent.
func TestAIVisitsSteps(t *testing.T) {
	h := days("2026-01-01", 30, 40)
	for i := range h {
		h[i].AI = 3
	}
	got := keys(crossings(AIVisits, h, func(d Day) float64 { return d.AI }, ""))
	if got["ai_visits/10"].Day != "2026-01-04" || got["ai_visits/50"].Day != "2026-01-17" || len(got) != 2 {
		t.Fatalf("crossings: %+v", got)
	}
	for _, n := range NextSteps(days("2026-01-01", 5, 40), "", "2026-01-06", nil) {
		if n.Kind == AIVisits {
			t.Fatalf("a ladder for a site no assistant sent anyone to: %+v", n)
		}
	}
}

// The first run marks every passed step with its real date but tells only
// the newest; a run later tells what is new, and a family met for the first
// time on a site long since checked is looked back over the same way.
func TestSearchAndAIFirstRunNotifiesOnce(t *testing.T) {
	clicks := clickDays("2025-12-01", 120, 60) // reaches 100, 250, 500, 1,000 (and 1,680 at the end)
	h := days("2025-12-01", 120, 40)
	for i := range h {
		h[i].AI = 2
	}
	loud := func(plan []sqlite.Milestone) map[string]int {
		n := map[string]int{}
		for _, m := range plan {
			if !m.Quiet {
				n[m.Kind]++
			}
		}
		return n
	}
	first := Plan(Reached(h, "", clicks), "", nil)
	if l := loud(first); l[SearchClicks] != 1 || l[AIVisits] != 1 {
		t.Fatalf("first run tells %v", l)
	}
	k := keys(first)
	if k["search_clicks/1000"].Quiet || !k["search_clicks/500"].Quiet || k["search_clicks/500"].Day == "" {
		t.Fatalf("first run: %+v", k)
	}
	// A site long since checked, meeting the families for the first time.
	late := Plan(Reached(h, "", clicks), h[118].Day, map[string]bool{Visitors: true})
	if l := loud(late); l[SearchClicks] != 1 || l[AIVisits] != 1 {
		t.Fatalf("a long-checked site's first look tells %v", l)
	}
	// Stored families: what is new is told, and a lagged day (older than the
	// day checked) is still told; AI visits follow the checked day.
	more := append(clicks, clickDays("2026-03-31", 60, 300)...)
	stored := map[string]bool{SearchClicks: true, AIVisits: true}
	again := Plan(Reached(h, "", more), h[118].Day, stored)
	l := loud(again)
	if l[AIVisits] != 0 || l[SearchClicks] == 0 {
		t.Fatalf("steady state tells %v", l)
	}
}

// The words and the ladder of a card, the bell and the email.
func TestSearchAndAIWords(t *testing.T) {
	s := Say(sqlite.Milestone{Kind: SearchClicks, Value: 8000, Day: "2026-09-14"}, false)
	if s.Line() != "8,000 Google Search clicks · 28 days" {
		t.Fatalf("search: %q", s.Line())
	}
	a := Say(sqlite.Milestone{Kind: AIVisits, Value: 250, Day: "2026-09-14"}, false)
	if a.Line() != "250 visits from AI assistants" {
		t.Fatalf("ai: %q", a.Line())
	}
	c := Card(sqlite.Milestone{Kind: SearchClicks, Value: 8000, Day: "2026-09-14"}, "", "demo.trckable.com", "dark", false)
	if c.Big != "8,000" || c.Label != "Google Search clicks · 28 days" {
		t.Fatalf("card: %q / %q", c.Big, c.Label)
	}
	if !Celebrated(SearchClicks, 7000) || !Celebrated(AIVisits, 50) || Money(SearchClicks) || Money(AIVisits) {
		t.Fatal("every step of both families is celebrated and neither is money")
	}
	if !Bigger(sqlite.Milestone{Kind: Visitors}, sqlite.Milestone{Kind: SearchClicks}) || !Bigger(sqlite.Milestone{Kind: SearchClicks}, sqlite.Milestone{Kind: Countries}) {
		t.Fatal("search clicks rank under visitors and over countries")
	}
	h, _ := Email(sqlite.Milestone{Kind: SearchClicks, Value: 1000, Day: "2026-09-14"}, nil, "demo.trckable.com", "")
	if h != "demo.trckable.com just passed 1,000 Google Search clicks · 28 days 🎉" {
		t.Fatalf("headline %q", h)
	}
}
