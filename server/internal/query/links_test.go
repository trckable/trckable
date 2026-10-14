package query

import (
	"context"
	"testing"

	"github.com/trckable/trckable/server/internal/event"
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
