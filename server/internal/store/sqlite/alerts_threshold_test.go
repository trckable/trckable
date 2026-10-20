package sqlite

import (
	"context"
	"errors"
	"testing"
)

func TestSaveThresholdAlert(t *testing.T) {
	ctx := context.Background()
	s := openT(t)
	site, err := s.CreateSite(ctx, DefaultAccount, "goal.example", "")
	if err != nil {
		t.Fatal(err)
	}
	rule := Alert{SiteID: site, Kind: "threshold", Enabled: true, Target: "mailto:me@example.com", Metric: "sales", Period: "day", Threshold: 10}
	for _, bad := range []Alert{
		{SiteID: site, Kind: "threshold", Enabled: true, Target: "mailto:me@example.com"},
		{SiteID: site, Kind: "threshold", Enabled: true, Target: "mailto:me@example.com", Metric: "sales", Period: "year", Threshold: 10},
		{SiteID: site, Kind: "threshold", Enabled: true, Target: "mailto:me@example.com", Metric: "sales", Period: "day", Threshold: 0},
		{SiteID: site, Kind: "threshold", Enabled: true, Target: "mailto:me@example.com", Metric: "visitors", Period: "day", Threshold: 1.5},
	} {
		if _, err := s.SaveAlert(ctx, bad); !errors.Is(err, ErrThreshold) {
			t.Errorf("%+v saved: %v", bad, err)
		}
	}
	saved, err := s.SaveAlert(ctx, rule)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.MarkThresholdFired(ctx, saved.ID, "2026-10-21", 5); err != nil {
		t.Fatal(err)
	}
	read := func() Alert {
		list, err := s.Alerts(ctx, site)
		if err != nil || len(list) != 1 {
			t.Fatalf("%v %v", list, err)
		}
		return list[0]
	}
	if got := read(); got.Metric != "sales" || got.Period != "day" || got.Threshold != 10 || got.FiredPeriod != "2026-10-21" || got.LastFired != 5 {
		t.Fatalf("read back: %+v", got)
	}
	// Switching it off and on keeps what it has told; a changed rule may speak again.
	rule.ID, rule.Enabled = saved.ID, false
	if _, err := s.SaveAlert(ctx, rule); err != nil {
		t.Fatal(err)
	}
	if got := read(); got.FiredPeriod != "2026-10-21" {
		t.Fatalf("a switch forgot the period: %+v", got)
	}
	rule.Threshold = 20
	if _, err := s.SaveAlert(ctx, rule); err != nil {
		t.Fatal(err)
	}
	if got := read(); got.FiredPeriod != "" || got.Threshold != 20 {
		t.Fatalf("a changed number kept the period: %+v", got)
	}
	// Another kind carries no metric or period.
	other, err := s.SaveAlert(ctx, Alert{SiteID: site, Kind: "weekly", Enabled: true, Target: "mailto:me@example.com", Metric: "sales", Period: "day"})
	if err != nil || other.Metric != "" || other.Period != "" {
		t.Fatalf("%+v %v", other, err)
	}
}
