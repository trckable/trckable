package sqlite

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"
)

func hostsStore(t *testing.T) (*Store, context.Context, string) {
	t.Helper()
	ctx := context.Background()
	s, err := Open(ctx, filepath.Join(t.TempDir(), "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	if _, err := s.CompleteSetup(ctx, "owner@example.com", "correct horse battery staple"); err != nil {
		t.Fatal(err)
	}
	id, err := s.CreateSite(ctx, DefaultAccount, "site.com", "")
	if err != nil {
		t.Fatal(err)
	}
	return s, ctx, id
}

func TestRejectedHostsTopFiveOverAWeek(t *testing.T) {
	s, ctx, id := hostsStore(t)
	now := time.Date(2026, 10, 10, 9, 0, 0, 0, time.UTC)
	day := func(back int) string { return now.AddDate(0, 0, -back).Format(time.DateOnly) }
	rows := []RejectedHost{{id, day(0), "a.com", 5}, {id, day(1), "a.com", 3}, {id, day(8), "old.com", 50}}
	for i := 0; i < 6; i++ {
		rows = append(rows, RejectedHost{id, day(2), fmt.Sprintf("h%d.com", i), uint64(i + 1)})
	}
	rows = append(rows, RejectedHost{"tkb_gone", day(0), "x.com", 9})
	if err := s.AddRejectedHosts(ctx, rows, now); err != nil {
		t.Fatal(err)
	}
	got, err := s.RejectedHostsOf(ctx, id, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Hosts) != 5 || got.Hosts[0].Host != "a.com" || got.Hosts[0].N != 8 || got.Hosts[1].Host != "h5.com" {
		t.Fatalf("top hosts: %+v", got.Hosts)
	}
	if got.Total != 8+21 {
		t.Fatalf("total %d", got.Total)
	}
}

func TestRejectedHostsPerDayCap(t *testing.T) {
	s, ctx, id := hostsStore(t)
	now := time.Date(2026, 10, 10, 9, 0, 0, 0, time.UTC)
	var rows []RejectedHost
	for i := 0; i < hostsPerDay+10; i++ {
		rows = append(rows, RejectedHost{id, now.Format(time.DateOnly), fmt.Sprintf("h%02d.com", i), 1})
	}
	if err := s.AddRejectedHosts(ctx, rows, now); err != nil {
		t.Fatal(err)
	}
	// One kept name still counts on a later write.
	if err := s.AddRejectedHosts(ctx, []RejectedHost{{id, now.Format(time.DateOnly), "h00.com", 4}}, now); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = s.DB.QueryRow(`SELECT count(*) FROM rejected_hosts`).Scan(&n)
	got, _ := s.RejectedHostsOf(ctx, id, now)
	if n != hostsPerDay || got.Total != hostsPerDay+4 {
		t.Fatalf("rows %d, total %d", n, got.Total)
	}
}

func TestSetupMailIsDueOnceForOwners(t *testing.T) {
	s, ctx, id := hostsStore(t)
	wait := 3 * 24 * time.Hour
	now := time.Now()
	if due, _ := s.SetupMailDue(ctx, now, wait); len(due) != 0 {
		t.Fatalf("a new site is not due: %+v", due)
	}
	due, err := s.SetupMailDue(ctx, now.Add(wait+time.Minute), wait)
	if err != nil || len(due) != 1 || due[0].Site != id || len(due[0].Owners) != 1 || due[0].Owners[0] != "owner@example.com" {
		t.Fatalf("due: %+v %v", due, err)
	}
	s.SeenSite(ctx, id, now.Unix())
	if due, _ := s.SetupMailDue(ctx, now.Add(wait+time.Minute), wait); len(due) != 0 {
		t.Fatalf("a site with a visit is not due: %+v", due)
	}
	s2, ctx2, id2 := hostsStore(t)
	if err := s2.MarkSetupMailed(ctx2, id2, now.Unix()); err != nil {
		t.Fatal(err)
	}
	if due, _ := s2.SetupMailDue(ctx2, now.Add(wait+time.Minute), wait); len(due) != 0 {
		t.Fatalf("sent twice: %+v", due)
	}
}
