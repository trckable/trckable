package main

import (
	"context"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// seed writes a small data directory: one site (acme.example) with an added
// name and a rule, four stored items around day, and some traffic.
func seed(t testing.TB, dir string, day time.Time) {
	t.Helper()
	ctx := context.Background()
	st, err := sqlite.Open(ctx, dir+"/trckable.db")
	if err != nil {
		t.Fatal(err)
	}
	site, err := st.CreateSite(ctx, sqlite.DefaultAccount, "acme.example", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := st.SetMentionKeywords(ctx, site, []string{"Acme Metrics"}, 1); err != nil {
		t.Fatal(err)
	}
	if err := st.SetMentionRules(ctx, site, sqlite.MentionRules{Excluded: []string{"recipe"}}); err != nil {
		t.Fatal(err)
	}
	at := day.Add(10 * time.Hour).Unix()
	for _, m := range []sqlite.Mention{
		{Site: site, Source: "hn", URL: "https://news.ycombinator.com/item?id=1", Title: "Show HN: I built acme.example", Host: "news.ycombinator.com", PostedAt: at},
		{Site: site, Source: "hn", URL: "https://news.ycombinator.com/item?id=3", Title: "Ask HN: has anyone tried acme.example?", Host: "blog.example", PostedAt: at + 60},
		{Site: site, Source: "news", URL: "https://food.example/acme-recipe", Title: "Acme Metrics recipe", Host: "food.example", PostedAt: at + 120},
		{Site: site, Source: "hn", URL: "https://news.ycombinator.com/item?id=2", Title: "Old news about acme.example", Host: "news.ycombinator.com", PostedAt: day.AddDate(0, 0, -90).Unix()},
	} {
		if _, err := st.SaveMention(ctx, m, at); err != nil {
			t.Fatal(err)
		}
	}
	if err := st.Close(); err != nil {
		t.Fatal(err)
	}
	dk, err := duck.Open(ctx, dir+"/trckable.duckdb", duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	ts := day.Add(11 * time.Hour)
	for i := 0; i < 5; i++ {
		if _, err := dk.DB.ExecContext(ctx, `INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id) VALUES (?, ?, ?, 1, ?, ?)`, i+1, site, ts, i+1, i+1); err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 3; i++ {
		if _, err := dk.DB.ExecContext(ctx, `INSERT INTO sessions (site_id, session_id, visitor_id, start, last, referrer, pvs, goals, engaged_ms, dur) VALUES (?, ?, ?, ?, ?, 'news.ycombinator.com', 1, 0, 0, 0)`, site, i+1, i+1, ts, ts); err != nil {
			t.Fatal(err)
		}
	}
	if err := dk.Close(); err != nil {
		t.Fatal(err)
	}
}
