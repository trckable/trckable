package mentions

import (
	"context"
	"net/url"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

// The matcher decides, for one item a source returned, whether it is about a
// site. It is strict on purpose: when unsure it says no, because a missed
// mention costs little and a wrong one costs the owner's trust.
//
//   - The site's own address is the only automatic evidence: whole, in any
//     case, as the address, with "www.", as a subdomain, or defanged
//     (acme[.]example). Not as part of a longer name, not under another
//     ending (acme.example.org), not in another site's address.
//   - A name word (a bare "acme") counts only when its owner added it and only
//     with a co-word from the site's topic words in the same text. A news
//     item needs a quoted phrase (two words or more) as well.
//   - Excluded words, required words and blocked sites are the owner's rules,
//     on every item. Pages of the site's own address are never mentions.

// Rules is everything the matcher knows about one site.
type Rules struct {
	Domain   string   // the site's address
	Names    []string // name words and phrases the owner added
	Topic    []string // co-words a name word needs beside it
	Required []string // words that must all be in the text
	Excluded []string // words that rule an item out
	Blocked  []string // sites (hosts) whose items never count
}

// Item is one thing a source returned.
type Item struct {
	Source  string
	URL     string // the item's own address
	Host    string // the site it was published on
	Title   string
	Snippet string
	Link    string // what it points at: a Hacker News story's address, a launch's website
}

// Why an item was refused, or how it was accepted.
const (
	ViaDomain = "domain" // the site's address is in the text
	ViaName   = "name"   // an added name, with a co-word
	ViaPage   = "page"   // a visit came from its page (referrer-confirmed)

	NoEvidence  = "no evidence"
	NoCoWord    = "name without a co-word"
	NoPhrase    = "news needs a phrase"
	OwnPage     = "a page of the site itself"
	BlockedSite = "blocked site"
	Excluded    = "excluded word"
	Missing     = "required word missing"
	Rejected    = "judged not about the site"
)

// Verdict is the matcher's answer.
type Verdict struct {
	Show   bool
	Via    string // how it matched, when it did
	Reason string // why not, when it did not
	Word   string // the word or site that decided it
}

// Match says whether an item is about the site, and why.
func (r Rules) Match(it Item) Verdict {
	if v := r.Allowed(it); !v.Show {
		return v
	}
	text := it.Title + " " + it.Snippet
	via, word := r.evidence(it, text)
	if via == "" {
		return Verdict{Reason: word, Word: ""}
	}
	for _, w := range r.Required {
		if !hasWord(text, w) {
			return Verdict{Reason: Missing, Word: w}
		}
	}
	return Verdict{Show: true, Via: via, Word: word}
}

// Allowed applies the owner's rules alone (own pages, blocked sites,
// excluded words), the part that needs no evidence: stored items are
// checked with it again whenever a rule changes.
func (r Rules) Allowed(it Item) Verdict {
	for _, h := range []string{HostOf(it.URL), strings.TrimPrefix(strings.ToLower(it.Host), "www.")} {
		if h != "" && r.Own(h) {
			return Verdict{Reason: OwnPage, Word: h}
		}
	}
	if b := r.blocked(it); b != "" {
		return Verdict{Reason: BlockedSite, Word: b}
	}
	text := it.Title + " " + it.Snippet
	for _, w := range r.Excluded {
		if hasWord(text, w) {
			return Verdict{Reason: Excluded, Word: w}
		}
	}
	return Verdict{Show: true}
}

// Page says whether a page that sent visitors may be a mention: it is
// confirmed by the visits, so only the site's own pages and blocked sites rule it out.
func (r Rules) Page(addr string) Verdict {
	return r.Allowed(Item{URL: addr, Host: HostOf(addr)})
}

// Own says whether a host is the site's own address or one of its subdomains.
func (r Rules) Own(host string) bool {
	d := bareDomain(r.Domain)
	host = strings.TrimPrefix(strings.ToLower(host), "www.")
	return d != "" && (host == d || strings.HasSuffix(host, "."+d))
}

func (r Rules) blocked(it Item) string {
	for _, h := range []string{HostOf(it.URL), strings.TrimPrefix(strings.ToLower(it.Host), "www.")} {
		for _, b := range r.Blocked {
			b = BlockedHost(b)
			if h != "" && b != "" && (h == b || strings.HasSuffix(h, "."+b)) {
				return b
			}
		}
	}
	return ""
}

// evidence finds what makes the item about the site. When nothing does, word
// holds the reason.
func (r Rules) evidence(it Item, text string) (via, word string) {
	d := bareDomain(r.Domain)
	if d != "" && HasDomain(text+" "+it.Link, d) {
		return ViaDomain, d
	}
	reason := NoEvidence
	for _, n := range r.Names {
		if !hasWord(text, n) {
			continue
		}
		if it.Source == News && !strings.Contains(strings.TrimSpace(n), " ") {
			reason = NoPhrase
			continue
		}
		for _, c := range r.Topic {
			if hasWord(text, c) {
				return ViaName, n
			}
		}
		reason = NoCoWord
	}
	return "", reason
}

// HasDomain says whether text names the address d (no "www."): as a word of
// its own, as a subdomain's end ("blog.acme.example"), followed by a path or
// a sentence's dot, and not as the middle of a longer name or address, nor as
// two sentences run together ("plan.Al Smith", "about time.Is it").
func HasDomain(text, d string) bool {
	orig := []rune(Defang(text))
	dom := lowerRunes(strings.TrimSpace(d))
	if len(dom) == 0 || !slices.Contains(dom, '.') {
		return false
	}
	last := slices.Index(dom, '.')
	for k, r := range dom {
		if r == '.' {
			last = k
		}
	}
	for i := 0; i+len(dom) <= len(orig); i++ {
		if !equalFold(orig[i:], dom) || !domainLeft(orig, i) || !domainRight(orig, i+len(dom)) {
			continue
		}
		if last == 0 || last == len(dom)-1 {
			return true
		}
		before, after := orig[i+last-1], orig[i+last+1]
		if unicode.IsLower(before) && unicode.IsUpper(after) && (i+len(dom) >= len(orig) || orig[i+len(dom)] != '/') {
			continue // a sentence ended and the next began without a space
		}
		return true
	}
	return false
}

func lowerRunes(s string) []rune {
	r := []rune(s)
	for i := range r {
		r[i] = unicode.ToLower(r[i])
	}
	return r
}

// equalFold says whether the runes at the start of text are want, in any case.
func equalFold(text, want []rune) bool {
	if len(text) < len(want) {
		return false
	}
	for i, w := range want {
		if unicode.ToLower(text[i]) != w {
			return false
		}
	}
	return true
}

// wordRune says whether a character belongs to a word: a letter, a digit, or
// a mark that sits on one (the accent of a decomposed "e\u0301").
func wordRune(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsMark(r) }

func domainLeft(s []rune, at int) bool {
	if at == 0 {
		return true
	}
	r := s[at-1]
	switch {
	case r == '.':
		// a subdomain: a label stands before the dot
		return at >= 2 && wordRune(s[at-2])
	case r == '-' || r == '_' || r == '=':
		return false
	}
	return !wordRune(r)
}

func domainRight(s []rune, at int) bool {
	if at >= len(s) {
		return true
	}
	r := s[at]
	switch {
	case r == '.':
		// the end of a sentence, not the start of a longer address
		return at+1 >= len(s) || !wordRune(s[at+1])
	case r == '-' || r == '_':
		return false
	}
	return !wordRune(r)
}

var defang = strings.NewReplacer("[.]", ".", "(.)", ".", "{.}", ".", "[dot]", ".", "(dot)", ".")

// Defang turns the safe-to-print spellings of an address back into one.
func Defang(s string) string { return defang.Replace(s) }

// hasWord is Has with the stricter edges a name needs: a hyphen or an
// underscore joins a word to its neighbour ("Albas-Smith"), and so does a dot
// that goes on ("albas.com"), and an accent counts as part of the letter.
func hasWord(text, word string) bool {
	orig := []rune(Defang(text))
	w := lowerRunes(strings.TrimSpace(word))
	if len(w) == 0 {
		return false
	}
	for i := 0; i+len(w) <= len(orig); i++ {
		if equalFold(orig[i:], w) && wordLeft(orig, i) && wordRight(orig, i+len(w)) {
			return true
		}
	}
	return false
}

func wordLeft(s []rune, at int) bool {
	return at == 0 || !(wordRune(s[at-1]) || s[at-1] == '-' || s[at-1] == '_')
}

func wordRight(s []rune, at int) bool {
	if at >= len(s) {
		return true
	}
	r := s[at]
	switch {
	case wordRune(r) || r == '-' || r == '_':
		return false
	case r == '.':
		return at+1 >= len(s) || !wordRune(s[at+1])
	}
	return true
}

func bareDomain(d string) string {
	return strings.TrimPrefix(strings.ToLower(strings.TrimSpace(d)), "www.")
}

// BlockedHost is a blocked site as a bare host: "https://www.Reddit.com/r/x" is "reddit.com".
func BlockedHost(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return ""
	}
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(u.Hostname(), "www.")
}

// SearchTerms are the words the sources are asked for: the address (with and
// without "www.") and the names the owner added.
func (r Rules) SearchTerms() []string {
	d := bareDomain(r.Domain)
	var out []string
	seen := map[string]bool{}
	for _, k := range append([]string{d, "www." + d}, r.Names...) {
		k = strings.TrimSpace(k)
		if utf8.RuneCountInString(k) < 3 || seen[strings.ToLower(k)] || k == "www." {
			continue
		}
		seen[strings.ToLower(k)] = true
		out = append(out, k)
	}
	return out
}

// Judge is the optional last check, after a match: is this item really about
// the site? The core runs without one. A build that has a judge (it may call
// a service) sets it on the server; a refusal keeps the item hidden, not deleted.
type Judge interface {
	About(ctx context.Context, site Subject, it Item) (bool, error)
}

// Subject is what a judge is told about the site.
type Subject struct {
	Domain string
	Name   string
	Topic  []string
}
