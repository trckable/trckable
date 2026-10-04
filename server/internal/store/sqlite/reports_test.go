package sqlite

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/auth"
)

func TestCleanRecipients(t *testing.T) {
	got, err := CleanRecipients([]string{" Client@Example.com ", "client@example.com", "", "second@example.org"})
	if err != nil || !reflect.DeepEqual(got, []string{"client@example.com", "second@example.org"}) {
		t.Fatalf("tidied: %v %v", got, err)
	}
	for _, bad := range []string{"nobody", "a@b", "Name <a@b.com>", "a@b.com, c@d.com", "a@b.com\r\nBcc: x@y.z", "@b.com", "a b@c.com", "a@b.com;c@d.com"} {
		if _, err := CleanRecipients([]string{bad}); err == nil {
			t.Errorf("%q was accepted", bad)
		}
	}
	var many []string
	for i := range MaxRecipients + 1 {
		many = append(many, strings.Repeat("a", i+1)+"@example.com")
	}
	if _, err := CleanRecipients(many[:MaxRecipients]); err != nil {
		t.Errorf("%d addresses: %v", MaxRecipients, err)
	}
	if _, err := CleanRecipients(many); err == nil {
		t.Errorf("%d addresses were accepted", MaxRecipients+1)
	}
	// Ten once duplicates are gone is ten.
	dup := append(many[:MaxRecipients:MaxRecipients], strings.ToUpper(many[0]))
	if got, err := CleanRecipients(dup); err != nil || len(got) != MaxRecipients {
		t.Errorf("duplicates counted: %d %v", len(got), err)
	}
}

func TestReportSchedules(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	site, _ := s.CreateSite(ctx, DefaultAccount, "a.com", "")
	other, _ := s.CreateSite(ctx, DefaultAccount, "b.com", "")
	base := ReportSchedule{SiteID: site, Name: " Acme ", Cadence: "weekly", Lang: "de", PDF: true, Recipients: []string{"A@Example.com"}, Enabled: true}

	sc, err := s.SaveReportSchedule(ctx, base)
	if err != nil || sc.ID == "" || sc.Name != "Acme" || sc.Recipients[0] != "a@example.com" || !sc.PDF || sc.LastSent != 0 {
		t.Fatalf("create: %+v %v", sc, err)
	}
	for name, in := range map[string]ReportSchedule{
		"cadence":   {SiteID: site, Cadence: "daily", Lang: "en"},
		"language":  {SiteID: site, Cadence: "weekly", Lang: "xx"},
		"recipient": {SiteID: site, Cadence: "weekly", Lang: "en", Recipients: []string{"nope"}},
		"name":      {SiteID: site, Cadence: "weekly", Lang: "en", Name: strings.Repeat("x", MaxScheduleName+1)},
		"newline":   {SiteID: site, Cadence: "weekly", Lang: "en", Name: "a\nb"},
	} {
		var bad ErrSchedule
		if _, err := s.SaveReportSchedule(ctx, in); !errors.As(err, &bad) {
			t.Errorf("%s: %v", name, err)
		}
	}

	// A site holds a few.
	for range MaxSchedulesPerSite - 1 {
		if _, err := s.SaveReportSchedule(ctx, base); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.SaveReportSchedule(ctx, base); err == nil {
		t.Error("more schedules than a site may have")
	}

	// A change keeps the send history unless the rhythm changed.
	s.MarkReportSent(ctx, sc.ID, 12345)
	upd := sc
	upd.Name, upd.Lang = "Acme GmbH", "fr"
	if got, err := s.SaveReportSchedule(ctx, upd); err != nil || got.LastSent != 12345 || got.Lang != "fr" || got.Name != "Acme GmbH" {
		t.Errorf("update: %+v %v", got, err)
	}
	upd.Cadence = "monthly"
	if got, _ := s.SaveReportSchedule(ctx, upd); got.LastSent != 0 || got.Cadence != "monthly" {
		t.Errorf("a new rhythm starts clean: %+v", got)
	}

	// Another site's id changes nothing and does not exist.
	steal := upd
	steal.SiteID = other
	if _, err := s.SaveReportSchedule(ctx, steal); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("another site's schedule: %v", err)
	}
	if err := s.DeleteReportSchedule(ctx, other, sc.ID); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("deleted from another site: %v", err)
	}

	// Live ones are on and have someone to send to.
	live, _ := s.LiveReportSchedules(ctx)
	if len(live) != MaxSchedulesPerSite {
		t.Fatalf("live: %d", len(live))
	}
	upd.Enabled = false
	if _, err := s.SaveReportSchedule(ctx, upd); err != nil {
		t.Fatal(err)
	}
	if live, _ = s.LiveReportSchedules(ctx); len(live) != MaxSchedulesPerSite-1 {
		t.Errorf("a schedule that is off is live: %d", len(live))
	}
	if err := s.DeleteReportSchedule(ctx, site, sc.ID); err != nil {
		t.Fatal(err)
	}
	empty := base
	empty.Recipients = nil
	if _, err := s.SaveReportSchedule(ctx, empty); err != nil {
		t.Fatal(err)
	}
	live, _ = s.LiveReportSchedules(ctx)
	for _, l := range live {
		if len(l.Recipients) == 0 || !l.Enabled {
			t.Errorf("a schedule with no one to send to is live: %+v", l)
		}
	}
}

func TestRemoveReportRecipient(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	site, _ := s.CreateSite(ctx, DefaultAccount, "a.com", "")
	sc, _ := s.SaveReportSchedule(ctx, ReportSchedule{SiteID: site, Cadence: "weekly", Lang: "en", Recipients: []string{"a@x.com", "b@x.com"}, Enabled: true})
	for range 2 { // again is fine
		if err := s.RemoveReportRecipient(ctx, sc.ID, " A@X.com "); err != nil {
			t.Fatal(err)
		}
	}
	if got, _ := s.ReportScheduleByID(ctx, sc.ID); !reflect.DeepEqual(got.Recipients, []string{"b@x.com"}) {
		t.Errorf("recipients: %v", got.Recipients)
	}
	if err := s.RemoveReportRecipient(ctx, "rep_nope", "a@x.com"); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("a missing schedule: %v", err)
	}
	// Taking the site takes its schedules.
	if _, err := s.DeleteSite(ctx, site); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ReportScheduleByID(ctx, sc.ID); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("a deleted site's schedule: %v", err)
	}
}
