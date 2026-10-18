package mentions

import (
	"context"
	"sort"
	"strings"
	"unicode"
)

// LookAlike is what the news says about a word an owner wants to be found by.
type LookAlike struct {
	Word      string   `json:"word"`
	Checked   bool     `json:"checked"`         // false when the news could not be read: nothing is claimed
	Elsewhere int      `json:"elsewhere"`       // headlines that name the word and not the site
	Examples  []string `json:"examples"`        // up to three of them
	Suggest   []string `json:"suggest_exclude"` // words they share, to offer as excluded words
}

const (
	lookAlikeWindow   = "90d"
	lookAlikeExamples = 3
	lookAlikeSuggest  = 5
)

// CheckLookAlike samples recent news for a name word. Headlines that name it
// without the site's address or one of its topic words are about something
// else (a person, a place): they are listed, and the words they share are
// offered as words to exclude.
func CheckLookAlike(ctx context.Context, d Doer, word, domain string, topic []string) (LookAlike, error) {
	out := LookAlike{Word: word, Examples: []string{}, Suggest: []string{}}
	list, _, _, err := searchGoogleNews(ctx, d, []string{word}, "", lookAlikeWindow)
	if err != nil {
		return out, err
	}
	out.Checked = true
	var other []string
	seen := []Mention{}
	for _, m := range list {
		text := m.Title + " " + m.Snippet
		if !hasWord(text, word) || HasDomain(text, bareDomain(domain)) || anyWord(text, topic) || anyStory(seen, m) {
			continue
		}
		seen = append(seen, m)
		other = append(other, m.Title)
	}
	out.Elsewhere = len(other)
	out.Examples = other[:min(len(other), lookAlikeExamples)]
	out.Suggest = SuggestExclude(other, append([]string{word, domain}, topic...))
	return out, nil
}

func anyWord(text string, words []string) bool {
	for _, w := range words {
		if hasWord(text, w) {
			return true
		}
	}
	return false
}

// SuggestExclude offers words to exclude from headlines that were about
// something else: the capitalised words (and acronyms) at least half of them
// share, most shared first, never one of the site's own words.
func SuggestExclude(titles []string, own []string) []string {
	if len(titles) == 0 {
		return []string{}
	}
	skip := map[string]bool{}
	for _, o := range own {
		for _, w := range strings.FieldsFunc(strings.ToLower(o), notWord) {
			skip[w] = true
		}
	}
	count := map[string]int{}
	for _, t := range titles {
		once := map[string]bool{}
		for _, w := range strings.FieldsFunc(stripPublisher(t), notWord) {
			r := []rune(w)
			if len(r) < 2 || !unicode.IsUpper(r[0]) || skip[strings.ToLower(w)] || stopWords[strings.ToLower(w)] {
				continue
			}
			once[w] = true
		}
		for w := range once {
			count[w]++
		}
	}
	need := max(1, (len(titles)+1)/2)
	var out []string
	for w, n := range count {
		if n >= need {
			out = append(out, w)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if count[out[i]] != count[out[j]] {
			return count[out[i]] > count[out[j]]
		}
		return out[i] < out[j]
	})
	return out[:min(len(out), lookAlikeSuggest)]
}

func notWord(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }

var stopWords = map[string]bool{"the": true, "and": true, "for": true, "with": true, "new": true, "how": true, "why": true, "what": true, "this": true, "that": true, "from": true, "der": true, "die": true, "das": true, "und": true, "les": true, "los": true}
