package api

import (
	"context"
	"testing"

	"github.com/trckable/trckable/server/internal/writer"
)

// The report says how many bots were turned away for its days, straight from
// the counters: a flush shows at once, even where the report itself is cached.
// Under a filter the number is left out, as it is not about that slice.
func TestReportCarriesTheBotsFiltered(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	url := g.srv.URL + "/api/v1/sites/" + g.site + "/report?from=2026-09-10&to=2026-09-11"
	bots := func(q string) map[string]any {
		t.Helper()
		code, out := do(t, c, "GET", url+q, "")
		if code != 200 {
			t.Fatalf("report: %d %v", code, out)
		}
		b, _ := out["bots"].(map[string]any)
		return b
	}
	if b := bots(""); b["total"].(float64) != 0 {
		t.Fatalf("before any: %v", b)
	}
	err := g.w.AddBots(context.Background(), []writer.BotDay{
		{Site: g.site, Day: "2026-09-10", Kind: "bot", N: 7},
		{Site: g.site, Day: "2026-09-11", Kind: "ai-crawler", N: 3},
		{Site: g.site, Day: "2026-09-12", Kind: "bot", N: 99},
	})
	if err != nil {
		t.Fatal(err)
	}
	b := bots("")
	if b["total"].(float64) != 10 || b["kinds"].(map[string]any)["ai-crawler"].(float64) != 3 {
		t.Fatalf("after a flush: %v", b)
	}
	if b := bots("&f=channel:Search"); b != nil {
		t.Fatalf("a filtered report carries the site's bots: %v", b)
	}
}
