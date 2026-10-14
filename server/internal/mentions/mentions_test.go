package mentions

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

// fake answers from recorded files: no test touches the network.
type fake struct {
	t      *testing.T
	files  map[string]string // URL prefix -> file in testdata
	status int
	seen   []*http.Request
}

func (f *fake) Do(r *http.Request) (*http.Response, error) {
	f.seen = append(f.seen, r)
	status := f.status
	if status == 0 {
		status = 200
	}
	var body []byte
	for prefix, file := range f.files {
		if strings.HasPrefix(r.URL.String(), prefix) {
			b, err := os.ReadFile("testdata/" + file)
			if err != nil {
				f.t.Fatal(err)
			}
			body = b
		}
	}
	return &http.Response{StatusCode: status, Header: http.Header{"Etag": {`"v2"`}}, Body: io.NopCloser(strings.NewReader(string(body)))}, nil
}

func TestHasIsAWordNotAPart(t *testing.T) {
	for text, want := range map[string]bool{
		"Show HN: Acme, a tool":    true,
		"acmeism":                  false,
		"visit acme.example today": true,
		"the Acme.Example site":    true,
		"nothing":                  false,
		"racme acme":               true,
		"racme":                    false,
		"Ünïcode acme—great":       true,
	} {
		if got := Has(text, "acme"); got != want {
			t.Errorf("Has(%q) = %v", text, got)
		}
	}
	if !Has("see acme.example now", "acme.example") || Has("x", "") {
		t.Error("a domain is a keyword, an empty one is none")
	}
}

func TestSnippetIsOneShortPlainLine(t *testing.T) {
	got := Snippet("<p>Hello&nbsp;<b>world</b> &amp; \n more</p>")
	if got != "Hello world & more" {
		t.Fatalf("%q", got)
	}
	if n := len([]rune(Snippet(strings.Repeat("x", 500)))); n != SnippetMax {
		t.Fatalf("%d", n)
	}
}

func TestSearchHNKeepsOnlyRealNewMentions(t *testing.T) {
	f := &fake{t: t, files: map[string]string{algolia: "hn_search.json"}}
	list, err := SearchHN(context.Background(), f, []string{"acme.example", "Acme Metrics"}, 1791968400)
	if err != nil {
		t.Fatal(err)
	}
	// The story names it in its address, the comment in its text; "Acmeism" and the old post are not it.
	if len(list) != 2 {
		t.Fatalf("%+v", list)
	}
	s, c := list[0], list[1]
	if s.URL != "https://news.ycombinator.com/item?id=41000001" || s.Author != "maker1" || s.Points != 212 || s.Host != HNHost || s.PostedAt != 1791972600 {
		t.Fatalf("%+v", s)
	}
	if c.Title != "I switched to acme.example last month & it is great." || c.Author != "fan2" {
		t.Fatalf("%+v", c)
	}
	q := f.seen[0].URL.Query()
	if len(f.seen) != 1 || q.Get("query") != `"acme.example" "Acme Metrics"` || q.Get("optionalWords") != q.Get("query") || q.Get("advancedSyntax") != "true" {
		t.Fatalf("one call for every word, any of them may match: %v", q)
	}
	if s.Snippet != "" || !strings.Contains(c.Snippet, "acme.example") || c.Comments != 0 {
		t.Fatalf("a comment is its own snippet: %+v", c)
	}
	if q.Get("numericFilters") != "created_at_i>1791968400" || q.Get("tags") != "(story,comment)" {
		t.Fatalf("%v", q)
	}
}

func TestFrontHN(t *testing.T) {
	f := &fake{t: t, files: map[string]string{algolia: "hn_front.json"}}
	front, err := FrontHN(context.Background(), f)
	if err != nil || front["https://news.ycombinator.com/item?id=41000001"] != 212 || len(front) != 2 {
		t.Fatalf("%v %v", front, err)
	}
}

func TestGoogleNewsReadsTheFeedAndTheEtag(t *testing.T) {
	f := &fake{t: t, files: map[string]string{googleNews: "gnews.xml"}}
	list, tag, same, err := SearchGoogleNews(context.Background(), f, []string{"acme.example", "Acme"}, "")
	if err != nil || same || tag != `"v2"` || len(list) != 1 {
		t.Fatalf("%+v %q %v %v", list, tag, same, err)
	}
	m := list[0]
	if m.Host != "dailybyte.example" || m.PostedAt != time.Date(2026, 10, 14, 9, 30, 0, 0, time.UTC).Unix() || !strings.HasPrefix(m.Title, "Acme launches a new dashboard") {
		t.Fatalf("%+v", m)
	}
	if q := f.seen[0].URL.Query().Get("q"); !strings.Contains(q, `"acme.example" OR "Acme"`) {
		t.Fatalf("%q", q)
	}
	// Asked again with the tag, Google may answer "nothing new".
	f.status = 304
	_, tag, same, err = SearchGoogleNews(context.Background(), f, []string{"Acme"}, `"v2"`)
	if err != nil || !same || tag != `"v2"` || f.seen[1].Header.Get("If-None-Match") != `"v2"` {
		t.Fatalf("%q %v %v", tag, same, err)
	}
}

func TestGDELTAndDedupeAcrossSources(t *testing.T) {
	g := &fake{t: t, files: map[string]string{googleNews: "gnews.xml", gdelt: "gdelt.json"}}
	a, _, _, _ := SearchGoogleNews(context.Background(), g, []string{"Acme"}, "")
	b, err := SearchGDELT(context.Background(), g, []string{"Acme"})
	if err != nil || len(b) != 2 {
		t.Fatalf("%+v %v", b, err)
	}
	if b[0].Host != "dailybyte.example" || b[1].Host != "blog.other.example" {
		t.Fatalf("%+v", b)
	}
	// The same story from both is one; the other article stays.
	all := Dedupe(append(a, b...))
	if len(all) != 2 || all[0].URL != a[0].URL || all[1].Host != "blog.other.example" {
		t.Fatalf("%+v", all)
	}
	if Canonical("https://www.Example.com/a/b/?utm_source=x&id=2#top") != "example.com/a/b?id=2" {
		t.Fatalf("%q", Canonical("https://www.Example.com/a/b/?utm_source=x&id=2#top"))
	}
}

func TestProductHuntMatchesByWordsAndNamesLimits(t *testing.T) {
	f := &fake{t: t, files: map[string]string{phAPI: "ph_posts.json"}}
	posts, err := RecentPH(context.Background(), f, "tok", time.Now())
	if err != nil || len(posts) != 3 {
		t.Fatalf("%v %v", posts, err)
	}
	if f.seen[0].Header.Get("Authorization") != "Bearer tok" || f.seen[0].Method != "POST" {
		t.Fatal("the token goes in the header")
	}
	got := PHMatch(posts, []string{"acme.example", "Acme Metrics"})
	if len(got) != 2 || got[0].Points != 321 || got[0].Author != "maker1" || got[0].Host != PHHost || got[1].URL != "https://www.producthunt.com/posts/tool" {
		t.Fatalf("%+v", got)
	}

	bad := &fake{t: t, files: map[string]string{phAPI: "ph_error.json"}}
	if _, err := RecentPH(context.Background(), bad, "x", time.Now()); err == nil || !strings.Contains(err.Error(), "Invalid token") {
		t.Fatalf("%v", err)
	}
	limited := &fake{t: t, status: 429}
	if _, err := RecentPH(context.Background(), limited, "x", time.Now()); !errors.Is(err, ErrLimited) {
		t.Fatalf("%v", err)
	}
}

func TestNewsMustNameAKeyword(t *testing.T) {
	g := &fake{t: t, files: map[string]string{gdelt: "gdelt.json"}}
	b, err := SearchGDELT(context.Background(), g, []string{"Acme"})
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range b {
		if !HasAny(m.Title+" "+m.URL, []string{"Acme"}) {
			t.Fatalf("an article that names no keyword is not a mention: %+v", m)
		}
	}
	// "Unrelated" is in the recorded answer (the search matches loosely) and is dropped.
	if len(b) != 2 {
		t.Fatalf("%+v", b)
	}
}

func TestGenericHostsRefFormAndSentence(t *testing.T) {
	for host, want := range map[string]bool{"medium.com": true, "www.github.com": true, "old.reddit.com": true, "news.ycombinator.com": false, "acme.example": false, "notmedium.com": false} {
		if Generic(host) != want {
			t.Errorf("Generic(%q) = %v", host, !want)
		}
	}
	for addr, want := range map[string]string{
		"https://www.Medium.com/@a/post-1/":      "medium.com/@a/post-1",
		"https://news.ycombinator.com/item?id=5": "", // the query is not stored, so it cannot name the page
		"https://blog.example/":                  "",
	} {
		if got, ok := RefForm(addr); got != want || ok != (want != "") {
			t.Errorf("RefForm(%q) = %q %v", addr, got, ok)
		}
	}
	got := Sentence("Nothing here. I use Acme every day! Really.", []string{"acme"})
	if got != "I use Acme every day" {
		t.Fatalf("%q", got)
	}
}

type pages struct{ n int }

func (p *pages) Do(*http.Request) (*http.Response, error) {
	p.n++
	next := `{"hasNextPage":true,"endCursor":"c1"}`
	if p.n == 2 {
		next = `{"hasNextPage":false,"endCursor":""}`
	}
	body := `{"data":{"posts":{"nodes":[{"id":"` + strings.Repeat("x", p.n) + `","name":"Acme","tagline":"","slug":"a","url":"https://www.producthunt.com/posts/a","website":"","votesCount":1,"createdAt":"2026-10-14T07:01:00Z","user":{"username":"m"}}],"pageInfo":` + next + `}}}`
	return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}, nil
}

func TestProductHuntReadsPageAfterPage(t *testing.T) {
	p := &pages{}
	posts, err := RecentPH(context.Background(), p, "tok", time.Now())
	if err != nil || len(posts) != 2 || p.n != 2 {
		t.Fatalf("until the list ends: %d posts, %d calls, %v", len(posts), p.n, err)
	}
}
