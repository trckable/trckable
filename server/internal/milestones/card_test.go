package milestones

import (
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The share image leads with the number, in the milestone's colour, and the
// word under it is small: the word never stands in for the number.
func TestCardCarriesTheNumber(t *testing.T) {
	m := sqlite.Milestone{Kind: Revenue, Value: 1000, Currency: "USD", Day: "2026-09-14"}
	c := Card(m, "demo.trckable.com", "dark", true)
	if c.Big != "$1,000" || c.Label != "revenue milestone" {
		t.Fatalf("big %q, label %q", c.Big, c.Label)
	}
	svg, err := c.SVG()
	if err != nil {
		t.Fatal(err)
	}
	s := string(svg)
	for _, want := range []string{">$1,000<", "revenue milestone", "demo.trckable.com", "Sep 14, 2026", cards.Themes["dark"].Money} {
		if !strings.Contains(s, want) {
			t.Fatalf("the card lacks %q", want)
		}
	}
	v := Card(sqlite.Milestone{Kind: Visitors, Value: 10000, Day: "2026-09-14"}, "demo.trckable.com", "dark", false)
	if v.Big != "10,000" || v.Label != "visitors" {
		t.Fatalf("big %q, label %q", v.Big, v.Label)
	}
}
