package server

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/api"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The scheduled report runs through the same gate on a real site row: only a
// site that has sent something, and existed before the week ended, gets one.
func TestScheduledWeeklyGoesOutForASiteThatHasSentEvents(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	ctl := openCtl(t, dir)
	defer ctl.Close()
	st, err := duck.Open(ctx, filepath.Join(dir, "w.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	s := &Server{ctl: ctl, api: &api.API{Ctl: ctl, Query: func() *query.Q { return &query.Q{DB: st.DB} }}}

	now := time.Now().UTC()
	// A Monday-morning run: the week just ended is due whatever day this is
	// in the site's own week, so take the Monday of the current week at 09:00.
	back := (int(now.Weekday()) + 6) % 7
	monday := time.Date(now.Year(), now.Month(), now.Day()-back, 9, 0, 0, 0, time.UTC)
	day := int64(24 * 3600)

	site := func(domain string, createdDaysAgo int, lastEventDaysAgo int) string {
		t.Helper()
		id, err := ctl.CreateSite(ctx, sqlite.DefaultAccount, domain, "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := ctl.DB.ExecContext(ctx, `UPDATE sites SET created_at = ? WHERE id = ?`, monday.Unix()-int64(createdDaysAgo)*day, id); err != nil {
			t.Fatal(err)
		}
		if lastEventDaysAgo >= 0 {
			// What the ingest path calls whenever the site sends an event.
			ctl.SeenSite(ctx, id, monday.Unix()-int64(lastEventDaysAgo)*day)
		}
		return id
	}
	cases := []struct {
		name string
		id   string
		want bool
	}{
		{"new site, created this week, never sent anything", site("new.example.com", 2, -1), false},
		{"older site that never sent anything", site("silent.example.com", 40, -1), false},
		{"site with traffic from more than a week ago to last week", site("busy.example.com", 40, 3), true},
		{"site that went quiet weeks ago", site("quiet.example.com", 90, 30), true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ev := alerts.Event{Kind: "weekly", Site: c.id, At: monday}
			got, ok := s.weekly(ctx, c.id, 0, monday, ev)
			if ok != c.want {
				t.Fatalf("report sent = %v, want %v", ok, c.want)
			}
			if ok && got.Title == "" {
				t.Fatal("report has no title")
			}
		})
	}
}
