package sqlite

import (
	"context"
	"path/filepath"
	"testing"
)

func alertsOf(t *testing.T, s *Store, site string) map[string]Alert {
	t.Helper()
	list, err := s.Alerts(context.Background(), site)
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]Alert{}
	for _, a := range list {
		out[a.Kind] = a
	}
	return out
}

func TestANewSiteGetsTheWeeklyReportAndTrackingStopped(t *testing.T) {
	ctx := context.Background()
	s, err := Open(ctx, filepath.Join(t.TempDir(), "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err := s.CompleteSetup(ctx, "Owner@Example.com", testPassword); err != nil {
		t.Fatal(err)
	}
	site, _ := s.CreateSite(ctx, DefaultAccount, "new.example.com", "")

	// Nowhere to send: nothing is created, and nothing fails.
	if on, err := s.DefaultAlerts(ctx, DefaultAccount, site, false); on || err != nil || len(alertsOf(t, s, site)) != 0 {
		t.Fatalf("without mail or a destination: %v %v", on, err)
	}
	// With mail, the first owner's address.
	if on, err := s.DefaultAlerts(ctx, DefaultAccount, site, true); !on || err != nil {
		t.Fatalf("with mail: %v %v", on, err)
	}
	got := alertsOf(t, s, site)
	if len(got) != 2 {
		t.Fatalf("want weekly and stopped, got %v", got)
	}
	for _, kind := range []string{"weekly", "stopped"} {
		if a := got[kind]; !a.Enabled || a.Target != "mailto:owner@example.com" {
			t.Errorf("%s: %+v", kind, a)
		}
	}
	// Asked again, it changes nothing (a switch someone turned off stays off).
	if err := s.SetAlertEnabled(ctx, got["weekly"].ID, false); err != nil {
		t.Fatal(err)
	}
	if on, _ := s.DefaultAlerts(ctx, DefaultAccount, site, true); on || alertsOf(t, s, site)["weekly"].Enabled {
		t.Fatal("a site that has alerts was given more")
	}
}

func TestANewSiteFollowsTheDestinationTheAccountAlreadyUses(t *testing.T) {
	ctx := context.Background()
	s, err := Open(ctx, filepath.Join(t.TempDir(), "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	first, _ := s.CreateSite(ctx, DefaultAccount, "first.example.com", "")
	hook := "https://hooks.slack.com/services/T0/B0/secret"
	if _, err := s.SaveAlert(ctx, Alert{SiteID: first, Kind: "customer", Enabled: true, Target: hook}); err != nil {
		t.Fatal(err)
	}
	// No owner, no mail: the webhook someone set up is the destination.
	second, _ := s.CreateSite(ctx, DefaultAccount, "second.example.com", "")
	if on, err := s.DefaultAlerts(ctx, DefaultAccount, second, false); !on || err != nil {
		t.Fatalf("%v %v", on, err)
	}
	if a := alertsOf(t, s, second)["weekly"]; !a.Enabled || a.Target != hook {
		t.Fatalf("%+v", a)
	}
	// Another account's destination is never borrowed.
	other, err := s.CreateAccount(ctx)
	if err != nil {
		t.Fatal(err)
	}
	third, _ := s.CreateSite(ctx, other, "third.example.com", "")
	if on, _ := s.DefaultAlerts(ctx, other, third, false); on {
		t.Fatal("an account took another account's destination")
	}
}

// The defaults are made when a site is made, never found later: opening the
// database again (an upgrade) leaves a site with no alerts without them, and a
// site's own alerts as they were.
func TestExistingSitesKeepTheirSettingsThroughAnUpgrade(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "trckable.db")
	s, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CompleteSetup(ctx, "owner@example.com", testPassword); err != nil {
		t.Fatal(err)
	}
	old, _ := s.CreateSite(ctx, DefaultAccount, "old.example.com", "")
	kept, _ := s.CreateSite(ctx, DefaultAccount, "kept.example.com", "")
	if _, err := s.SaveAlert(ctx, Alert{SiteID: kept, Kind: "weekly", Enabled: false, Target: "mailto:someone@example.com"}); err != nil {
		t.Fatal(err)
	}
	// Closed and opened again, which is when an upgrade's migrations run.
	s.Close()
	s, err = Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if n := len(alertsOf(t, s, old)); n != 0 {
		t.Fatalf("an existing site gained %d alerts", n)
	}
	if a := alertsOf(t, s, kept); len(a) != 1 || a["weekly"].Enabled || a["weekly"].Target != "mailto:someone@example.com" {
		t.Fatalf("an existing site's alert changed: %+v", a)
	}
}

func TestAnAlertIsSwitchedByItsOwnID(t *testing.T) {
	ctx := context.Background()
	s, err := Open(ctx, filepath.Join(t.TempDir(), "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	site, _ := s.CreateSite(ctx, DefaultAccount, "a.example.com", "")
	a, _ := s.SaveAlert(ctx, Alert{SiteID: site, Kind: "weekly", Enabled: true, Target: "mailto:a@example.com"})
	b, _ := s.SaveAlert(ctx, Alert{SiteID: site, Kind: "stopped", Enabled: true, Target: "mailto:a@example.com"})
	if err := s.SetAlertEnabled(ctx, a.ID, false); err != nil {
		t.Fatal(err)
	}
	got := alertsOf(t, s, site)
	if got["weekly"].Enabled || !got["stopped"].Enabled {
		t.Fatalf("only the named alert changes: %+v", got)
	}
	_, domain, err := s.AlertByID(ctx, b.ID)
	if err != nil || domain != "a.example.com" {
		t.Fatalf("%q %v", domain, err)
	}
	if err := s.SetAlertEnabled(ctx, "alert_nope", true); err == nil {
		t.Fatal("an unknown alert was switched")
	}
}
