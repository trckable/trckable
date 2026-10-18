package sqlite

import (
	"context"
	"errors"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func TestMentionKeywordsAreCleanedAndCapped(t *testing.T) {
	ctx := context.Background()
	st, site := openIncidents(t)
	if err := st.SetMentionKeywords(ctx, site, []string{" Acme  Metrics ", "acme metrics", "", "@acme"}, 100); err != nil {
		t.Fatal(err)
	}
	got, _ := st.MentionKeywords(ctx, site)
	if !reflect.DeepEqual(got, []string{"Acme Metrics", "@acme"}) {
		t.Fatalf("%v", got)
	}
	for name, bad := range map[string][]string{
		"too short": {"ab"},
		"quote":     {`say "hi"`},
		"too long":  {strings.Repeat("x", 61)},
		"eleven":    {"aaa", "bbb", "ccc", "ddd", "eee", "fff", "ggg", "hhh", "iii", "jjj", "kkk"},
	} {
		if err := st.SetMentionKeywords(ctx, site, bad, 1); !errors.Is(err, ErrKeywords) {
			t.Errorf("%s: %v", name, err)
		}
	}
	if kept, _ := st.MentionKeywords(ctx, site); len(kept) != 2 {
		t.Fatalf("a refused list changed nothing: %v", kept)
	}
	// The address comes first, a word is searched once.
	words := JoinWords(SiteRow{Domain: "acme.com", Name: "Acme"}, []string{"acme", "@acme", "ACME"})
	if !reflect.DeepEqual(words, []string{"acme.com", "www.acme.com", "acme", "@acme"}) {
		t.Fatalf("%v", words)
	}
}

func TestMentionSavedOnceThenOnlyWhatChanges(t *testing.T) {
	ctx := context.Background()
	st, site := openIncidents(t)
	m := Mention{Site: site, Source: "hn", URL: "https://news.ycombinator.com/item?id=1", Title: "Show HN", Host: "news.ycombinator.com", Points: 5, PostedAt: 1000}
	if added, err := st.SaveMention(ctx, m, 2000); err != nil || !added {
		t.Fatalf("%v %v", added, err)
	}
	m.Points, m.Front, m.Title, m.PostedAt = 40, true, "Show HN: new", 9999
	if added, err := st.SaveMention(ctx, m, 3000); err != nil || added {
		t.Fatalf("the same address is one mention: %v %v", added, err)
	}
	list, _ := st.Mentions(ctx, site, 0, 10000, 10)
	if len(list) != 1 || list[0].Points != 40 || !list[0].Front || list[0].Title != "Show HN: new" || list[0].PostedAt != 1000 || list[0].FoundAt != 2000 {
		t.Fatalf("%+v", list)
	}
	// Points never go down.
	m.Points = 3
	_, _ = st.SaveMention(ctx, m, 4000)
	if list, _ = st.Mentions(ctx, site, 0, 10000, 10); list[0].Points != 40 {
		t.Fatalf("%+v", list[0])
	}
}

func TestMentionsPeriodScoreCursorPruneAndDelete(t *testing.T) {
	ctx := context.Background()
	st, site := openIncidents(t)
	for i, at := range []int64{100, 200, 300} {
		_, err := st.SaveMention(ctx, Mention{Site: site, Source: "news", URL: "https://x.example/" + string(rune('a'+i)), Host: "x.example", PostedAt: at}, 500)
		if err != nil {
			t.Fatal(err)
		}
	}
	got, _ := st.Mentions(ctx, site, 150, 301, 10)
	if len(got) != 2 || got[0].PostedAt != 300 {
		t.Fatalf("newest first, inside the period: %+v", got)
	}
	if unscored, _ := st.MentionsToScore(ctx, 1000); len(unscored) != 3 {
		t.Fatalf("a mention never scored is always to score: %d", len(unscored))
	}
	if err := st.SaveScore(ctx, got[0].ID, 212, 3600, 600); err != nil {
		t.Fatal(err)
	}
	if err := st.MarkMentionAlerted(ctx, got[0].ID); err != nil {
		t.Fatal(err)
	}
	scored, _ := st.Mentions(ctx, site, 300, 301, 1)
	if scored[0].Visitors != 212 || scored[0].PeakHour != 3600 || !scored[0].Alerted {
		t.Fatalf("%+v", scored[0])
	}
	if err := st.SaveMentionCursor(ctx, site, "hn", MentionCursor{Cursor: 7, ETag: "e", CheckedAt: 9}); err != nil {
		t.Fatal(err)
	}
	if c, _ := st.MentionCursors(ctx, "hn"); c[site] != (MentionCursor{Cursor: 7, ETag: "e", CheckedAt: 9}) {
		t.Fatalf("%+v", c)
	}
	if n, err := st.PruneMentions(ctx, site, 250); err != nil || n != 2 {
		t.Fatalf("%d %v", n, err)
	}
	_ = st.SetMentionKeywords(ctx, site, []string{"acme"}, 1)
	if _, err := st.DeleteSite(ctx, site); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"mentions", "mention_keywords", "mention_cursor"} {
		var n int
		if err := st.DB.QueryRowContext(ctx, `SELECT count(*) FROM `+table).Scan(&n); err != nil || n != 0 {
			t.Errorf("%s keeps %d rows of a deleted site (%v)", table, n, err)
		}
	}
}

func TestSearchWordsAreTheAddressOnly(t *testing.T) {
	for _, c := range []struct {
		domain, name string
		added        []string
		want         []string
	}{
		{"albas.al", "albas", nil, []string{"albas.al", "www.albas.al"}}, // the bare name is not a default
		{"acme.example", "Acme Metrics", nil, []string{"acme.example", "www.acme.example"}},
		{"www.acme.example", "", nil, []string{"acme.example", "www.acme.example"}},
		{"albas.al", "albas", []string{"albas"}, []string{"albas.al", "www.albas.al", "albas"}}, // the owner may add it
	} {
		got := JoinWords(SiteRow{Domain: c.domain, Name: c.name}, c.added)
		if !slices.Equal(got, c.want) {
			t.Errorf("%s / %s: %v, want %v", c.domain, c.name, got, c.want)
		}
	}
}

func TestMentionRulesAreCleanedAndKeptPerSite(t *testing.T) {
	ctx := context.Background()
	st, site := openIncidents(t)
	err := st.SetMentionRules(ctx, site, MentionRules{Topic: []string{" analytics ", "Analytics"}, Excluded: []string{"MP", ""}, Blocked: []string{"https://www.Reddit.com/r/x", "reddit.com"}})
	if err != nil {
		t.Fatal(err)
	}
	got, _ := st.MentionRules(ctx, site)
	if !reflect.DeepEqual(got, MentionRules{Topic: []string{"analytics"}, Required: []string{}, Excluded: []string{"MP"}, Blocked: []string{"reddit.com"}}) {
		t.Fatalf("%+v", got)
	}
	if err := st.SetMentionRules(ctx, site, MentionRules{Required: []string{`a "quote"`}}); !errors.Is(err, ErrKeywords) {
		t.Fatalf("%v", err)
	}
	if kept, _ := st.MentionRules(ctx, site); len(kept.Topic) != 1 {
		t.Fatalf("a refused list changed nothing: %+v", kept)
	}
}

func TestOnlyShownMentionsAreListedAndCounted(t *testing.T) {
	ctx := context.Background()
	st, site := openIncidents(t)
	for i, state := range []string{MentionShown, MentionHidden, MentionRejected, MentionPending} {
		if _, err := st.SaveMention(ctx, Mention{Site: site, Source: "news", URL: "https://x.example/" + string(rune('a'+i)), Host: "x.example", PostedAt: 100, State: state}, 100); err != nil {
			t.Fatal(err)
		}
	}
	if l, _ := st.Mentions(ctx, site, 0, 1000, 10); len(l) != 1 || l[0].State != MentionShown {
		t.Fatalf("%+v", l)
	}
	if l, _ := st.HiddenMentions(ctx, site, 10); len(l) != 2 {
		t.Fatalf("hidden and rejected: %+v", l)
	}
	if talked, _ := st.SitesWithMentions(ctx); !talked[site] {
		t.Fatal("the shown one counts")
	}
	// Finding one again does not change what it is.
	if _, err := st.SaveMention(ctx, Mention{Site: site, Source: "news", URL: "https://x.example/b", Host: "x.example", Title: "later", PostedAt: 100, State: MentionShown}, 200); err != nil {
		t.Fatal(err)
	}
	if st, _, _ := st.MentionState(ctx, site, "https://x.example/b"); st != MentionHidden {
		t.Fatalf("still %s", st)
	}
}
