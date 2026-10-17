package mentions

import "testing"

func TestUnicodeAndSentenceJoins(t *testing.T) {
	cases := []struct {
		name      string
		got, want bool
	}{
		{"turkish dotted I", HasDomain("İstanbul.com is a portal", "stanbul.com"), false},
		{"combining mark before", HasDomain("éplan.al", "plan.al"), false},
		{"sentence join plan.Al", HasDomain("We have a plan.Al Smith disagrees", "plan.al"), false},
		{"sentence join time.Is", HasDomain("It is about time.Is it over?", "time.is"), false},
		{"name NFD cafe", hasWord("Le café de Paris", "cafe"), false},
		{"url query", HasDomain("https://evil.com/?u=plan.al", "plan.al"), false},
	}
	for _, c := range cases {
		if c.got != c.want {
			t.Errorf("%s: got %v want %v", c.name, c.got, c.want)
		}
	}
	r := Rules{Domain: "albas.al", Names: []string{"albas"}, Topic: []string{"analytics"}}
	v := r.Match(Item{Source: HN, URL: "https://news.ycombinator.com/item?id=1", Title: "Dan Albas MP pushes analytics bill", Host: "news.ycombinator.com"})
	t.Logf("HN Dan Albas with topic word: %+v", v)
	v = r.Match(Item{Source: News, URL: "https://x.ca/a", Title: "Albas.al? MP Dan Albas said", Host: "x.ca"})
	t.Logf("news Albas.al?: %+v", v)
}
