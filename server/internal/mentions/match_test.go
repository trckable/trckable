package mentions

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"strings"
	"testing"
)

// answers is a source that says one thing.
type answers struct {
	body   string
	status int
}

func (a *answers) Do(*http.Request) (*http.Response, error) {
	if a.status == 0 {
		a.status = 200
	}
	return &http.Response{StatusCode: a.status, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(a.body))}, nil
}

// The three headlines that made the bare name a bad default: a Canadian MP
// shares a name with albas.al.
var danAlbas = []Item{
	{Source: HN, URL: "https://news.ycombinator.com/item?id=1", Host: HNHost, Title: "Dan Albas MP Report: Alto: $113 billion for a train"},
	{Source: News, URL: "https://paper.example/mp-report", Host: "paper.example", Title: "Albas says the report on the train is wrong - Paper"},
	{Source: News, URL: "https://news.example/albas-mp", Host: "news.example", Title: "MP Dan Albas on the budget", Snippet: "The report on the budget."},
}

func albasRules() Rules { return Rules{Domain: "albas.al"} }

// Each safeguard alone keeps all three out; the rest of the rules are set so
// that, without that one, the item would be shown.
func TestDanAlbasIsRefusedByEachSafeguardAlone(t *testing.T) {
	// The base lets the item through: the owner added the name and a topic word that headline has.
	base := func(it Item) Rules {
		r := albasRules()
		r.Names = []string{"albas"}
		r.Topic = []string{"report", "budget"}
		return r
	}
	t.Run("the address alone", func(t *testing.T) {
		for _, it := range danAlbas {
			if v := albasRules().Match(it); v.Show || v.Reason != NoEvidence {
				t.Errorf("%q: %+v", it.Title, v)
			}
		}
	})
	t.Run("a name word with no co-word", func(t *testing.T) {
		for _, it := range danAlbas {
			r := albasRules()
			r.Names = []string{"albas"}
			if v := r.Match(it); v.Show || v.Reason != NoCoWord && v.Reason != NoPhrase {
				t.Errorf("%q: %+v", it.Title, v)
			}
		}
	})
	t.Run("a co-word that is not there", func(t *testing.T) {
		for _, it := range danAlbas {
			r := albasRules()
			r.Names, r.Topic = []string{"albas"}, []string{"analytics"}
			if v := r.Match(it); v.Show {
				t.Errorf("%q: %+v", it.Title, v)
			}
		}
	})
	t.Run("news needs a phrase", func(t *testing.T) {
		r := base(danAlbas[1])
		if v := r.Match(danAlbas[1]); v.Show || v.Reason != NoPhrase {
			t.Errorf("%+v", v)
		}
	})
	t.Run("an excluded word", func(t *testing.T) {
		r := base(danAlbas[0])
		if v := r.Match(danAlbas[0]); !v.Show {
			t.Fatalf("without the exclusion this passes (a name and a co-word): %+v", v)
		}
		r.Excluded = []string{"MP"}
		if v := r.Match(danAlbas[0]); v.Show || v.Reason != Excluded {
			t.Errorf("%+v", v)
		}
	})
	t.Run("a required word", func(t *testing.T) {
		r := base(danAlbas[0])
		r.Required = []string{"analytics"}
		if v := r.Match(danAlbas[0]); v.Show || v.Reason != Missing {
			t.Errorf("%+v", v)
		}
	})
	t.Run("a blocked site", func(t *testing.T) {
		r := base(danAlbas[0])
		r.Blocked = []string{"https://www.News.Ycombinator.com/front"}
		if v := r.Match(danAlbas[0]); v.Show || v.Reason != BlockedSite {
			t.Errorf("%+v", v)
		}
	})
	t.Run("the judge", func(t *testing.T) {
		// The judge is a hook outside the matcher: see the server's tests.
		if base(danAlbas[0]).Match(danAlbas[0]).Via != ViaName {
			t.Error("a name with a co-word is the evidence the judge is asked about")
		}
	})
}

func TestTheAddressInTheText(t *testing.T) {
	for _, c := range []struct {
		text string
		want bool
	}{
		{"Why I moved my analytics to albas.al", true},
		{"Read more at www.albas.al/pricing.", true},
		{"Docs live at docs.albas.al now", true},
		{"ALBAS.AL goes live", true},
		{"We now use albas.al.", true},
		{"We now use albas.al. It is fast", true},
		{"We now use (albas.al)", true},
		{"We use albas[.]al for it", true},
		{"We use albas(.)al for it", true},
		{"see https://blog.example/go?to=https://albas.al/", true},
		{"Neue Analyse-Tools wie albas.al im Test", true},
		{"Try notalbas.al for hosting", false},
		{"Try my-albas.al for hosting", false},
		{"Visit albas.alberta.ca for permits", false},
		{"Visit albas.al.evil.example today", false},
		{"Visit albas.al-shop.example today", false},
		{"albas.com launches a store", false},
		{"Dan Albas MP Report", false},
		{"the albas of Ibiza", false},
		{"", false},
	} {
		if got := HasDomain(c.text, "albas.al"); got != c.want {
			t.Errorf("%q = %v, want %v", c.text, got, c.want)
		}
	}
}

func TestOwnPagesAreNeverMentions(t *testing.T) {
	r := albasRules()
	for _, it := range []Item{
		{Source: News, URL: "https://albas.al/blog/launch", Host: "albas.al", Title: "Launch notes for albas.al"},
		{Source: News, URL: "https://blog.albas.al/x", Host: "blog.albas.al", Title: "albas.al news"},
		{Source: News, URL: "https://www.albas.al/x", Host: "www.albas.al", Title: "albas.al news"},
	} {
		if v := r.Match(it); v.Show || v.Reason != OwnPage {
			t.Errorf("%s: %+v", it.URL, v)
		}
	}
	// A story that links to the site, from another site, is one.
	if v := r.Match(Item{Source: HN, URL: "https://news.ycombinator.com/item?id=9", Host: HNHost, Title: "Show HN: A small tool", Link: "https://albas.al/"}); !v.Show || v.Via != ViaDomain {
		t.Errorf("a story that links to the site: %+v", v)
	}
	if !r.Page("https://reddit.com/r/x/comments/1/y").Show || r.Page("https://albas.al/blog").Show {
		t.Error("a page that sent visitors counts, unless it is the site's own")
	}
}

// Twenty headlines as they come, for a site whose name is also a person's, a
// place's and an everyday word: sixteen were wrong and four were right.
func TestRealisticHeadlines(t *testing.T) {
	albas := Rules{Domain: "albas.al"}
	acme := Rules{Domain: "acme.example", Names: []string{"Acme"}, Topic: []string{"analytics", "dashboard"}, Excluded: []string{"Corp"}}
	fox := Rules{Domain: "fox.io"}
	for _, c := range []struct {
		name string
		r    Rules
		it   Item
		want bool
	}{
		{"person", albas, Item{Source: News, Title: "Dan Albas MP Report", Host: "a.example", URL: "https://a.example/1"}, false},
		{"person in another language", albas, Item{Source: News, Title: "El diputado Dan Albas habló ayer", Host: "a.example", URL: "https://a.example/2"}, false},
		{"place", albas, Item{Source: News, Title: "Albas, a village in the Lot", Host: "a.example", URL: "https://a.example/3"}, false},
		{"another address with the name", albas, Item{Source: HN, Title: "Show HN: albas.app", Host: HNHost, URL: "https://news.ycombinator.com/item?id=3"}, false},
		{"the address, an HN comment", albas, Item{Source: HN, Title: "I switched to albas.al last month", Host: HNHost, URL: "https://news.ycombinator.com/item?id=4"}, true},
		{"the address in a snippet", albas, Item{Source: News, Title: "Five privacy tools", Snippet: "Number two is albas.al, a small one.", Host: "a.example", URL: "https://a.example/5"}, true},
		{"fox the animal", fox, Item{Source: News, Title: "A fox in the garden", Host: "a.example", URL: "https://a.example/6"}, false},
		{"fox news", fox, Item{Source: News, Title: "Fox News host says", Host: "a.example", URL: "https://a.example/7"}, false},
		{"fox.io in a url", fox, Item{Source: HN, Title: "Show HN: a map", Link: "https://fox.io/maps", Host: HNHost, URL: "https://news.ycombinator.com/item?id=8"}, true},
		{"firefox.io is not fox.io", fox, Item{Source: HN, Title: "Mozilla firefox.io update", Host: HNHost, URL: "https://news.ycombinator.com/item?id=9"}, false},
		{"name and co-word on HN", acme, Item{Source: HN, Title: "Acme analytics got faster", Host: HNHost, URL: "https://news.ycombinator.com/item?id=10"}, true},
		{"name without co-word on HN", acme, Item{Source: HN, Title: "Acme Corp bought a factory", Host: HNHost, URL: "https://news.ycombinator.com/item?id=11"}, false},
		{"name and co-word but excluded", acme, Item{Source: HN, Title: "Acme Corp analytics report", Host: HNHost, URL: "https://news.ycombinator.com/item?id=12"}, false},
		{"name in the news without a phrase", acme, Item{Source: News, Title: "Acme analytics got faster", Host: "a.example", URL: "https://a.example/13"}, false},
		{"the address in the news", acme, Item{Source: News, Title: "acme.example adds a dashboard", Host: "a.example", URL: "https://a.example/14"}, true},
		{"a longer name", acme, Item{Source: HN, Title: "Acmeism: analytics of a philosophy", Host: HNHost, URL: "https://news.ycombinator.com/item?id=15"}, false},
		{"hyphenated name", acme, Item{Source: HN, Title: "Acme-Smith dashboard", Host: HNHost, URL: "https://news.ycombinator.com/item?id=16"}, false},
		{"possessive", acme, Item{Source: HN, Title: "Acme's dashboard is great", Host: HNHost, URL: "https://news.ycombinator.com/item?id=17"}, true},
		{"the other tld", acme, Item{Source: HN, Title: "acme.com dashboard", Host: HNHost, URL: "https://news.ycombinator.com/item?id=18"}, false},
		{"upper case address", acme, Item{Source: HN, Title: "ACME.EXAMPLE is down", Host: HNHost, URL: "https://news.ycombinator.com/item?id=19"}, true},
	} {
		if got := c.r.Match(c.it).Show; got != c.want {
			t.Errorf("%s: %q = %v, want %v (%+v)", c.name, c.it.Title, got, c.want, c.r.Match(c.it))
		}
	}
}

func TestSameStoryIsTheSameAcrossFeeds(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want bool
	}{
		{"Acme launches a new dashboard - The Daily Byte", "Acme launches a new dashboard", true},
		{"Acme launches a new dashboard | Byte", "ACME launches a new dashboard!", true},
		{"Acme launches a new analytics dashboard today", "Acme launches new analytics dashboard today - Wire", true},
		{"Acme launches a new dashboard", "Acme launches a new pricing page", false},
		{"Short one", "Short one too", false},
		{"", "", false},
	} {
		if got := SameStory(c.a, c.b); got != c.want {
			t.Errorf("%q / %q = %v, want %v", c.a, c.b, got, c.want)
		}
	}
	list := Dedupe([]Mention{
		{Source: News, URL: "https://a.example/x?utm_source=1", Title: "Acme launches a new dashboard - A", Host: "a.example"},
		{Source: News, URL: "https://www.a.example/x", Title: "Other words entirely here", Host: "a.example"},
		{Source: News, URL: "https://b.example/copy", Title: "Acme launches a new dashboard - B", Host: "b.example"},
		{Source: HN, URL: "https://news.ycombinator.com/item?id=1", Title: "Acme launches a new dashboard", Host: HNHost},
	})
	if len(list) != 2 || list[1].Source != HN {
		t.Fatalf("one address, one syndicated copy: %+v", list)
	}
}

func TestGoogleLinksAreResolvedToThePublisher(t *testing.T) {
	enc := base64.RawURLEncoding.EncodeToString([]byte("\x08\x13\x22\x1ahttps://paper.example/2026/story?id=7\xd2\x01\x00"))
	if got := Resolve(context.Background(), nil, "https://news.google.com/rss/articles/"+enc+"?oc=5", false); got != "https://paper.example/2026/story?id=7" {
		t.Errorf("an old link carries its address: %q", got)
	}
	for _, other := range []string{"https://paper.example/x", "https://news.google.com/rss/articles/CBMiAAA"} {
		if got := Resolve(context.Background(), nil, other, false); got != other {
			t.Errorf("%q stays as it is without a call: %q", other, got)
		}
	}
}

func TestLookAlikeNamesWhatTheNewsMeans(t *testing.T) {
	feed := `<?xml version="1.0"?><rss><channel>
<item><title>Dan Albas MP Report: Alto: $113 billion for a train - Paper</title><link>https://news.google.com/rss/articles/A1</link><pubDate>Tue, 14 Oct 2026 09:30:00 GMT</pubDate><source url="https://paper.example">Paper</source></item>
<item><title>MP Dan Albas on the budget - Wire</title><link>https://news.google.com/rss/articles/A2</link><pubDate>Tue, 14 Oct 2026 10:30:00 GMT</pubDate><source url="https://wire.example">Wire</source></item>
<item><title>Albas hosts a town hall for MP report</title><link>https://news.google.com/rss/articles/A3</link><pubDate>Tue, 14 Oct 2026 11:30:00 GMT</pubDate><source url="https://town.example">Town</source></item>
<item><title>albas.al adds a dashboard</title><link>https://news.google.com/rss/articles/A4</link><pubDate>Tue, 14 Oct 2026 12:30:00 GMT</pubDate><source url="https://byte.example">Byte</source></item>
</channel></rss>`
	d := &answers{body: feed}
	got, err := CheckLookAlike(context.Background(), d, "albas", "albas.al", nil)
	if err != nil || !got.Checked || got.Elsewhere != 3 || len(got.Examples) != 3 {
		t.Fatalf("%+v %v", got, err)
	}
	if !contains(got.Suggest, "MP") || !contains(got.Suggest, "Dan") {
		t.Errorf("the words the headlines share are offered: %v", got.Suggest)
	}
	if contains(got.Suggest, "Albas") || contains(got.Suggest, "albas") {
		t.Errorf("never the word itself: %v", got.Suggest)
	}
	// A source that fails claims nothing.
	if got, err := CheckLookAlike(context.Background(), &answers{status: 500}, "albas", "albas.al", nil); err == nil || got.Checked {
		t.Errorf("an unreadable feed is not an all-clear: %+v", got)
	}
}

func contains(l []string, w string) bool {
	for _, x := range l {
		if x == w {
			return true
		}
	}
	return false
}

func TestReplayListsEveryHit(t *testing.T) {
	in := ReplayInput{
		Sites: []ReplaySite{{ID: "s1", Domain: "albas.al"}},
		Items: []ReplayItem{
			{Site: "s1", Source: "news", URL: "https://a.example/1", Host: "a.example", Title: "Dan Albas MP Report", PostedAt: 100},
			{SiteID: "s1", Source: "hn", URL: "https://news.ycombinator.com/item?id=1", Host: HNHost, Title: "I use albas.al daily", PostedAt: 200},
			{Site: "s1", Source: "news", URL: "https://b.example/1", Host: "b.example", Title: "albas.al launches a new tool - B", PostedAt: 300},
			{Site: "s1", Source: "news", URL: "https://c.example/1", Host: "c.example", Title: "albas.al launches a new tool - C", PostedAt: 400},
			{Site: "gone", Source: "news", URL: "https://c.example/2", Title: "x", PostedAt: 500},
		},
	}
	var hits, dups, refused int
	for _, r := range Replay(in) {
		switch {
		case r.Hit():
			hits++
		case r.Dup:
			dups++
		default:
			refused++
		}
	}
	if hits != 2 || dups != 1 || refused != 2 {
		t.Fatalf("hits %d, dups %d, refused %d", hits, dups, refused)
	}
}
