package sqlite

import (
	"context"
	"errors"
	"strconv"
	"testing"
	"time"
)

func domainSite(t *testing.T) (*Store, context.Context, string) {
	t.Helper()
	st := openT(t)
	ctx := context.Background()
	id, err := st.CreateSite(ctx, DefaultAccount, "old.com", "")
	if err != nil {
		t.Fatal(err)
	}
	return st, ctx, id
}

func TestChangeDomainKeepsEverythingButTheAddress(t *testing.T) {
	st, ctx, id := domainSite(t)
	now := time.Date(2026, 10, 21, 10, 0, 0, 0, time.UTC)
	before, _ := st.SiteInfo(ctx, id)
	if err := st.SetCheck(ctx, id, SiteCheck{At: now.Unix(), Found: "site"}); err != nil {
		t.Fatal(err)
	}
	ch, err := st.ChangeDomain(ctx, id, "https://www.New.com/pricing", "", now)
	if err != nil {
		t.Fatal(err)
	}
	if ch.Old != "old.com" || ch.New != "new.com" || ch.Until != now.Add(30*24*time.Hour).Unix() {
		t.Fatalf("change: %+v", ch)
	}
	after, _ := st.SiteInfo(ctx, id)
	if after.ID != before.ID || after.ProxyKey != before.ProxyKey || after.CreatedAt != before.CreatedAt {
		t.Fatalf("id, key or history moved: %+v %+v", before, after)
	}
	if after.Domain != "new.com" || after.Name != "new.com" {
		t.Fatalf("domain %q name %q: the name follows when it was the domain", after.Domain, after.Name)
	}
	// The uptime look and the install check read the domain from the site list.
	rows, _ := st.AllSites(ctx)
	if len(rows) != 1 || rows[0].Domain != "new.com" {
		t.Fatalf("sites: %+v", rows)
	}
	if c, _ := st.CheckOf(ctx, id); c.At != 0 {
		t.Fatalf("the old address's look must not stand for the new one: %+v", c)
	}
	notes, _ := st.Annotations(ctx, id, "2026-10-01", "2026-10-31")
	if len(notes) != 1 || notes[0].Text != "Domain changed to new.com" || notes[0].Day != "2026-10-21" {
		t.Fatalf("notes: %+v", notes)
	}
	// Ingest knows the old address until the grace ends.
	site, _ := st.Site(id)
	if site.Domain != "new.com" || len(site.Former) != 1 || site.Former[0].Host != "old.com" {
		t.Fatalf("ingest site: %+v", site)
	}
}

func TestChangeDomainKeepsACustomNameAndRefusesWhatAddSiteRefuses(t *testing.T) {
	st, ctx, id := domainSite(t)
	if err := st.UpdateSite(ctx, id, "My shop", "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := st.CreateSite(ctx, DefaultAccount, "other.com", ""); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	for _, bad := range []string{"", "a b.com", "new.com:8080", "me@new.com", "new.com?x=1"} {
		if _, err := st.ChangeDomain(ctx, id, bad, "", now); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
	if _, err := st.ChangeDomain(ctx, id, "WWW.OLD.com", "", now); !errors.Is(err, ErrSameDomain) {
		t.Errorf("same domain: %v", err)
	}
	if _, err := st.ChangeDomain(ctx, id, "other.com", "", now); !errors.Is(err, ErrExists) {
		t.Errorf("duplicate in the account: %v", err)
	}
	if got, _ := st.SiteInfo(ctx, id); got.Domain != "old.com" {
		t.Fatalf("a refused change moved the domain: %q", got.Domain)
	}
	if n, _ := st.Annotations(ctx, id, "2000-01-01", "2100-01-01"); len(n) != 0 {
		t.Fatalf("a refused change left a note: %+v", n)
	}
	if _, err := st.ChangeDomain(ctx, id, "new.com", "", now); err != nil {
		t.Fatal(err)
	}
	if got, _ := st.SiteInfo(ctx, id); got.Name != "My shop" {
		t.Fatalf("a name someone chose stays: %q", got.Name)
	}
	if _, err := st.ChangeDomain(ctx, "tkb_nothere", "x.com", "", now); err == nil {
		t.Fatal("an unknown site changed")
	}
}

func TestFormerHostsEndWithTheGraceOrNow(t *testing.T) {
	st, ctx, id := domainSite(t)
	now := time.Now()
	if _, err := st.ChangeDomain(ctx, id, "new.com", "", now); err != nil {
		t.Fatal(err)
	}
	if got, _ := st.FormerHostsOf(ctx, id, now); len(got) != 1 || got[0].Host != "old.com" {
		t.Fatalf("former: %+v", got)
	}
	if got, _ := st.FormerHostsOf(ctx, id, now.Add(31*24*time.Hour)); len(got) != 0 {
		t.Fatalf("after the grace: %+v", got)
	}
	if err := st.EndFormerHost(ctx, id, "old.com"); err != nil {
		t.Fatal(err)
	}
	if got, _ := st.FormerHostsOf(ctx, id, now); len(got) != 0 {
		t.Fatalf("stopped now: %+v", got)
	}
	if site, _ := st.Site(id); len(site.Former) != 0 {
		t.Fatalf("ingest still accepts: %+v", site.Former)
	}
	if err := st.EndFormerHost(ctx, id, "old.com"); err == nil {
		t.Fatal("ending an address that is not waiting")
	}
	// Moving back ends the wait of the address it returns to.
	later := now.Add(25 * time.Hour)
	if _, err := st.ChangeDomain(ctx, id, "old.com", "", later); err != nil {
		t.Fatal(err)
	}
	got, _ := st.FormerHostsOf(ctx, id, later)
	if len(got) != 1 || got[0].Host != "new.com" {
		t.Fatalf("after moving back: %+v", got)
	}
}

// The migration adds the table to a database from before it, and leaves its sites alone.
func TestFormerHostsMigration(t *testing.T) {
	st, ctx, id := domainSite(t)
	// Its migration is the last one: the database is put back to just before it.
	if _, err := st.DB.ExecContext(ctx, `DROP TABLE site_former_hosts; DROP TABLE site_domain_changes; PRAGMA user_version = `+strconv.Itoa(len(migrations)-1)); err != nil {
		t.Fatal(err)
	}
	if err := st.MigrateTo(ctx, len(migrations)); err != nil {
		t.Fatal(err)
	}
	if got, _ := st.SiteInfo(ctx, id); got.Domain != "old.com" {
		t.Fatalf("site: %+v", got)
	}
	if _, err := st.ChangeDomain(ctx, id, "new.com", "", time.Now()); err != nil {
		t.Fatal(err)
	}
}

// A domain changes once a day: a chain of changes would keep a string of old
// addresses open, and a flip would hide where visits come from.
func TestDomainChangesOnceADay(t *testing.T) {
	st, ctx, id := domainSite(t)
	now := time.Date(2026, 10, 21, 10, 0, 0, 0, time.UTC)
	if _, err := st.ChangeDomain(ctx, id, "new.com", "", now); err != nil {
		t.Fatal(err)
	}
	if _, err := st.ChangeDomain(ctx, id, "newer.com", "", now.Add(23*time.Hour)); !errors.Is(err, ErrDomainTooSoon) {
		t.Fatalf("a second change in a day: %v", err)
	}
	if got, _ := st.SiteInfo(ctx, id); got.Domain != "new.com" {
		t.Fatalf("domain %q", got.Domain)
	}
	// Stopping the old address does not reset the clock.
	if err := st.EndFormerHost(ctx, id, "old.com"); err != nil {
		t.Fatal(err)
	}
	if _, err := st.ChangeDomain(ctx, id, "newer.com", "", now.Add(23*time.Hour)); !errors.Is(err, ErrDomainTooSoon) {
		t.Fatalf("after stopping: %v", err)
	}
	if _, err := st.ChangeDomain(ctx, id, "newer.com", "", now.Add(24*time.Hour)); err != nil {
		t.Fatal(err)
	}
}

// The former addresses ride with the account's sites, so whoever counts an
// account's domains sees the ones still accepted.
func TestFormerHostsByAccount(t *testing.T) {
	st, ctx, id := domainSite(t)
	now := time.Now()
	if _, err := st.ChangeDomain(ctx, id, "new.com", "", now); err != nil {
		t.Fatal(err)
	}
	got, err := st.FormerHostsByAccount(ctx, DefaultAccount, now)
	if err != nil || len(got[id]) != 1 || got[id][0] != "old.com" {
		t.Fatalf("%v %v", got, err)
	}
	if got, _ := st.FormerHostsByAccount(ctx, DefaultAccount, now.Add(31*24*time.Hour)); len(got) != 0 {
		t.Fatalf("after the grace: %v", got)
	}
}

func TestChangeDomainClearsTheDownStateOfTheOldAddress(t *testing.T) {
	st, ctx, id := domainSite(t)
	now := time.Date(2026, 10, 21, 10, 0, 0, 0, time.UTC)
	at := now.Add(-2 * time.Hour).Unix()
	for i := int64(0); i < DownAfter; i++ {
		if _, _, err := st.RecordProbe(ctx, id, at+i, 0, 0, "DNS name not found"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := st.StartIncident(ctx, id, "down", at, "DNS name not found"); err != nil {
		t.Fatal(err)
	}
	if p, _ := st.ProbeOf(ctx, id); !p.Down() {
		t.Fatalf("setup: %+v", p)
	}
	if _, err := st.ChangeDomain(ctx, id, "new.com", "", now); err != nil {
		t.Fatal(err)
	}
	if p, _ := st.ProbeOf(ctx, id); p.At != 0 || p.Failures != 0 || p.Down() {
		t.Fatalf("the old address's failures stand for the new one: %+v", p)
	}
	if log, _ := st.ProbeLog(ctx, id, 10); len(log) != 0 {
		t.Fatalf("probe log: %+v", log)
	}
	if open, _ := st.OpenIncident(ctx, id); open != nil {
		t.Fatalf("incident still open: %+v", open)
	}
	list, _ := st.Incidents(ctx, id, 5, 0, 0, 0)
	if len(list) != 1 || list[0].EndedAt == nil || *list[0].EndedAt != now.Unix() {
		t.Fatalf("incident: %+v", list)
	}
	// The next look at the new address starts from nothing.
	if _, after, _ := st.RecordProbe(ctx, id, now.Unix()+1, 200, 80, ""); after.Failures != 0 || after.Down() {
		t.Fatalf("after: %+v", after)
	}
}

func TestSetDownSaysWhetherVisitorsCameAfter(t *testing.T) {
	p := SiteProbe{DownSince: 1000, Error: "x", Failures: DownAfter}
	quiet := SiteInfo{LastEventAt: 900}
	quiet.SetDown(p)
	busy := SiteInfo{LastEventAt: 1500}
	busy.SetDown(p)
	if quiet.DownSince != 1000 || quiet.DownCause != "x" || quiet.DownVisitors || !busy.DownVisitors {
		t.Fatalf("quiet %+v busy %+v", quiet, busy)
	}
}
