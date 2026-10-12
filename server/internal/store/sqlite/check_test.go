package sqlite

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func openCheckStore(t *testing.T) (*Store, string) {
	t.Helper()
	ctx := context.Background()
	s, err := Open(ctx, filepath.Join(t.TempDir(), "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	if _, err := s.CompleteSetup(ctx, "Owner@Example.com", testPassword); err != nil {
		t.Fatal(err)
	}
	site, err := s.CreateSite(ctx, DefaultAccount, "shop.example.com", "")
	if err != nil {
		t.Fatal(err)
	}
	return s, site
}

func TestDownSinceFollowsTheLooks(t *testing.T) {
	ctx := context.Background()
	s, site := openCheckStore(t)
	look := func(at int64, errText string) SiteCheck {
		t.Helper()
		if err := s.SetCheck(ctx, site, SiteCheck{At: at, Found: "site", Error: errText}); err != nil {
			t.Fatal(err)
		}
		c, err := s.CheckOf(ctx, site)
		if err != nil {
			t.Fatal(err)
		}
		return c
	}
	if c := look(100, ""); c.DownSince != 0 {
		t.Fatalf("a good first look: %+v", c)
	}
	if c := look(200, "no answer"); c.DownSince != 200 {
		t.Fatalf("ok then failed sets it to that look: %+v", c)
	}
	if c := look(300, "no answer"); c.DownSince != 200 {
		t.Fatalf("failed then failed keeps it: %+v", c)
	}
	if c := look(400, ""); c.DownSince != 0 {
		t.Fatalf("failed then ok clears it: %+v", c)
	}
	if c := look(500, "again"); c.DownSince != 500 {
		t.Fatalf("a new fall starts a new time: %+v", c)
	}
	all, _ := s.Checks(ctx, DefaultAccount)
	if all[site].DownSince != 500 {
		t.Fatalf("the list carries it: %+v", all[site])
	}
}

func TestMutedAlertsAreNotLiveUntilTheSnoozeEnds(t *testing.T) {
	ctx := context.Background()
	s, site := openCheckStore(t)
	other, _ := s.CreateSite(ctx, DefaultAccount, "other.example.com", "")
	for _, id := range []string{site, other} {
		if _, err := s.SaveAlert(ctx, Alert{SiteID: id, Kind: "stopped", Enabled: true, Target: "mailto:a@example.com"}); err != nil {
			t.Fatal(err)
		}
	}
	count := func() int {
		l, err := s.LiveAlerts(ctx)
		if err != nil {
			t.Fatal(err)
		}
		return len(l)
	}
	if count() != 2 {
		t.Fatalf("nothing muted: %d", count())
	}
	if err := s.MuteAlerts(ctx, site, time.Now().Add(time.Hour).Unix()); err != nil {
		t.Fatal(err)
	}
	if l, _ := s.LiveAlerts(ctx); len(l) != 1 || l[0].SiteID != other {
		t.Fatalf("a muted site sends nothing, the other still does: %+v", l)
	}
	if err := s.MuteAlerts(ctx, site, time.Now().Add(-time.Second).Unix()); err != nil {
		t.Fatal(err)
	}
	if count() != 2 {
		t.Fatal("an expired snooze lifts by itself")
	}
	_ = s.MuteAlerts(ctx, site, time.Now().Add(time.Hour).Unix())
	_ = s.MuteAlerts(ctx, site, 0)
	if count() != 2 || s.MutedUntil(ctx, site) != 0 {
		t.Fatal("lifting it at once")
	}
}
