package server

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/mentions"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// refVisit writes one pageview that arrived from a page.
func (r *mentionRig) refVisit(t *testing.T, seq, visitor int, page string, at time.Time) {
	t.Helper()
	channel := "Referral"
	if strings.HasPrefix(page, "chatgpt.com") {
		channel = "AI"
	} else if strings.HasPrefix(page, "google.") {
		channel = "Search"
	}
	if _, err := r.db.DB.Exec(`INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, referrer_url, channel) VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
		seq, r.site, at.UTC(), visitor, visitor, page, channel); err != nil {
		t.Fatal(err)
	}
}

// A page that sent visitors becomes a confirmed mention with its visitors,
// without any word matching: the visits are the proof. A page that sent one
// person, a webmail page and the site's own pages are not mentions.
func TestAPageThatSentVisitorsIsAConfirmedMention(t *testing.T) {
	r := newMentionRig(t)
	ctx := context.Background()
	at := mday.Add(9 * time.Hour)
	seq := 0
	visit := func(page string, visitors ...int) {
		for _, v := range visitors {
			seq++
			r.refVisit(t, seq, v, page, at.Add(time.Duration(seq)*time.Minute))
		}
	}
	visit("reddit.com/r/saas/comments/abc/best_analytics", 1, 2, 3, 3)
	visit("reddit.com/r/other/comments/x/one_person", 4)
	visit("chatgpt.com/c/0f3a-private", 5, 6)
	visit("google.de/search/x", 11, 12)
	visit("acme.example/blog/post", 7, 8)
	visit("blog.example/roundup", 9, 10)

	r.f.round(ctx)
	got := r.all(t)
	reddit := got["ref:reddit.com"]
	if reddit.Via != mentions.ViaPage || reddit.Visitors != 3 || reddit.URL != "https://reddit.com/r/saas/comments/abc/best_analytics" || reddit.PeakHour != at.Unix() {
		t.Fatalf("reddit: %+v", reddit)
	}
	if blog := got["ref:blog.example"]; blog.Visitors != 2 {
		t.Fatalf("a page of another site that sent two people: %+v", blog)
	}
	for k, m := range got {
		if m.Source == "ref" && (strings.Contains(m.URL, "chatgpt") || strings.Contains(m.URL, "google.de") || strings.Contains(m.URL, "acme.example") || strings.Contains(m.URL, "one_person")) {
			t.Errorf("%s should not be a mention: %+v", k, m)
		}
	}

	// A second round neither adds it again nor loses the count; more visitors raise it.
	r.now = r.now.Add(2 * time.Hour)
	visit("reddit.com/r/saas/comments/abc/best_analytics", 21)
	r.f.round(ctx)
	refs := 0
	for _, m := range r.all(t) {
		if m.Source == "ref" {
			refs++
		}
	}
	if again := r.all(t)["ref:reddit.com"]; refs != 2 || again.Visitors != 4 {
		t.Fatalf("refs %d, visitors %d", refs, again.Visitors)
	}
}

// A page found by its words and later confirmed by visits is one mention, not two.
func TestAPageFoundByWordsAndByVisitsIsOne(t *testing.T) {
	r := newMentionRig(t)
	ctx := context.Background()
	at := mday.Add(2 * time.Hour)
	if _, err := r.st.SaveMention(ctx, sqlite.Mention{Site: r.site, Source: "news", URL: "https://www.paper.example/2026/acme-review", Title: "acme.example reviewed", Host: "paper.example", PostedAt: at.Unix(), Via: mentions.ViaDomain}, at.Unix()); err != nil {
		t.Fatal(err)
	}
	r.refVisit(t, 1, 1, "paper.example/2026/acme-review", at.Add(time.Hour))
	r.refVisit(t, 2, 2, "paper.example/2026/acme-review", at.Add(2*time.Hour))
	r.f.round(ctx)
	n := 0
	for _, m := range r.all(t) {
		if m.Host == "paper.example" {
			n++
			if m.Via != mentions.ViaPage || m.Visitors != 2 {
				t.Fatalf("%+v", m)
			}
		}
	}
	if n != 1 {
		t.Fatalf("one page, one mention, got %d", n)
	}
}

// "Not about us" hides a mention for good: the round does not find it again,
// no count carries it, and it is kept in the hidden list. Restoring brings it back.
func TestNotAboutUsHidesAndStaysHidden(t *testing.T) {
	r := newMentionRig(t)
	ctx := context.Background()
	r.f.round(ctx)
	before := r.all(t)
	article := before["news:dailybyte.example"]
	if article.ID == 0 {
		t.Fatalf("the round finds the article: %v", before)
	}
	if ok, err := r.st.SetMentionState(ctx, r.site, article.ID, sqlite.MentionHidden); err != nil || !ok {
		t.Fatal(err)
	}
	r.now = r.now.Add(25 * time.Minute)
	r.f.round(ctx)
	after := r.all(t)
	if _, ok := after["news:dailybyte.example"]; ok || len(after) != len(before)-1 {
		t.Fatalf("hidden stays out: %d of %d", len(after), len(before))
	}
	if hidden, _ := r.st.HiddenMentions(ctx, r.site, 10); len(hidden) != 1 || hidden[0].ID != article.ID {
		t.Fatalf("hidden list: %+v", hidden)
	}
	if talked, _ := r.st.SitesWithMentions(ctx); !talked[r.site] {
		t.Fatal("the others still count")
	}
	if _, err := r.st.SetMentionState(ctx, r.site, article.ID, sqlite.MentionShown); err != nil {
		t.Fatal(err)
	}
	if _, ok := r.all(t)["news:dailybyte.example"]; !ok {
		t.Fatal("restored")
	}
}

// Every list and count reads the shown rows: a site whose only mention is hidden has none.
func TestCountsAreTheVisibleRows(t *testing.T) {
	r := newMentionRig(t)
	ctx := context.Background()
	at := mday.Add(time.Hour).Unix()
	for i, state := range []string{sqlite.MentionShown, sqlite.MentionHidden, sqlite.MentionRejected, sqlite.MentionPending} {
		u := "https://x.example/" + string(rune('a'+i))
		if _, err := r.st.SaveMention(ctx, sqlite.Mention{Site: r.site, Source: "news", URL: u, Host: "x.example", PostedAt: at, State: state}, at); err != nil {
			t.Fatal(err)
		}
	}
	list, _ := r.st.Mentions(ctx, r.site, 0, at+1000, 100)
	talked, _ := r.st.SitesWithMentions(ctx)
	if len(list) != 1 || !talked[r.site] {
		t.Fatalf("one shown row: %d", len(list))
	}
	if todo, _ := r.st.MentionsToScore(ctx, 0); len(todo) != 1 {
		t.Fatalf("only a shown row is scored or alerted about: %d", len(todo))
	}
	all, _ := r.st.AllMentions(ctx, r.site, 0, at+1000, 100)
	if len(all) != 4 {
		t.Fatalf("the finder sees all four: %d", len(all))
	}
}

// The same story from other publishers, with the headline copied, counts once
// whichever was found first; and a story already hidden is not found again as a copy.
func TestCopiesOfAStoryCountOnce(t *testing.T) {
	r := newMentionRig(t)
	ctx := context.Background()
	at := r.now.Add(-time.Hour).Unix()
	for i, c := range []struct{ host, title string }{
		{"one.example", "acme.example launches a new analytics dashboard - One"},
		{"two.example", "acme.example launches a new analytics dashboard | Two"},
		{"three.example", "ACME.EXAMPLE launches a new analytics dashboard!"},
		{"four.example", "acme.example raises prices on its plans"},
	} {
		if _, err := r.st.SaveMention(ctx, sqlite.Mention{Site: r.site, Source: "news", URL: "https://" + c.host + "/s", Title: c.title, Host: c.host, PostedAt: at, Via: mentions.ViaDomain}, at+int64(i)); err != nil {
			t.Fatal(err)
		}
	}
	r.f.round(ctx)
	n := 0
	for _, m := range r.all(t) {
		if strings.Contains(m.Title, "analytics dashboard") && m.Source == "news" && m.Host != "dailybyte.example" {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("three copies of one story, kept %d", n)
	}
	if _, ok := r.all(t)["news:four.example"]; !ok {
		t.Fatal("a different story stays")
	}
}

// A rule the owner adds takes effect on what was already found.
func TestANewRuleRemovesWhatItRulesOut(t *testing.T) {
	r := newMentionRig(t)
	ctx := context.Background()
	r.f.round(ctx)
	if _, ok := r.all(t)["news:blog.other.example"]; !ok {
		t.Fatalf("found first: %v", r.all(t))
	}
	if err := r.st.SetMentionRules(ctx, r.site, sqlite.MentionRules{Topic: []string{"analytics", "dashboard", "review"}, Blocked: []string{"https://www.blog.other.example/x"}}); err != nil {
		t.Fatal(err)
	}
	r.now = r.now.Add(25 * time.Minute)
	r.f.round(ctx)
	if _, ok := r.all(t)["news:blog.other.example"]; ok {
		t.Fatal("a blocked site's mention is removed")
	}
}

type judged struct {
	says  func(mentions.Item) (bool, error)
	asked int
}

func (j *judged) About(_ context.Context, _ mentions.Subject, it mentions.Item) (bool, error) {
	j.asked++
	return j.says(it)
}

// The judge runs only after a match; a refusal keeps the item hidden, an
// unanswered question keeps it hidden until the judge answers; the core runs without one.
func TestTheJudgeRunsAfterAMatchAndKeepsRefusalsHidden(t *testing.T) {
	r := newMentionRig(t)
	ctx := context.Background()
	down := true
	j := &judged{says: func(it mentions.Item) (bool, error) {
		switch {
		case strings.Contains(it.Title, "review"):
			return false, nil
		case strings.Contains(it.Title, "Show HN") && down:
			return false, errors.New("judge down")
		}
		return true, nil
	}}
	r.f.judge = j
	r.f.round(ctx)
	got := r.all(t)
	if _, ok := got["news:blog.other.example"]; ok {
		t.Fatal("refused by the judge: not shown")
	}
	if _, ok := got["hn:news.ycombinator.com"]; ok {
		t.Fatal("not answered yet: not shown")
	}
	if hidden, _ := r.st.HiddenMentions(ctx, r.site, 10); len(hidden) != 1 || hidden[0].State != sqlite.MentionRejected {
		t.Fatalf("kept hidden, not deleted: %+v", hidden)
	}
	if pending, _ := r.st.PendingMentions(ctx, r.site, 10); len(pending) != 1 {
		t.Fatalf("waiting: %d", len(pending))
	}
	down = false
	r.now = r.now.Add(25 * time.Minute)
	r.f.round(ctx)
	if _, ok := r.all(t)["hn:news.ycombinator.com"]; !ok {
		t.Fatal("answered: shown")
	}
	if _, ok := r.all(t)["news:blog.other.example"]; ok {
		t.Fatal("a refusal stays a refusal")
	}
}

// Nothing that fails the matcher reaches the judge.
func TestTheJudgeIsNotAskedAboutWhatDidNotMatch(t *testing.T) {
	r := newMentionRig(t)
	if err := r.st.SetMentionRules(context.Background(), r.site, sqlite.MentionRules{Topic: []string{"analytics", "dashboard", "review"}, Excluded: []string{"Acme", "acme.example"}}); err != nil {
		t.Fatal(err)
	}
	j := &judged{says: func(mentions.Item) (bool, error) { return true, nil }}
	r.f.judge = j
	r.f.round(context.Background())
	if j.asked != 0 || len(r.all(t)) != 0 {
		t.Fatalf("asked %d, kept %d", j.asked, len(r.all(t)))
	}
}

// An item kept before the matcher, whose text does not name the site, is hidden at the next round, not deleted.
func TestOldItemsWithoutALinkAreMatchedOnTheirText(t *testing.T) {
	r := newMentionRig(t)
	ctx := context.Background()
	at := r.now.Add(-time.Hour).Unix()
	for i, title := range []string{"Show HN: a map of the world", "Show HN: acme.example now has dashboards"} {
		if _, err := r.st.SaveMention(ctx, sqlite.Mention{Site: r.site, Source: "hn", URL: "https://news.ycombinator.com/item?id=" + string(rune('5'+i)), Title: title, Host: "news.ycombinator.com", PostedAt: at}, at); err != nil {
			t.Fatal(err)
		}
	}
	r.f.review(ctx, r.site, plan{rules: mentions.Rules{Domain: "acme.example"}})
	shown, _ := r.st.Mentions(ctx, r.site, 0, at+100, 10)
	hidden, _ := r.st.HiddenMentions(ctx, r.site, 10)
	if len(shown) != 1 || !strings.Contains(shown[0].Title, "acme.example") || len(hidden) != 1 {
		t.Fatalf("shown %d, hidden %d", len(shown), len(hidden))
	}
}
