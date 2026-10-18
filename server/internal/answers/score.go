package answers

import (
	"sort"
	"strings"

	"github.com/trckable/trckable/server/internal/mentions"
)

// Rival is another site to compare with.
type Rival struct{ Name, Domain string }

// RivalScore is how an answer treated a rival.
type RivalScore struct {
	Name     string
	Named    bool
	Cited    bool
	Position int
}

// Score is how one answer treated the site.
type Score struct {
	Named, Cited bool
	Position     int      // 1-based among everyone named; 0 = not named
	CitedPaths   []string // same-host pages only, as the tracker stores them
	Sentence     string   // the sentence that named the site
	Rivals       []RivalScore
}

// ScoreAnswer reads an answer for the site (its words and bare domain) and the
// rivals. Only Citations count as linked; Sources never do.
func ScoreAnswer(a Answer, words []string, domain string, rivals []Rival) Score {
	domain = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(domain)), "www.")
	var s Score
	own := -1
	for _, w := range words {
		if i := Index(a.Text, w); i >= 0 && (own < 0 || i < own) {
			own = i
		}
	}
	if domain != "" {
		if i := Index(a.Text, domain); i >= 0 && (own < 0 || i < own) {
			own = i
		}
	}
	s.Named = own >= 0
	seen := map[string]bool{}
	for _, c := range a.Citations {
		path, same, on := PagePath(c.URL, domain)
		if on {
			s.Cited = true
		}
		if same && !seen[path] {
			seen[path] = true
			s.CitedPaths = append(s.CitedPaths, path)
		}
	}
	type at struct {
		who string
		pos int
	}
	var order []at
	if own >= 0 {
		order = append(order, at{"", own})
	}
	for _, r := range rivals {
		rs := RivalScore{Name: r.Name}
		first := Index(a.Text, r.Name)
		if i := Index(a.Text, r.Domain); r.Domain != "" && i >= 0 && (first < 0 || i < first) {
			first = i
		}
		rs.Named = first >= 0
		if rd := strings.TrimPrefix(strings.ToLower(r.Domain), "www."); rd != "" {
			for _, c := range a.Citations {
				if _, _, on := PagePath(c.URL, rd); on {
					rs.Cited = true
					break
				}
			}
		}
		if rs.Named {
			order = append(order, at{r.Name, first})
		}
		s.Rivals = append(s.Rivals, rs)
	}
	sort.SliceStable(order, func(i, j int) bool { return order[i].pos < order[j].pos })
	for i, o := range order {
		if o.who == "" {
			s.Position = i + 1
			continue
		}
		for k := range s.Rivals {
			if s.Rivals[k].Name == o.who {
				s.Rivals[k].Position = i + 1
			}
		}
	}
	if s.Named {
		s.Sentence = mentions.Sentence(a.Text, append(append([]string{}, words...), domain))
	}
	return s
}
