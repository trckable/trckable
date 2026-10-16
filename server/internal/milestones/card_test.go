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
	c := Card(m, "", "demo.trckable.com", "dark", true)
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
	v := Card(sqlite.Milestone{Kind: Visitors, Value: 10000, Day: "2026-09-14"}, "", "demo.trckable.com", "dark", false)
	if v.Big != "10,000" || v.Label != "visitors" {
		t.Fatalf("big %q, label %q", v.Big, v.Label)
	}
}

// With the amount hidden the hero is "Revenue milestone reached", the growth
// line sits under it and no digit of the amount is drawn; shown, the amount leads.
func TestCardHidesTheAmount(t *testing.T) {
	m := sqlite.Milestone{Kind: Revenue, Value: 7500, Currency: "USD", Day: "2026-09-14"}
	list := []sqlite.Milestone{{Kind: FirstSale, Value: 1, Day: "2026-08-27"}, m}
	ctx := Context(m, list)
	if ctx != "18 days after the first sale" {
		t.Fatalf("context %q", ctx)
	}
	hidden, err := Card(m, ctx, "demo.trckable.com", "dark", false).SVG()
	if err != nil {
		t.Fatal(err)
	}
	h := string(hidden)
	for _, want := range []string{"Revenue milestone reached", ctx, "Sep 14, 2026"} {
		if !strings.Contains(h, want) {
			t.Fatalf("the hidden card lacks %q", want)
		}
	}
	for _, bad := range []string{"7,500", "7500", "$"} {
		if strings.Contains(h, bad) {
			t.Fatalf("the hidden card shows %q", bad)
		}
	}
	shown, err := Card(m, ctx, "demo.trckable.com", "dark", true).SVG()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(shown), ">$7,500<") {
		t.Fatal("the shown card lacks the amount")
	}
	if got := Context(sqlite.Milestone{Kind: Revenue, Value: 100, Day: "2026-09-14"}, nil); got != "" {
		t.Fatalf("context %q without a first sale", got)
	}
}

func TestEmailCardCelebrates(t *testing.T) {
	m := sqlite.Milestone{Kind: Pageviews, Step: "10000", Value: 10000, Day: "2026-10-15"}
	list := []sqlite.Milestone{m, {Kind: Pageviews, Step: "1", Value: 1, Day: "2026-08-29"}}
	c := EmailCard(m, list, "shop.example", "https://stats.example.com/")
	if c.Headline != "shop.example just passed 10,000 pageviews 🎉" || c.Big != "10,000" || c.Unit != "pageviews" {
		t.Errorf("card = %+v", c)
	}
	if c.Sub != "It took 47 days from the first visit" || c.Next != "Next up: 25,000" {
		t.Errorf("context = %q, next = %q", c.Sub, c.Next)
	}
	if c.Link != "https://stats.example.com/shop.example" || c.CTA != "Open shop.example" {
		t.Errorf("button = %q %q", c.CTA, c.Link)
	}
	for _, want := range []string{c.Headline, "It took 47 days", "Next up: 25,000", "Open shop.example: https://"} {
		if !strings.Contains(c.Plain, want) {
			t.Errorf("plain text misses %q:\n%s", want, c.Plain)
		}
	}
}

func TestEmailCardInventsNothing(t *testing.T) {
	m := sqlite.Milestone{Kind: FirstSale, Step: "1", Value: 1, Day: "2026-10-15"}
	c := EmailCard(m, nil, "shop.example", "")
	if c.Sub != "Reached on 15 Oct 2026" || c.Next != "" || c.Link != "" {
		t.Errorf("card = %+v", c)
	}
	r := EmailCard(sqlite.Milestone{Kind: Revenue, Value: 5000, Currency: "USD", Day: "2026-10-15"}, nil, "shop.example", "")
	if strings.Contains(r.Big+r.Headline+r.Plain, "5,000") || r.Next != "" {
		t.Errorf("an amount leaked: %+v", r)
	}
}
