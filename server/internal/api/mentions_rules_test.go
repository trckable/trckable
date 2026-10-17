package api

import (
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/mentions"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

type fixedNews struct{ body string }

func (f fixedNews) Do(*http.Request) (*http.Response, error) {
	return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(f.body))}, nil
}

func TestMentionRulesSaveRefuseAndShowTheSuggestedName(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/mentions"
	code, out := do(t, c, "PUT", base+"/rules", `{"topic":["analytics"],"required":[],"excluded":["MP","mp"],"blocked":["https://www.Reddit.com/r/x"]}`, csrf, "1")
	if code != http.StatusOK {
		t.Fatalf("%d %v", code, out)
	}
	if ex, _ := out["excluded"].([]any); len(ex) != 1 || ex[0] != "MP" {
		t.Fatalf("a repeat in another case is one: %v", out)
	}
	if bl, _ := out["blocked"].([]any); len(bl) != 1 || bl[0] != "reddit.com" {
		t.Fatalf("a blocked site is kept as its host: %v", out)
	}
	if code, _ = do(t, c, "PUT", base+"/rules", `{"excluded":["a"]}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("too short: %d", code)
	}
	_, list := do(t, c, "GET", base, "")
	words, _ := list["words"].(map[string]any)
	if sug, _ := words["suggested"].([]any); len(sug) != 1 || sug[0] != "site" {
		t.Fatalf("the name in site.com is offered, not searched: %v", words)
	}
	if def, _ := words["default"].([]any); len(def) != 2 {
		t.Fatalf("only the address is searched: %v", def)
	}
}

// "Not about us" hides the mention, offers to exclude its words or block its
// source, keeps it in the hidden list, and the lists and counts drop it.
func TestNotAboutUsHidesAndOffersToExcludeOrBlock(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	now := g.advance(0)
	at := now.Add(-time.Hour).Unix()
	g.mention(t, sqlite.Mention{Source: "news", URL: "https://paper.example/a", Title: "Dan Albas MP Report on site.com", Host: "paper.example", PostedAt: at}, 0, 0)
	g.mention(t, sqlite.Mention{Source: "news", URL: "https://paper.example/b", Title: "site.com opens a shop", Host: "paper.example", PostedAt: at - 10}, 0, 0)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/mentions"
	_, out := do(t, c, "GET", base, "")
	first := out["mentions"].([]any)[0].(map[string]any)
	id := int64(first["id"].(float64))
	code, res := do(t, c, "POST", base+"/"+itoa(id)+"/not-about-us", "", csrf, "1")
	if code != http.StatusOK || res["hidden"] != true || res["suggest_block"] != "paper.example" {
		t.Fatalf("%d %v", code, res)
	}
	sug, _ := res["suggest_exclude"].([]any)
	if len(sug) == 0 || !has(sug, "Dan") || !has(sug, "MP") || has(sug, "site") {
		t.Fatalf("words that set it apart: %v", sug)
	}
	_, out = do(t, c, "GET", base, "")
	if l, _ := out["mentions"].([]any); len(l) != 1 {
		t.Fatalf("hidden is out of the list the counts read: %v", l)
	}
	_, hidden := do(t, c, "GET", base+"/hidden", "")
	if l, _ := hidden["mentions"].([]any); len(l) != 1 || l[0].(map[string]any)["state"] != "hidden" {
		t.Fatalf("kept in the hidden list: %v", hidden)
	}
	if code, _ = do(t, c, "POST", base+"/"+itoa(id)+"/restore", "", csrf, "1"); code != http.StatusOK {
		t.Fatalf("restore %d", code)
	}
	if _, out = do(t, c, "GET", base, ""); len(out["mentions"].([]any)) != 2 {
		t.Fatalf("restored: %v", out["mentions"])
	}
	if code, _ = do(t, c, "POST", base+"/999/not-about-us", "", csrf, "1"); code != http.StatusNotFound {
		t.Fatalf("a mention that is not there: %d", code)
	}
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }

func has(l []any, w string) bool {
	for _, x := range l {
		if x == w {
			return true
		}
	}
	return false
}

// Confirmed pages are listed before the rest.
func TestConfirmedMentionsComeFirst(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	now := g.advance(0)
	g.mention(t, sqlite.Mention{Source: "hn", URL: "https://news.ycombinator.com/item?id=1", Title: "Newest", Host: "news.ycombinator.com", PostedAt: now.Add(-time.Hour).Unix(), Via: mentions.ViaDomain}, 0, 0)
	g.mention(t, sqlite.Mention{Source: "ref", URL: "https://reddit.com/r/x/comments/1/a", Title: "reddit.com/r/x/comments/1/a", Host: "reddit.com", PostedAt: now.Add(-48 * time.Hour).Unix(), Via: mentions.ViaPage}, 12, now.Unix())
	_, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/mentions", "")
	l := out["mentions"].([]any)
	if len(l) != 2 || l[0].(map[string]any)["source"] != "ref" || l[0].(map[string]any)["via"] != "page" {
		t.Fatalf("the page the visits confirm leads: %v", l)
	}
}

func TestLookAlikeWarnsAboutAnotherMeaning(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	url := g.srv.URL + "/api/v1/sites/" + g.site + "/mentions/lookalike?word=albas"
	if _, out := do(t, c, "GET", url, ""); out["checked"] != false {
		t.Fatalf("without a news source nothing is claimed: %v", out)
	}
	g.api.MentionGet = fixedNews{`<?xml version="1.0"?><rss><channel>
<item><title>Dan Albas MP Report - Paper</title><link>https://news.google.com/rss/articles/A1</link><pubDate>Tue, 14 Oct 2026 09:30:00 GMT</pubDate><source url="https://paper.example">Paper</source></item>
<item><title>MP Dan Albas on the budget - Wire</title><link>https://news.google.com/rss/articles/A2</link><pubDate>Tue, 14 Oct 2026 10:30:00 GMT</pubDate><source url="https://wire.example">Wire</source></item>
</channel></rss>`}
	code, out := do(t, c, "GET", url, "")
	sug, _ := out["suggest_exclude"].([]any)
	if code != http.StatusOK || out["checked"] != true || out["elsewhere"] != float64(2) || !has(sug, "Dan") || !has(sug, "MP") {
		t.Fatalf("%d %v", code, out)
	}
	g.api.MentionGet = fixedNews{"not a feed"} // a held answer needs no second call
	if _, again := do(t, c, "GET", url, ""); again["elsewhere"] != float64(2) {
		t.Fatalf("held for a day: %v", again)
	}
	for i := 0; i < lookAlikeFresh; i++ {
		code, _ = do(t, c, "GET", url+"x"+strconv.Itoa(i), "")
	}
	if code != http.StatusTooManyRequests {
		t.Fatalf("a site may check only so many new words an hour: %d", code)
	}
	if code, _ = do(t, c, "GET", url+`%22`, ""); code != http.StatusBadRequest {
		t.Fatalf("a quote is refused: %d", code)
	}
}

// A confirmed page's visitors follow the period (Social and Referral visits only); one that sent
// nobody in the period keeps its month's count instead of a zero.
func TestConfirmedVisitorsFollowThePeriod(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	now := g.advance(0)
	for i, p := range []struct{ page string }{{"reddit.com/r/x/comments/1/a"}, {"reddit.com/r/x/comments/2/b"}} {
		u := "https://" + p.page
		g.mention(t, sqlite.Mention{Source: "ref", URL: u, Title: p.page, Host: "reddit.com", PostedAt: now.Add(-4 * 24 * time.Hour).Unix(), Via: mentions.ViaPage}, 9, now.Unix())
		_ = i
	}
	ev := func(seq, visitor int, page, channel string, at time.Time) {
		if _, err := g.api.Query().DB.Exec(`INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, referrer_url, channel) VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
			seq, g.site, at.UTC(), visitor, visitor, page, channel); err != nil {
			t.Fatal(err)
		}
	}
	ev(1, 1, "reddit.com/r/x/comments/1/a", "Referral", now.Add(-2*24*time.Hour))
	ev(2, 2, "reddit.com/r/x/comments/1/a", "Social", now.Add(-3*24*time.Hour))
	ev(3, 3, "reddit.com/r/x/comments/1/a", "Search", now.Add(-3*24*time.Hour))
	ev(4, 4, "reddit.com/r/x/comments/1/a", "Referral", now.Add(-15*24*time.Hour)) // outside 7 days
	_, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/mentions?period=7d", "")
	got := map[string]float64{}
	for _, m := range out["mentions"].([]any) {
		m := m.(map[string]any)
		got[m["title"].(string)] = m["visitors"].(float64)
	}
	if got["reddit.com/r/x/comments/1/a"] != 2 || got["reddit.com/r/x/comments/2/b"] != 9 {
		t.Fatalf("two visits of the right channels in 7 days; the quiet page keeps its 9: %v", got)
	}
}
