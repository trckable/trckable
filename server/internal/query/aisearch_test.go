package query

import (
	"context"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/duck"
)

// aiRig is one site's week: AI sent visitors to /pricing and /blog, robots read
// /pricing, /docs and /changelog, and Google sent people to /guide.
func aiRig(t *testing.T) Q {
	t.Helper()
	st, err := duck.Open(context.Background(), filepath.Join(t.TempDir(), "a.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	sess := func(id int, visitor int, day, channel, ref, entry string) string {
		return `INSERT INTO sessions (site_id, session_id, visitor_id, start, last, channel, referrer, entry_page, pvs, goals, engaged_ms, dur)
			VALUES ('s1', ` + itoa(id) + `, ` + itoa(visitor) + `, TIMESTAMP '` + day + ` 10:00:00', TIMESTAMP '` + day + ` 10:05:00', '` + channel + `', '` + ref + `', '` + entry + `', 1, 0, 0, 0)`
	}
	hit := func(site, day, name, kind, path string, n int) string {
		return `INSERT INTO crawler_hits (site_id, day, name, kind, path, hits, errors) VALUES ('` + site + `', DATE '` + day + `', '` + name + `', '` + kind + `', '` + path + `', ` + itoa(n) + `, 0)`
	}
	for _, q := range []string{
		sess(1, 1, "2026-09-10", "AI", "chatgpt.com", "/pricing"),
		sess(2, 1, "2026-09-11", "AI", "chatgpt.com", "/pricing"), // the same visitor: one
		sess(3, 2, "2026-09-10", "AI", "claude.ai", "/pricing"),
		sess(4, 3, "2026-09-10", "AI", "perplexity.ai", "/blog"),
		sess(5, 4, "2026-09-10", "Search", "google.com", "/guide"),
		sess(6, 5, "2026-09-01", "AI", "chatgpt.com", "/blog"), // before the period
		hit("s1", "2026-09-10", "OpenAI", "train", "/pricing", 30),
		hit("s1", "2026-09-11", "OpenAI", "answer", "/pricing", 10),
		hit("s1", "2026-09-10", "Anthropic", "train", "/docs", 25),
		hit("s1", "2026-09-10", "OpenAI", "train", "/changelog", 12),
		hit("s1", "2026-09-10", "OpenAI", "train", "(other)", 7),
		hit("s1", "2026-09-10", "Google", "index", "/guide", 400),    // a search bot is not AI
		hit("s1", "2026-09-01", "OpenAI", "train", "/pricing", 1000), // before the period
		hit("s2", "2026-09-10", "OpenAI", "train", "/pricing", 900),  // another site
	} {
		if _, err := st.DB.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	return Q{DB: st.DB}
}

func itoa(n int) string { return strconv.Itoa(n) }

var week = Params{Site: "s1", TZ: "UTC", From: time.Date(2026, 9, 7, 0, 0, 0, 0, time.UTC), To: time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)}

func pageOf(r *AISearch, path string) AIPage {
	for _, p := range r.Pages {
		if p.Path == path {
			return p
		}
	}
	return AIPage{Path: "missing:" + path}
}

// The tab's numbers: AI's visitors by referrer, the robots (AI ones and the
// search engines' indexers, which do not count as crawled by AI), and the
// pages with read against sent.
func TestAISearchCounts(t *testing.T) {
	q := aiRig(t)
	r, err := q.AISearch(context.Background(), week, AIOptions{})
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "visitors", r.Visitors, int64(3))
	eq(t, "referrers", len(r.Referrers), 3)
	eq(t, "busiest referrer", r.Referrers[0].Value, "chatgpt.com")
	eq(t, "its visitors", r.Referrers[0].Visitors, int64(1))
	eq(t, "crawled", r.Crawled, int64(30+10+25+12+7))
	eq(t, "bots", len(r.Bots), 4) // Google index, OpenAI train, Anthropic train, OpenAI answer
	eq(t, "busiest bot", r.Bots[0].Name+"/"+r.Bots[0].Kind, "Google/index")
	eq(t, "its hits", r.Bots[0].Hits, int64(400))
	eq(t, "busiest AI bot", r.Bots[1].Name+"/"+r.Bots[1].Kind, "OpenAI/train")
	eq(t, "its hits", r.Bots[1].Hits, int64(49))

	pricing := pageOf(r, "/pricing")
	eq(t, "pricing read", pricing.Read, int64(40))
	eq(t, "pricing sent", pricing.Sent, int64(2))
	eq(t, "pricing flag", pricing.Flag, "")
	eq(t, "pricing bots", len(pricing.Bots), 2)
	eq(t, "pricing top bot", pricing.Bots[0].Name+"/"+pricing.Bots[0].Kind, "OpenAI/train")
	eq(t, "pricing is first", r.Pages[0].Path, "/pricing")

	blog := pageOf(r, "/blog")
	eq(t, "blog read", blog.Read, int64(0))
	eq(t, "blog sent", blog.Sent, int64(1))
	if got := pageOf(r, "/guide"); got.Path != "/guide" && got.Read != 0 {
		t.Errorf("a search bot's read is not AI's: %+v", got)
	}
	for _, p := range r.Pages {
		if p.Path == "(other)" {
			t.Error("the folded row is not a page")
		}
	}
}

// Read and never credited: a page with a floor's worth of reads and nobody sent.
func TestAISearchFlagsUncreditedAndUnread(t *testing.T) {
	q := aiRig(t)
	r, err := q.AISearch(context.Background(), week, AIOptions{Clicks: map[string]float64{"/guide": 80, "/docs": 90, "/rare": 2}})
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "docs: read 25, sent 0", pageOf(r, "/docs").Flag, FlagUncredited)
	eq(t, "changelog: read 12, sent 0", pageOf(r, "/changelog").Flag, FlagUncredited)
	guide := pageOf(r, "/guide")
	eq(t, "guide is in the list from Google alone", guide.Path, "/guide")
	eq(t, "guide clicks", guide.Clicks, 80.0)
	eq(t, "google ranks it, AI ignores it", guide.Flag, FlagUnread)
	eq(t, "a handful of clicks is not enough", pageOf(r, "/rare").Flag, "")
	eq(t, "pricing is read and credited", pageOf(r, "/pricing").Flag, "")
}

// Without a single robot reported, "AI ignores it" would be said of every page:
// it is not said at all.
func TestAISearchUnreadNeedsRobots(t *testing.T) {
	q := aiRig(t)
	p := week
	p.Site = "s3"
	r, err := q.AISearch(context.Background(), p, AIOptions{Clicks: map[string]float64{"/guide": 80}})
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "crawled", r.Crawled, int64(0))
	eq(t, "flag", pageOf(r, "/guide").Flag, "")
}

// The period, the site and the page filter carry through; session filters
// narrow the visitors, never the robots' counters (they have no visitors).
func TestAISearchKeepsInSync(t *testing.T) {
	q := aiRig(t)
	ctx := context.Background()

	p := week
	p.From = time.Date(2026, 8, 31, 0, 0, 0, 0, time.UTC)
	wide, err := q.AISearch(ctx, p, AIOptions{})
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "the earlier days count when the period reaches them", wide.Visitors, int64(4))
	eq(t, "and so do the earlier reads", pageOf(wide, "/pricing").Read, int64(1040))

	one, err := q.AISearch(ctx, week, AIOptions{Page: "/pricing"})
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "one page: its reads", one.Crawled, int64(40))
	eq(t, "one page: no other page's", len(pageOf(one, "/docs").Bots), 0)

	f := week
	f.Filters = []Filter{{Dim: "referrer", Value: "claude.ai"}}
	only, err := q.AISearch(ctx, f, AIOptions{})
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "a source filter narrows the visitors", only.Visitors, int64(1))
	eq(t, "and leaves the robots", only.Crawled, int64(84))

	none, err := q.AISearch(ctx, Params{Site: "s2", TZ: "UTC", From: week.From, To: week.To}, AIOptions{})
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "another site: its own robots only", none.Crawled, int64(900))
	eq(t, "and none of s1's visitors", none.Visitors, int64(0))
}

func TestAISeen(t *testing.T) {
	q := aiRig(t)
	ctx := context.Background()
	v, c, err := q.AISeen(ctx, "s1")
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "s1 visitor", v, true)
	eq(t, "s1 crawler", c, true)
	v, c, err = q.AISeen(ctx, "nobody")
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "nobody visitor", v, false)
	eq(t, "nobody crawler", c, false)
}

func TestPageFlagFloors(t *testing.T) {
	eq(t, "just under the reads floor", PageFlag(FlagMinReads-1, 0, 0, true), "")
	eq(t, "at the reads floor", PageFlag(FlagMinReads, 0, 0, true), FlagUncredited)
	eq(t, "one visitor is credit", PageFlag(500, 1, 0, true), "")
	eq(t, "just under the clicks floor", PageFlag(0, 0, FlagMinClicks-1, true), "")
	eq(t, "at the clicks floor", PageFlag(0, 0, FlagMinClicks, true), FlagUnread)
	eq(t, "read once is not ignored", PageFlag(1, 0, 100, true), "")
}

// The assistants list names only assistants: a referrer that is none (google.com
// behind a utm_source, an app that sends no referrer) is told by its utm_source,
// non-AI traffic never appears, and the header is the sum of the rows.
func TestAISearchAssistantsAreKnownAndAddUp(t *testing.T) {
	q := aiRig(t)
	add := func(id, visitor int, channel, ref, utm string) {
		t.Helper()
		_, err := q.DB.Exec(`INSERT INTO sessions (site_id, session_id, visitor_id, start, last, channel, referrer, utm_source, entry_page, pvs, goals, engaged_ms, dur)
			VALUES ('s1', ?, ?, TIMESTAMP '2026-09-10 11:00:00', TIMESTAMP '2026-09-10 11:05:00', ?, ?, ?, '/x', 1, 0, 0, 0)`, id, visitor, channel, ref, utm)
		if err != nil {
			t.Fatal(err)
		}
	}
	add(20, 20, "AI", "", "chatgpt.com")           // the app sends no referrer
	add(21, 21, "AI", "google.com", "chatgpt.com") // a referrer that is no assistant, tagged by the app
	add(22, 22, "AI", "l.instagram.com", "gemini") // likewise
	add(23, 23, "Direct", "", "")                  // not AI
	add(24, 24, "Social", "l.instagram.com", "")   // not AI
	add(25, 25, "AI", "www.perplexity.ai", "")     // www is dropped
	r, err := q.AISearch(context.Background(), week, AIOptions{})
	if err != nil {
		t.Fatal(err)
	}
	var sum int64
	got := map[string]int64{}
	for _, a := range r.Assistants {
		sum += a.Visitors
		got[a.Name] = a.Visitors
		switch a.Name {
		case "ChatGPT", "Claude", "Perplexity", "Gemini", "Copilot":
		default:
			t.Errorf("%q is listed and is no assistant we know", a.Name)
		}
	}
	eq(t, "header is the sum of the rows", r.Visitors, sum)
	eq(t, "ChatGPT: referrer, app and tagged link", got["ChatGPT"], int64(3))
	eq(t, "Gemini by its utm_source", got["Gemini"], int64(1))
	eq(t, "Perplexity: two visitors", got["Perplexity"], int64(2))
	eq(t, "Claude", got["Claude"], int64(1))
	eq(t, "all of them", sum, int64(7))
	eq(t, "busiest first", r.Assistants[0].Name, "ChatGPT")
	eq(t, "its top referrer", r.Assistants[0].Referrer, "chatgpt.com")

	// Nothing from AI: an empty list, and a header of zero.
	none := week
	none.Site = "s2"
	e, err := q.AISearch(context.Background(), none, AIOptions{})
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "no assistants", len(e.Assistants), 0)
	eq(t, "no header", e.Visitors, int64(0))
}

// A page an answer linked is found wherever it ranks, and a page nobody read
// is there with zeros.
func TestAIPagesFor(t *testing.T) {
	q := aiRig(t)
	got, err := q.AIPagesFor(context.Background(), week, []string{"/pricing", "/blog", "/nobody"})
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "rows", len(got), 3)
	eq(t, "pricing read", got[0].Read, int64(40))
	eq(t, "pricing sent", got[0].Sent, int64(2))
	eq(t, "blog read", got[1].Read, int64(0))
	eq(t, "blog sent", got[1].Sent, int64(1))
	eq(t, "nobody", got[2].Read+got[2].Sent, int64(0))
	none, err := q.AIPagesFor(context.Background(), week, nil)
	if err != nil || len(none) != 0 {
		t.Fatal(none, err)
	}
}

// Each robot's refused visits and broken pages are told apart, and the
// crawler report carries the same split with each robot's worst pages.
func TestCrawlBlockedAndBroken(t *testing.T) {
	st, err := duck.Open(context.Background(), filepath.Join(t.TempDir(), "b.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	for _, q := range []string{
		`INSERT INTO crawler_hits (site_id, day, name, kind, path, hits, errors, blocked) VALUES ('s1', DATE '2026-09-10', 'OpenAI', 'answer', '/pricing', 20, 2, 15)`,
		`INSERT INTO crawler_hits (site_id, day, name, kind, path, hits, errors, blocked) VALUES ('s1', DATE '2026-09-10', 'OpenAI', 'answer', '/docs', 10, 6, 0)`,
		`INSERT INTO crawler_hits (site_id, day, name, kind, path, hits, errors, blocked) VALUES ('s1', DATE '2026-09-10', 'OpenAI', 'answer', '/ok', 5, 0, 0)`,
		`INSERT INTO crawler_hits (site_id, day, name, kind, path, hits, errors, blocked) VALUES ('s1', DATE '2026-09-10', 'Anthropic', 'train', '/pricing', 8, 0, 0)`,
		`INSERT INTO crawler_hits (site_id, day, name, kind, path, hits, errors, blocked) VALUES ('s1', DATE '2026-09-10', 'Google', 'index', '/pricing', 40, 0, 30)`,
	} {
		if _, err := st.DB.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	q := Q{DB: st.DB}
	r, err := q.AISearch(context.Background(), week, AIOptions{})
	if err != nil {
		t.Fatal(err)
	}
	var got AIBot
	for _, b := range r.Bots {
		if b.Name == "OpenAI" {
			got = b
		}
	}
	if got.Hits != 35 || got.Blocked != 15 || got.Errors != 8 {
		t.Fatalf("OpenAI: want 35 hits, 15 blocked, 8 errors; got %+v", got)
	}
	for _, b := range r.Bots {
		if b.Name == "Anthropic" && (b.Blocked != 0 || b.Errors != 0) {
			t.Fatalf("Anthropic had no failures: %+v", b)
		}
	}
	c, err := q.Crawlers(context.Background(), week)
	if err != nil {
		t.Fatal(err)
	}
	if c.Blocked != 45 || c.Errors != 8 {
		t.Fatalf("report: want 45 blocked, 8 broken; got %d, %d", c.Blocked, c.Errors)
	}
	var fails []CrawlerFail
	for _, f := range c.Failing {
		if f.Name == "OpenAI" {
			fails = append(fails, f)
		}
	}
	if len(fails) != 2 || fails[0].Path != "/pricing" || fails[0].Why != "blocked" || fails[0].Count != 17 || fails[1].Path != "/docs" || fails[1].Why != "broken" {
		t.Fatalf("OpenAI failing pages: %+v", fails)
	}
}
