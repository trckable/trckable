package answers

import (
	"reflect"
	"testing"
)

func TestScoreAnswer(t *testing.T) {
	rivals := []Rival{{"Plausible", "plausible.io"}, {"Umami", "umami.is"}}
	cite := func(urls ...string) []Citation {
		var c []Citation
		for _, u := range urls {
			c = append(c, Citation{URL: u, Title: "Acme"})
		}
		return c
	}
	cases := []struct {
		name    string
		a       Answer
		want    Score // Sentence and Rivals are checked separately
		rivalAt map[string]int
	}{
		{"named first", Answer{Text: "Acme is great. Plausible too."}, Score{Named: true, Position: 1}, map[string]int{"Plausible": 2}},
		{"inside another word", Answer{Text: "Acmeism is a movement."}, Score{}, nil},
		{"title only is not naming", Answer{Text: "Use the best tool.", Citations: []Citation{{URL: "https://other.dev/x", Title: "Acme guide"}}}, Score{}, nil},
		{"www link", Answer{Text: "Try this.", Citations: cite("https://www.acme.com/compare/")}, Score{Cited: true, CitedPaths: []string{"/compare"}}, nil},
		{"subdomain is cited, not joined", Answer{Text: "Docs.", Citations: cite("https://docs.acme.com/x")}, Score{Cited: true}, nil},
		{"utm and query dropped", Answer{Text: "See.", Citations: cite("https://acme.com/compare?utm_source=openai")}, Score{Cited: true, CitedPaths: []string{"/compare"}}, nil},
		{"root path", Answer{Text: "See.", Citations: cite("https://acme.com")}, Score{Cited: true, CitedPaths: []string{"/"}}, nil},
		{"escaped path", Answer{Text: "See.", Citations: cite("https://acme.com/a%20b/")}, Score{Cited: true, CitedPaths: []string{"/a%20b"}}, nil},
		{"domain in text", Answer{Text: "Visit acme.com today."}, Score{Named: true, Position: 1}, nil},
		{"rival first", Answer{Text: "Umami and Plausible lead, then Acme."}, Score{Named: true, Position: 3}, map[string]int{"Umami": 1, "Plausible": 2}},
		{"nobody named", Answer{Text: "Many options exist."}, Score{}, nil},
		{"duplicate links", Answer{Text: "x", Citations: cite("https://acme.com/a", "https://acme.com/a/")}, Score{Cited: true, CitedPaths: []string{"/a"}}, nil},
	}
	for _, c := range cases {
		got := ScoreAnswer(c.a, []string{"Acme"}, "www.acme.com", rivals)
		if got.Named != c.want.Named || got.Cited != c.want.Cited || got.Position != c.want.Position || !reflect.DeepEqual(got.CitedPaths, c.want.CitedPaths) {
			t.Errorf("%s: got %+v want %+v", c.name, got, c.want)
		}
		for _, r := range got.Rivals {
			if r.Position != c.rivalAt[r.Name] {
				t.Errorf("%s: rival %s at %d, want %d", c.name, r.Name, r.Position, c.rivalAt[r.Name])
			}
		}
	}
}

func TestScoreNonLatin(t *testing.T) {
	s := ScoreAnswer(Answer{Text: "Лучший сервис — Аналитика Плюс, затем другие."}, []string{"Аналитика Плюс"}, "a.ru", nil)
	if !s.Named || s.Position != 1 {
		t.Errorf("%+v", s)
	}
	s = ScoreAnswer(Answer{Text: "Аналитикаплюсовый"}, []string{"Аналитика"}, "a.ru", nil)
	if s.Named {
		t.Error("matched inside a word")
	}
}

func TestScoreSentenceAndRivalLinks(t *testing.T) {
	a := Answer{Text: "Plausible is popular. Acme ties visits to revenue. Done.", Citations: []Citation{{URL: "https://plausible.io/p"}}}
	s := ScoreAnswer(a, []string{"Acme"}, "acme.com", []Rival{{"Plausible", "plausible.io"}})
	if s.Sentence != "Acme ties visits to revenue" && s.Sentence != "Acme ties visits to revenue." {
		t.Errorf("sentence %q", s.Sentence)
	}
	if !s.Rivals[0].Cited || !s.Rivals[0].Named || s.Rivals[0].Position != 1 || s.Position != 2 {
		t.Errorf("%+v", s)
	}
}

func TestPagePath(t *testing.T) {
	for _, c := range []struct {
		in, path string
		same, on bool
	}{
		{"https://www.acme.com/a/b/?q=1#f", "/a/b", true, true},
		{"https://acme.com", "/", true, true},
		{"https://docs.acme.com/x", "/x", false, true},
		{"https://notacme.com/x", "/x", false, false},
		{"mailto:a@acme.com", "", false, false},
		{"https://acme.com/%C3%A9", "/%C3%A9", true, true},
	} {
		p, s, o := PagePath(c.in, "acme.com")
		if p != c.path || s != c.same || o != c.on {
			t.Errorf("%s: %q %v %v", c.in, p, s, o)
		}
	}
}

func TestSuggest(t *testing.T) {
	q := SuggestQuestions("saas", "Acme | Privacy analytics", "", []string{"how to track revenue by source", "acme pricing page ok", "two words"}, []string{"Acme"})
	if len(q) == 0 {
		t.Fatal("none")
	}
	for _, x := range q {
		if Index(x, "acme") >= 0 {
			t.Errorf("names the site: %s", x)
		}
	}
	if q[len(q)-1] != "how to track revenue by source" {
		t.Errorf("%v", q)
	}
	r := SuggestRivals(map[string]int{"plausible.io": 5, "acme.com": 9, "docs.acme.com": 2, "reddit.com": 8, "umami.is": 3}, "acme.com")
	if len(r) != 2 || r[0].Name != "Plausible" || r[1].Domain != "umami.is" {
		t.Errorf("%v", r)
	}
}
