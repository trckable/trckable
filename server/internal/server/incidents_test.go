package server

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

const hour = 3600

// The same cases as dashboard/src/features/sitestatus/status.test.ts: the
// badge and the record of incidents must say the same thing.
func TestTroubleFollowsTheBadge(t *testing.T) {
	const now = 1_800_000_000
	cases := []struct {
		name string
		last int64
		c    sqlite.SiteCheck
		want string
	}{
		{"new: no visit yet", 0, sqlite.SiteCheck{}, ""},
		{"ok: a visit an hour ago", now - hour, sqlite.SiteCheck{}, ""},
		{"ok: under the threshold, even with a failed look", now - 5*hour, sqlite.SiteCheck{At: now - 60, Error: "x"}, ""},
		{"quiet: past the threshold, never looked at", now - 7*hour, sqlite.SiteCheck{}, "quiet"},
		{"quiet: past the threshold, the page answers", now - 7*hour, sqlite.SiteCheck{At: now - 60, Found: "none"}, "quiet"},
		{"down: a failed look after the last visit", now - 7*hour, sqlite.SiteCheck{At: now - 60, Error: "x"}, "down"},
		{"quiet: the failed look is older than the last visit", now - 7*hour, sqlite.SiteCheck{At: now - 8*hour, Error: "x"}, "quiet"},
	}
	for _, c := range cases {
		if got := troubleOf(c.last, c.c, now); got != c.want {
			t.Errorf("%s: %q, want %q", c.name, got, c.want)
		}
	}
}

// fakeHistory answers from a table: one visit count per week back.
type fakeHistory struct {
	first, after int64
	perWeek      int64
	asked        int
}

func (f *fakeHistory) FirstEventAfter(context.Context, string, int64) (int64, error) {
	return f.after, nil
}
func (f *fakeHistory) FirstEvent(context.Context, string) (int64, error) { return f.first, nil }
func (f *fakeHistory) Visits(context.Context, string, int64, int64) (int64, error) {
	f.asked++
	return f.perWeek, nil
}

func openForIncidents(t *testing.T) (*sqlite.Store, string) {
	t.Helper()
	ctx := context.Background()
	st, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	site, err := st.CreateSite(ctx, sqlite.DefaultAccount, "a.com", "")
	if err != nil {
		t.Fatal(err)
	}
	return st, site
}

// A quiet spell opens one incident however often it is looked at, a restart
// in the middle (the next round with nothing remembered) neither duplicates
// nor loses it, a failed look makes it a down one, and the return closes it.
func TestIncidentFollowsTheSiteAcrossRestarts(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	const last = 1_800_000_000
	h := &fakeHistory{first: last - 60*24*hour, after: last + 9*hour, perWeek: 100}
	var none sqlite.SiteCheck

	step := func(now int64, c sqlite.SiteCheck, lastVisit int64) {
		t.Helper()
		if err := stepIncident(ctx, st, h, site, lastVisit, c, now); err != nil {
			t.Fatal(err)
		}
	}
	count := func() int {
		list, _ := st.Incidents(ctx, site, 50, 0, 0, 0)
		return len(list)
	}

	step(last+3*hour, none, last) // still fine
	if count() != 0 {
		t.Fatal("an incident before the threshold")
	}
	for i := int64(0); i < 5; i++ { // many rounds, one incident
		step(last+7*hour+i*600, none, last)
	}
	if count() != 1 {
		t.Fatalf("%d incidents, want 1", count())
	}
	open, _ := st.OpenIncident(ctx, site)
	if open.Kind != "quiet" || open.StartedAt != last+6*hour || open.Cause != "no visits" {
		t.Fatalf("open %+v", open)
	}
	// The site stops answering: the same incident becomes a down one.
	step(last+8*hour, sqlite.SiteCheck{At: last + 8*hour - 60, Error: "connection refused"}, last)
	open, _ = st.OpenIncident(ctx, site)
	if count() != 1 || open.Kind != "down" || open.Cause != "connection refused" {
		t.Fatalf("after the failed look: %d %+v", count(), open)
	}
	// Back: the next visit closes it, at the first visit after the silence.
	step(last+10*hour, none, last+10*hour-120)
	if again, _ := st.OpenIncident(ctx, site); again != nil {
		t.Fatalf("still open: %+v", again)
	}
	list, _ := st.Incidents(ctx, site, 5, 0, 0, 0)
	if len(list) != 1 || *list[0].EndedAt != last+9*hour || list[0].Expected == nil || *list[0].Expected != 100 {
		t.Fatalf("closed %+v", list[0])
	}
	// More rounds change nothing; a second gap is a second incident.
	step(last+11*hour, none, last+10*hour-120)
	if count() != 1 {
		t.Fatal("a closed incident was opened again")
	}
	next := int64(last + 10*hour - 120)
	step(next+7*hour, none, next)
	if count() != 2 {
		t.Fatalf("%d incidents after a second gap, want 2", count())
	}
}

// A site that goes quiet and comes back between two rounds leaves nothing, a
// quiet site seen only after the fact is recorded from its last visit, and a
// closing without the analytics store waits for it.
func TestIncidentEdges(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	const last = 1_800_000_000
	if err := stepIncident(ctx, st, nil, site, last+hour, sqlite.SiteCheck{}, last+2*hour); err != nil {
		t.Fatal(err)
	}
	if list, _ := st.Incidents(ctx, site, 5, 0, 0, 0); len(list) != 0 {
		t.Fatalf("a flap between rounds left %+v", list)
	}
	// The server was off for days: the first look finds the site quiet since long ago.
	if err := stepIncident(ctx, st, nil, site, last, sqlite.SiteCheck{}, last+3*24*hour); err != nil {
		t.Fatal(err)
	}
	open, _ := st.OpenIncident(ctx, site)
	if open == nil || open.StartedAt != last+6*hour {
		t.Fatalf("open %+v", open)
	}
	// Visits are back but the store is not ready: it stays open.
	if err := stepIncident(ctx, st, nil, site, last+4*24*hour, sqlite.SiteCheck{}, last+4*24*hour+60); err != nil {
		t.Fatal(err)
	}
	if open, _ = st.OpenIncident(ctx, site); open == nil {
		t.Fatal("closed without the analytics store")
	}
}

// The estimate is the average of the same stretch over the weeks before,
// counts only weeks the site existed, and says nothing under two weeks.
func TestExpectedVisits(t *testing.T) {
	ctx := context.Background()
	const start = 1_800_000_000
	cases := []struct {
		name      string
		first     int64
		perWeek   int64
		want      int64
		wantKnown bool
	}{
		{"four weeks of history", start - 40*24*hour, 340, 340, true},
		{"two and a half weeks", start - 18*24*hour, 340, 340, true},
		{"under two weeks", start - 13*24*hour, 340, 0, false},
		{"a week", start - 8*24*hour, 340, 0, false},
		{"no events at all", 0, 340, 0, false},
	}
	for _, c := range cases {
		h := &fakeHistory{first: c.first, perWeek: c.perWeek}
		got, err := expectedVisits(ctx, h, "s", start, start+3*hour)
		if err != nil {
			t.Fatal(err)
		}
		if (got != nil) != c.wantKnown || (got != nil && *got != c.want) {
			t.Errorf("%s: %v, want known=%v %d", c.name, got, c.wantKnown, c.want)
		}
	}
	h := &fakeHistory{first: start - 18*24*hour, perWeek: 1}
	_, _ = expectedVisits(ctx, h, "s", start, start+hour)
	if h.asked != 2 {
		t.Errorf("asked %d weeks, want the 2 that exist", h.asked)
	}
}
