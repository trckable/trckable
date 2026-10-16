package server

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/writer"
)

// recorded answers each source's address from the files the mentions package
// keeps; no test here touches the network.
type recorded struct {
	t     *testing.T
	mu    sync.Mutex
	calls map[string]int
	limit map[string]bool // host -> answer 429
}

func (r *recorded) Do(req *http.Request) (*http.Response, error) {
	u := req.URL
	file := map[string]string{
		"hn.algolia.com/api/v1/search_by_date": "hn_search.json",
		"hn.algolia.com/api/v1/search":         "hn_front.json",
		"news.google.com/rss/search":           "gnews.xml",
		"api.gdeltproject.org/api/v2/doc/doc":  "gdelt.json",
		"api.producthunt.com/v2/api/graphql":   "ph_posts.json",
	}[u.Host+u.Path]
	r.mu.Lock()
	r.calls[u.Host]++
	limited := r.limit[u.Host]
	r.mu.Unlock()
	if limited {
		return &http.Response{StatusCode: 429, Body: io.NopCloser(strings.NewReader(""))}, nil
	}
	if file == "" {
		r.t.Fatalf("unexpected call to %s", u)
	}
	b, err := os.ReadFile(filepath.Join("..", "mentions", "testdata", file))
	if err != nil {
		r.t.Fatal(err)
	}
	return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(string(b)))}, nil
}

type mentionRig struct {
	f    *mentionFinder
	st   *sqlite.Store
	db   *duck.Store
	site string
	net  *recorded
	now  time.Time
	told []sqlite.Mention
}

var mday = time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)

func newMentionRig(t *testing.T) *mentionRig {
	t.Helper()
	ctx := context.Background()
	dir := t.TempDir()
	st, err := sqlite.Open(ctx, filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	dk, err := duck.Open(ctx, filepath.Join(dir, "a.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { dk.Close() })
	site, err := st.CreateSite(ctx, sqlite.DefaultAccount, "acme.example", "Acme")
	if err != nil {
		t.Fatal(err)
	}
	r := &mentionRig{st: st, db: dk, site: site, now: mday.Add(12 * time.Hour), net: &recorded{t: t, calls: map[string]int{}, limit: map[string]bool{}}}
	r.f = &mentionFinder{
		st: st, get: r.net, every: 20 * time.Minute, token: "tok",
		now:     func() time.Time { return r.now },
		sleep:   func(context.Context, time.Duration) {},
		gap:     mentionGap,
		analyze: func() *sql.DB { return dk.DB },
		told: func(_ context.Context, _ sqlite.SiteRow, m sqlite.Mention) bool {
			r.told = append(r.told, m)
			return true
		},
	}
	return r
}

// visit writes one session that arrived from a host at a moment.
func (r *mentionRig) visit(t *testing.T, id int, from string, at time.Time) {
	t.Helper()
	_, err := r.db.DB.Exec(`INSERT INTO sessions (site_id, session_id, visitor_id, start, last, referrer, pvs, goals, engaged_ms, dur)
		VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, 0)`, r.site, id, id, at.UTC(), at.UTC(), from)
	if err != nil {
		t.Fatal(err)
	}
}

func (r *mentionRig) all(t *testing.T) map[string]sqlite.Mention {
	t.Helper()
	list, err := r.st.Mentions(context.Background(), r.site, 0, r.now.Add(time.Hour).Unix(), 100)
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]sqlite.Mention{}
	for _, m := range list {
		key := m.Source + ":" + m.Host
		if m.Source == "ph" && strings.HasSuffix(m.URL, "/tool") {
			key += ":tool"
		}
		if m.Kind == "comment" {
			key += ":comment"
		}
		out[key] = m
	}
	return out
}

// One round finds the story, the comment, the launch and the articles (one
// story told by both news sources is one mention), notes the front page, and
// counts what each brought inside its window.
func TestMentionsAreFoundDedupedAndCounted(t *testing.T) {
	r := newMentionRig(t)
	ctx := context.Background()
	story := mday.Add(10*time.Hour + 10*time.Minute)
	r.visit(t, 1, "news.ycombinator.com", story.Add(-11*time.Minute)) // before the window
	r.visit(t, 2, "news.ycombinator.com", story.Add(-9*time.Minute))  // inside, just
	for i := 0; i < 24; i++ {
		r.visit(t, 10+i, "news.ycombinator.com", story.Add(time.Duration(5+i)*time.Minute))
	}
	r.visit(t, 50, "google.com", story.Add(time.Hour)) // another source's visit is not theirs
	r.visit(t, 60, "dailybyte.example", mday.Add(9*time.Hour+40*time.Minute))
	r.visit(t, 61, "producthunt.com", mday.Add(7*time.Hour+30*time.Minute))

	r.f.round(ctx)
	got := r.all(t)
	if len(got) != 6 {
		keys := []string{}
		for k := range got {
			keys = append(keys, k)
		}
		t.Fatalf("want story, comment, launch, tool, two articles; got %v", keys)
	}
	// The comment came ten minutes after the story: the story has the visits up to it, the comment the rest.
	hn := got["hn:news.ycombinator.com"]
	if hn.Visitors != 6 || !hn.Front || hn.Points != 212 || hn.Author != "maker1" || hn.PeakHour != mday.Add(10*time.Hour).Unix() {
		t.Fatalf("story: %+v", hn)
	}
	if c := got["hn:news.ycombinator.com:comment"]; c.Visitors != 19 || c.Kind != "comment" || !strings.Contains(c.Snippet, "acme.example") {
		t.Fatalf("the comment has what came after it, and its own sentence: %+v", c)
	}
	if n := got["news:dailybyte.example"]; n.Visitors != 1 || n.Source != "news" {
		t.Fatalf("article: %+v", n)
	}
	if ph := got["ph:producthunt.com"]; ph.Visitors != 1 || ph.Points != 321 {
		t.Fatalf("launch: %+v", ph)
	}
	// Told once: the story is on the front page. The comment's 19 are under the line.
	if len(r.told) != 1 || r.told[0].Source != "hn" || r.told[0].Kind != "" {
		t.Fatalf("told %+v", r.told)
	}
	cur, _ := r.st.MentionCursors(ctx, "hn")
	if cur[r.site].Cursor != story.Add(10*time.Minute).Unix() {
		t.Fatalf("the cursor is the newest post: %+v", cur)
	}

	// A second round finds nothing new, and counts the visitors that came since.
	r.now = r.now.Add(20 * time.Minute)
	r.visit(t, 99, "news.ycombinator.com", r.now.Add(-time.Minute))
	r.f.round(ctx)
	again := r.all(t)
	if len(again) != 6 || again["hn:news.ycombinator.com"].Visitors != 6 || again["hn:news.ycombinator.com:comment"].Visitors != 20 {
		t.Fatalf("again: %+v", again["hn:news.ycombinator.com:comment"])
	}
	// Each mention is told once: the comment now has 20 of its own, the story is not told again.
	if len(r.told) != 2 || r.told[1].Kind != "comment" {
		t.Fatalf("a mention is told once: %d", len(r.told))
	}
}

// The count stops two days after the post, and a later mention from the same
// host keeps the visitors that come after it.
func TestMentionWindowsEndAtTwoDaysAndAtTheNextPost(t *testing.T) {
	r := newMentionRig(t)
	ctx := context.Background()
	at := func(h int) int64 { return mday.Add(time.Duration(h) * time.Hour).Unix() }
	for i, h := range []int{1, 5} {
		_, err := r.st.SaveMention(ctx, sqlite.Mention{Site: r.site, Source: "news", URL: fmt.Sprintf("https://blog.example/%d", i), Host: "blog.example", PostedAt: at(h)}, at(h))
		if err != nil {
			t.Fatal(err)
		}
	}
	r.now = mday.Add(60 * time.Hour)
	for i, h := range []int{2, 4, 6, 49} { // hour 6 is after the second post; hour 49 is past the first one's two days
		r.visit(t, i+1, "blog.example", mday.Add(time.Duration(h)*time.Hour))
	}
	r.f.score(ctx, []sqlite.SiteRow{{ID: r.site, Domain: "acme.example"}})
	list, _ := r.st.Mentions(ctx, r.site, 0, at(100), 10)
	first, second := list[1], list[0]
	if first.Visitors != 2 || second.Visitors != 2 {
		t.Fatalf("first %d (hours 2 and 4), second %d (hours 6 and 49 is out: 49h after 05:00 is 54)", first.Visitors, second.Visitors)
	}
	// Settled: a later look leaves the number alone.
	r.now = mday.Add(200 * time.Hour)
	r.visit(t, 9, "blog.example", mday.Add(7*time.Hour))
	r.f.score(ctx, []sqlite.SiteRow{{ID: r.site, Domain: "acme.example"}})
	if again, _ := r.st.Mentions(ctx, r.site, 0, at(100), 10); again[0].Visitors != 2 {
		t.Fatalf("settled: %+v", again[0])
	}
}

// A source that asks for quiet is left alone, longer each time; the others go on.
func TestMentionSourceBacksOff(t *testing.T) {
	r := newMentionRig(t)
	ctx := context.Background()
	r.net.limit["hn.algolia.com"] = true
	r.f.round(ctx)
	hn := r.net.calls["hn.algolia.com"]
	if hn == 0 || r.net.calls["news.google.com"] == 0 {
		t.Fatalf("calls: %v", r.net.calls)
	}
	r.f.round(ctx)
	if r.net.calls["hn.algolia.com"] != hn {
		t.Fatalf("Hacker News was asked again inside its pause: %v", r.net.calls)
	}
	r.now = r.now.Add(2 * time.Minute)
	r.f.round(ctx)
	if r.net.calls["hn.algolia.com"] == hn {
		t.Fatalf("not asked after the pause: %v", r.net.calls)
	}
	// A third failure doubles the pause: 1, 2, 4 minutes.
	d := (&pauses{}).failed("x", r.now)
	if d != time.Minute {
		t.Fatalf("%v", d)
	}
	p := &pauses{}
	for i := 0; i < 12; i++ {
		d = p.failed("x", r.now)
	}
	if d != mentionPauseMax {
		t.Fatalf("the pause is capped: %v", d)
	}
	p.ok("x")
	if p.blocked("x", r.now) {
		t.Fatal("a good answer ends the pause")
	}
}

// Without a token Product Hunt is not asked at all.
func TestProductHuntNeedsAToken(t *testing.T) {
	r := newMentionRig(t)
	r.f.token = ""
	r.f.round(context.Background())
	if r.net.calls["api.producthunt.com"] != 0 {
		t.Fatalf("calls: %v", r.net.calls)
	}
	if got := MentionSources(false); len(got) != 2 || got[0] != "hn" || got[1] != "news" {
		t.Fatalf("%v", got)
	}
}

// The mail says where, how many, and links the dashboard.
func TestMentionEventWords(t *testing.T) {
	site := sqlite.SiteRow{ID: "s", Domain: "acme.example"}
	ev := mentionEvent(site, sqlite.Mention{Source: "hn", URL: "https://news.ycombinator.com/item?id=1", Title: "Show HN: <Acme>", Author: "pg", Points: 120, Snippet: "acme.example is neat", Visitors: 1212, Front: true}, "https://app.example/acme.example")
	if ev.Kind != "mention" || ev.Title != "Mentioned on Hacker News" || !strings.Contains(ev.Message, "1212 people have come from it") || ev.Email == nil {
		t.Fatalf("%+v", ev)
	}
	r := alerts.Compose(ev)
	for _, want := range []string{"1,212", "On the front page", "#ff6600", ">Y<", "by pg · 120 points", "Show HN: &lt;Acme&gt;", `href="https://news.ycombinator.com/item?id=1"`, "&ldquo;", "acme.&#8203;example is neat", "See it on your dashboard →"} {
		if !strings.Contains(r.HTML, want) {
			t.Errorf("html misses %q", want)
		}
	}
	if !strings.Contains(r.Text, "Hacker News · by pg · 120 points\nShow HN: <Acme>\n“acme.example is neat”") {
		t.Errorf("text:\n%s", r.Text)
	}
	if got := mentionEvent(site, sqlite.Mention{Source: "news", Title: "x"}, ""); got.Title != "Mentioned in the news" {
		t.Fatalf("%+v", got)
	}
}

// A site's "keep for N days" removes its old mentions too, and only its own.
func TestRetentionRemovesOldMentions(t *testing.T) {
	r := newMentionRig(t)
	ctx := context.Background()
	other, _ := r.st.CreateSite(ctx, sqlite.DefaultAccount, "other.example", "")
	now := time.Now()
	for _, site := range []string{r.site, other} {
		for i, ago := range []int{5, 60} {
			_, err := r.st.SaveMention(ctx, sqlite.Mention{Site: site, Source: "news", URL: fmt.Sprintf("https://x.example/%s/%d", site, i), PostedAt: now.AddDate(0, 0, -ago).Unix()}, now.Unix())
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	if _, err := r.st.DB.ExecContext(ctx, `INSERT INTO site_settings (site_id, retention_days, updated_at) VALUES (?, 30, 0)`, r.site); err != nil {
		t.Fatal(err)
	}
	(&Server{ctl: r.st}).pruneMentions(ctx)
	mine, _ := r.st.Mentions(ctx, r.site, 0, now.Add(time.Hour).Unix(), 10)
	theirs, _ := r.st.Mentions(ctx, other, 0, now.Add(time.Hour).Unix(), 10)
	if len(mine) != 1 || len(theirs) != 2 {
		t.Fatalf("mine %d (the 60-day one goes), theirs %d (no limit set)", len(mine), len(theirs))
	}
}

// save puts mentions of one host in the store at the given hours.
func (r *mentionRig) save(t *testing.T, host string, kind string, hours ...float64) {
	t.Helper()
	for i, h := range hours {
		at := mday.Add(time.Duration(h * float64(time.Hour))).Unix()
		_, err := r.st.SaveMention(context.Background(), sqlite.Mention{Site: r.site, Source: "hn", URL: fmt.Sprintf("https://%s/item?id=%d%s", host, int(h*100)+i, kind), Kind: kind, Host: host, PostedAt: at}, at)
		if err != nil {
			t.Fatal(err)
		}
	}
}

func (r *mentionRig) scored(t *testing.T) []sqlite.Mention {
	t.Helper()
	r.f.score(context.Background(), []sqlite.SiteRow{{ID: r.site, Domain: "acme.example"}})
	list, err := r.st.Mentions(context.Background(), r.site, 0, mday.Add(100*time.Hour).Unix(), 10)
	if err != nil {
		t.Fatal(err)
	}
	slices.Reverse(list) // oldest first
	return list
}

// A comment, then a story an hour later from the same host: each visit is the
// comment's or the story's, never both.
func TestMentionsNeverCountTheSameVisitTwice(t *testing.T) {
	r := newMentionRig(t)
	r.save(t, "news.ycombinator.com", "comment", 1)
	r.save(t, "news.ycombinator.com", "", 2)
	r.now = mday.Add(5 * time.Hour)
	for i, h := range []float64{0.9, 1.2, 1.9, 2.1, 2.5} {
		r.visit(t, i+1, "news.ycombinator.com", mday.Add(time.Duration(h*float64(time.Hour))))
	}
	got := r.scored(t)
	// 0.9 h is inside the comment's ten minutes before; 1.2 and 1.9 are the comment's; 2.1 and 2.5 are the story's.
	if got[0].Visitors != 3 || got[1].Visitors != 2 {
		t.Fatalf("comment %d (0.9, 1.2, 1.9), story %d (2.1, 2.5)", got[0].Visitors, got[1].Visitors)
	}
}

// Two stories five minutes apart: a visit after the second belongs to the second alone.
func TestTwoPostsMinutesApartShareNothing(t *testing.T) {
	r := newMentionRig(t)
	r.save(t, "news.ycombinator.com", "", 3, 3+5.0/60)
	r.now = mday.Add(6 * time.Hour)
	r.visit(t, 1, "news.ycombinator.com", mday.Add(3*time.Hour+2*time.Minute))  // the first's
	r.visit(t, 2, "news.ycombinator.com", mday.Add(3*time.Hour+7*time.Minute))  // the second's
	r.visit(t, 3, "news.ycombinator.com", mday.Add(3*time.Hour+30*time.Minute)) // the second's
	got := r.scored(t)
	if got[0].Visitors != 1 || got[1].Visitors != 2 {
		t.Fatalf("first %d, second %d", got[0].Visitors, got[1].Visitors)
	}
	if got[0].Visitors+got[1].Visitors != 3 {
		t.Fatal("three visitors, counted three times in all")
	}
}

// A big shared site says nothing about one post on it: only a visit from the
// post's own page counts. Visits still open (not yet written) count too.
func TestGenericHostsCountByPageAndOpenVisitsCount(t *testing.T) {
	r := newMentionRig(t)
	ctx := context.Background()
	at := mday.Add(2 * time.Hour)
	for _, m := range []sqlite.Mention{
		{Site: r.site, Source: "news", URL: "https://medium.com/@maker/acme-review", Host: "medium.com", PostedAt: at.Unix()},
		{Site: r.site, Source: "news", URL: "https://blog.example/acme", Host: "blog.example", PostedAt: at.Unix()},
	} {
		if _, err := r.st.SaveMention(ctx, m, at.Unix()); err != nil {
			t.Fatal(err)
		}
	}
	r.now = at.Add(3 * time.Hour)
	r.visit(t, 1, "medium.com", at.Add(time.Hour))
	r.visit(t, 2, "medium.com", at.Add(2*time.Hour))
	for i, ref := range []string{"medium.com/@maker/acme-review", "medium.com/@other/post"} {
		_, err := r.db.DB.Exec(`INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, referrer_url) VALUES (?, ?, ?, 1, ?, ?, ?)`,
			i+1, r.site, at.Add(time.Hour).UTC(), 10+i, 10+i, ref)
		if err != nil {
			t.Fatal(err)
		}
	}
	r.f.open = func(string) []writer.Session {
		return []writer.Session{{Site: r.site, Visitor: 77, Start: at.Add(90 * time.Minute).UnixMilli(), Referrer: "blog.example"}, {Site: r.site, Visitor: 78, Start: at.Add(90 * time.Minute).UnixMilli(), Referrer: "medium.com"}}
	}
	got := map[string]int64{}
	for _, m := range r.scored(t) {
		got[m.Host] = m.Visitors
	}
	if got["medium.com"] != 1 || got["blog.example"] != 1 {
		t.Fatalf("medium: one visit from the post's page, none host-wide; the blog: the open visit: %v", got)
	}
}

// The passes run side by side over the same sites: each sorts its own copy.
func TestRoundSharesNoSlicesBetweenPasses(t *testing.T) {
	r := newMentionRig(t)
	ctx := context.Background()
	for k, d := range []string{"b.example", "c.example", "d.example"} {
		id, err := r.st.CreateSite(ctx, sqlite.DefaultAccount, d, "")
		if err != nil {
			t.Fatal(err)
		}
		for i, src := range []string{"hn", "news"} {
			_ = r.st.SaveMentionCursor(ctx, id, src, sqlite.MentionCursor{CheckedAt: int64(1000 - k*100 + i*10)})
		}
	}
	r.f.round(ctx) // go test -race fails here if two passes sort one slice
}
