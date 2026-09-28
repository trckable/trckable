package query

import (
	"context"
	"testing"
	"time"
)

// A country's first visit ever, by the hour, only when it falls in the range.
func TestCountryFirsts(t *testing.T) {
	q := golden(t, false)
	ctx := context.Background()
	got, err := q.CountryFirsts(ctx, "s1", "UTC", sep10.From, sep10.To, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0] != (CountryFirst{"DE", "2026-09-10T10:00"}) || got[1] != (CountryFirst{"US", "2026-09-10T11:00"}) {
		t.Fatalf("got %+v", got)
	}
	// GB came on Sep 11: first then, and DE is not new that day.
	got, _ = q.CountryFirsts(ctx, "s1", "UTC", sep10.To, sep10.To.Add(24*time.Hour), 20)
	if len(got) != 1 || got[0].Country != "GB" {
		t.Fatalf("Sep 11: %+v", got)
	}
}

func TestTopReferrer(t *testing.T) {
	q := golden(t, false)
	ref, err := q.TopReferrer(context.Background(), "s1", sep10.From, sep10.To)
	if err != nil || ref != "google.com" {
		t.Fatalf("%q %v", ref, err)
	}
	if ref, _ := q.TopReferrer(context.Background(), "s1", sep10.To, sep10.To.Add(time.Hour)); ref != "" {
		t.Fatalf("nobody referred: %q", ref)
	}
}

// Sales per hour, summed, each with the channel that earned most of it;
// unattributed money has no channel. Asked for only with Params.Sales.
func TestSaleBuckets(t *testing.T) {
	q := withPayments(golden(t, false))
	p := sep10
	p.Bucket, p.Currency, p.Revenue = "hour", "USD", true
	res, err := q.Report(context.Background(), p)
	if err != nil || res.Sales != nil {
		t.Fatalf("no sales unless asked: %v %v", res.Sales, err)
	}
	p.Sales = true
	res, err = q.Report(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	want := []SaleBucket{
		{"2026-09-10T11:00", 1, 1500, "AI"},
		{"2026-09-10T12:00", 1, 1000, ""},
		{"2026-09-10T13:00", 1, 700, "Search"},
		{"2026-09-10T15:00", 1, 5000, "Search"},
	}
	if len(res.Sales) != len(want) {
		t.Fatalf("got %+v", res.Sales)
	}
	for i := range want {
		if res.Sales[i] != want[i] {
			t.Fatalf("%d: got %+v want %+v", i, res.Sales[i], want[i])
		}
	}
}
