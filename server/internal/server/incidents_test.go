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

// fakeHistory answers from a table: so many visits an hour, whenever asked.
type fakeHistory struct {
	first, after int64
	perHour      int64
	asked        int
}

func (f *fakeHistory) FirstEventAfter(context.Context, string, int64) (int64, error) {
	return f.after, nil
}
func (f *fakeHistory) FirstEvent(context.Context, string) (int64, error) { return f.first, nil }
func (f *fakeHistory) Visits(_ context.Context, _ string, from, to int64) (int64, error) {
	f.asked++
	return f.perHour * (to - from) / hour, nil
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
	h := &fakeHistory{first: last - 60*24*hour, after: last + 9*hour, perHour: 100}
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
	if len(list) != 1 || *list[0].EndedAt != last+9*hour || list[0].Expected == nil || *list[0].Expected != 300 {
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
	busy := &fakeHistory{first: last - 60*24*hour, perHour: 100}
	if err := stepIncident(ctx, st, busy, site, last+hour, sqlite.SiteCheck{}, last+2*hour); err != nil {
		t.Fatal(err)
	}
	if list, _ := st.Incidents(ctx, site, 5, 0, 0, 0); len(list) != 0 {
		t.Fatalf("a flap between rounds left %+v", list)
	}
	// The server was off for days: the first look finds the site quiet since long ago.
	if err := stepIncident(ctx, st, busy, site, last, sqlite.SiteCheck{}, last+3*24*hour); err != nil {
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
// counts only weeks the site existed and that had no incident, says nothing
// under two such weeks, and nothing for a stretch longer than a week.
func TestExpectedVisits(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	const start = 1_800_000_000
	cases := []struct {
		name      string
		first     int64
		end       int64
		want      int64
		wantKnown bool
	}{
		{"four weeks of history", start - 40*24*hour, start + 3*hour, 300, true},
		{"two and a half weeks", start - 18*24*hour, start + 3*hour, 300, true},
		{"under two weeks", start - 13*24*hour, start + 3*hour, 0, false},
		{"no events at all", 0, start + 3*hour, 0, false},
		{"longer than a week", start - 40*24*hour, start + 8*24*hour, 0, false},
	}
	for _, c := range cases {
		h := &fakeHistory{first: c.first, perHour: 100}
		got, err := expectedVisits(ctx, h, st, site, start, c.end)
		if err != nil {
			t.Fatal(err)
		}
		if (got != nil) != c.wantKnown || (got != nil && *got != c.want) {
			t.Errorf("%s: %v, want known=%v %d", c.name, got, c.wantKnown, c.want)
		}
	}
	// A week that had an incident of its own is left out; with only the other one left, nothing is said.
	h := &fakeHistory{first: start - 18*24*hour, perHour: 1}
	_, _ = st.StartIncident(ctx, site, "down", start-7*24*hour-hour, "x")
	open, _ := st.OpenIncident(ctx, site)
	_ = st.EndIncident(ctx, open.ID, start-7*24*hour+hour, nil)
	if got, _ := expectedVisits(ctx, h, st, site, start, start+hour); got != nil {
		t.Errorf("one clean week gave %d", *got)
	}
	if h.asked != 1 {
		t.Errorf("asked %d weeks, want the 1 that was clean", h.asked)
	}
}

// A second silence is a second incident, not the first one lengthened.
func TestSecondSilenceIsNotMerged(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	const last = 1_800_000_000
	h := &fakeHistory{first: last - 60*24*hour, after: last + 9*hour, perHour: 100}
	var none sqlite.SiteCheck
	if err := stepIncident(ctx, st, h, site, last, none, last+3*24*hour); err != nil {
		t.Fatal(err)
	}
	// Visits came back, then stopped again, and nobody looked in between.
	h.after = last + 3*24*hour + 10*hour
	l2 := int64(last + 4*24*hour)
	if err := stepIncident(ctx, st, h, site, l2, none, l2+24*hour); err != nil {
		t.Fatal(err)
	}
	list, _ := st.Incidents(ctx, site, 5, 0, 0, 0)
	if len(list) != 2 || list[0].StartedAt != l2+6*hour || list[0].EndedAt != nil || list[1].EndedAt == nil || list[1].StartedAt != last+6*hour {
		t.Fatalf("incidents %+v", list)
	}
}

// A quiet incident turns down while the site fails to answer and back to
// quiet when it answers again, like the badge; the cause says the page
// answered only when a look after the last visit found it so.
func TestQuietDownQuietAndWhatWasSeen(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	const last = 1_800_000_000
	h := &fakeHistory{first: last - 60*24*hour, perHour: 100}
	step := func(now int64, c sqlite.SiteCheck) *sqlite.Incident {
		t.Helper()
		if err := stepIncident(ctx, st, h, site, last, c, now); err != nil {
			t.Fatal(err)
		}
		o, _ := st.OpenIncident(ctx, site)
		return o
	}
	if o := step(last+7*hour, sqlite.SiteCheck{}); o.Cause != "no visits" {
		t.Fatalf("not looked at: %+v", o)
	}
	if o := step(last+8*hour, sqlite.SiteCheck{At: last + 8*hour, Error: "timeout"}); o.Kind != "down" {
		t.Fatalf("failed look: %+v", o)
	}
	if o := step(last+9*hour, sqlite.SiteCheck{At: last + 9*hour, Found: "site"}); o.Kind != "quiet" || o.Cause != "no visits, page answered" {
		t.Fatalf("answers again: %+v", o)
	}
}

// A site quieter than a visit an hour is silent most nights: no quiet
// incident for it, but a down one always.
func TestQuietOnlyForBusySites(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	const last = 1_800_000_000
	h := &fakeHistory{first: last - 60*24*hour, perHour: 0}
	if err := stepIncident(ctx, st, h, site, last, sqlite.SiteCheck{}, last+9*hour); err != nil {
		t.Fatal(err)
	}
	if o, _ := st.OpenIncident(ctx, site); o != nil {
		t.Fatalf("a quiet incident for a site with no traffic: %+v", o)
	}
	if err := stepIncident(ctx, st, h, site, last, sqlite.SiteCheck{At: last + 9*hour, Error: "timeout"}, last+9*hour); err != nil {
		t.Fatal(err)
	}
	if o, _ := st.OpenIncident(ctx, site); o == nil || o.Kind != "down" {
		t.Fatalf("down not recorded: %+v", o)
	}
}
