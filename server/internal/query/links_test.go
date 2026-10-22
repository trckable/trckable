package query

import (
	"context"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/ledger"
)

func linkOf(ls []Link, dim, value string) *Link {
	for i := range ls {
		if ls[i].Dim == dim && ls[i].Value == value {
			return &ls[i]
		}
	}
	return nil
}

func TestLinksCountATagWithItsSite(t *testing.T) {
	refs := []string{"trustmrr", "trustmrr.com", "trustmrr.com", "friend", "news.ycombinator.com", ""}
	srcs := []string{"", "", "", "", "", "newsletter"}
	q := visitsQ(t, len(refs), func(i int, e *event.Event) { e.RefHost, e.UTMSource = refs[i], srcs[i] })
	ls, err := q.Links(context.Background(), sep10)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "rows", len(ls), 3)
	if l := linkOf(ls, "referrer", "trustmrr.com"); l == nil || l.Visitors != 3 {
		t.Fatalf("tag and site are one link of 3, got %+v", ls)
	}
	if l := linkOf(ls, "referrer", "friend"); l == nil || l.Visitors != 1 {
		t.Fatalf("a tag whose site never came stays itself, got %+v", ls)
	}
	l := linkOf(ls, "source", "newsletter")
	if l == nil || l.Visitors != 1 {
		t.Fatalf("utm_source is a link, got %+v", ls)
	}
	if linkOf(ls, "referrer", "news.ycombinator.com") != nil {
		t.Fatal("a plain site with no tag is not a link")
	}
	eq(t, "busiest first", ls[0].Value, "trustmrr.com")
	eq(t, "spark days", len(l.Spark), linkSparkDays)
	eq(t, "spark today", l.Spark[linkSparkDays-1], int64(1))
	if l.Last == 0 {
		t.Fatal("last visit missing")
	}
}

func TestLinksFollowTheFilter(t *testing.T) {
	q := visitsQ(t, 2, func(i int, e *event.Event) {
		e.RefHost = "promo"
		e.Country = []string{"US", "DE"}[i]
	})
	p := sep10
	p.Filters = []Filter{{Dim: "country", Value: "DE"}}
	ls, err := q.Links(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	if l := linkOf(ls, "referrer", "promo"); len(ls) != 1 || l.Visitors != 1 {
		t.Fatalf("only the German visit counts, got %+v", ls)
	}
}

func TestLinksFoldARefAndAUtmSourceOfTheSameName(t *testing.T) {
	refs := []string{"newsletter", "newsletter", "", "", "", "other"}
	srcs := []string{"", "", "newsletter", "Newsletter", "solo", ""}
	q := visitsQ(t, len(refs), func(i int, e *event.Event) { e.RefHost, e.UTMSource = refs[i], srcs[i] })
	ls, err := q.Links(context.Background(), sep10)
	if err != nil {
		t.Fatal(err)
	}
	if l := linkOf(ls, "referrer", "newsletter"); l == nil || l.Visitors != 4 {
		t.Fatalf("?ref and ?utm_source newsletter are one link of 4, got %+v", ls)
	}
	if linkOf(ls, "source", "newsletter") != nil || linkOf(ls, "source", "Newsletter") != nil {
		t.Fatalf("no second newsletter row, got %+v", ls)
	}
	if l := linkOf(ls, "source", "solo"); l == nil || l.Visitors != 1 {
		t.Fatalf("a utm_source with no ref of its name stays itself, got %+v", ls)
	}
	var sum, spark int64
	for _, l := range ls {
		sum += l.Visitors
		for _, n := range l.Spark {
			spark += n
		}
	}
	eq(t, "all visitors counted once", sum, int64(len(refs)))
	eq(t, "spark adds up", spark, int64(len(refs)))
}

func TestLinksTapAndRevenueFoldBothSpellings(t *testing.T) {
	refs := []string{"newsletter", "", "newsletter", "other"}
	srcs := []string{"", "Newsletter", "", ""}
	q := visitsQ(t, len(refs), func(i int, e *event.Event) { e.RefHost, e.UTMSource = refs[i], srcs[i] })
	base := time.Date(2026, 9, 10, 15, 0, 0, 0, time.UTC)
	facts := []ledger.Fact{
		{Provider: "stripe", ID: "p1", PaidAt: base, Amount: 5000, Visitor: 1, Customer: "c1", Kind: "one_time", Converted: true},
		{Provider: "stripe", ID: "p2", PaidAt: base.Add(time.Minute), Amount: 2000, Visitor: 2, Customer: "c2", Kind: "one_time", Converted: true},
		{Provider: "stripe", ID: "p4", PaidAt: base.Add(2 * time.Minute), Amount: 900, Visitor: 4, Customer: "c4", Kind: "one_time", Converted: true},
	}
	q.Payments = func(context.Context, string, string, time.Time, time.Time, bool) ([]ledger.Fact, bool, error) {
		return facts, true, nil
	}
	ctx := context.Background()
	ls, err := q.Links(ctx, sep10)
	if err != nil {
		t.Fatal(err)
	}
	row := linkOf(ls, "referrer", "newsletter")
	if row == nil || row.Visitors != 3 || row.Key != "newsletter" {
		t.Fatalf("one newsletter row of 3, got %+v", ls)
	}
	// The tap: the row's own filter finds the same visitors.
	p := sep10
	p.Filters = []Filter{{Dim: "link", Value: row.Key}}
	tapped, err := q.Links(ctx, p)
	if err != nil {
		t.Fatal(err)
	}
	if l := linkOf(tapped, "referrer", "newsletter"); len(tapped) != 1 || l == nil || l.Visitors != row.Visitors {
		t.Fatalf("tapped filter must show the row's %d visitors, got %+v", row.Visitors, tapped)
	}
	// The revenue: both spellings summed.
	p = sep10
	p.Bucket, p.Currency, p.Revenue, p.LinkRevenue = "hour", "USD", true, true
	res, err := q.Report(ctx, p)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]int64{}
	for _, d := range res.RevenueDims["link"] {
		got[d.Value] = *d.Revenue
	}
	eq(t, "newsletter revenue is both spellings", got["newsletter"], int64(7000))
	eq(t, "other revenue", got["other"], int64(900))
}

// Every row and the filter its tap applies are one predicate: the tapped count
// is the row's, including a site that sent plain visits with no ?ref tag seen.
func TestLinksTapCountsEqualRowCounts(t *testing.T) {
	refs := []string{"trustmrr.com", "trustmrr.com", "", "tagged", "tagged.com", "", "news.ycombinator.com"}
	srcs := []string{"", "", "TrustMRR", "", "", "tagged", "hn"}
	q := visitsQ(t, len(refs), func(i int, e *event.Event) { e.RefHost, e.UTMSource = refs[i], srcs[i] })
	ctx := context.Background()
	ls, err := q.Links(ctx, sep10)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "rows", len(ls), 3)
	for _, l := range ls {
		p := sep10
		p.Filters = []Filter{{Dim: "link", Value: l.Key}}
		tapped, err := q.Links(ctx, p)
		if err != nil {
			t.Fatal(err)
		}
		var sum int64
		for _, x := range tapped {
			sum += x.Visitors
		}
		if len(tapped) != 1 || sum != l.Visitors {
			t.Fatalf("row %s/%s counts %d, its tap shows %+v", l.Dim, l.Value, l.Visitors, tapped)
		}
	}
	if l := linkOf(ls, "source", "trustmrr"); l == nil || l.Visitors != 1 {
		t.Fatalf("utm_source trustmrr is 1 visitor; the plain trustmrr.com visits are no link, got %+v", ls)
	}
}
