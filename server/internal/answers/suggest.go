package answers

import (
	"sort"
	"strings"

	"github.com/trckable/trckable/server/internal/mentions"
)

var templates = map[string][]string{
	"shop":    {"best %s online shops", "where to buy %s", "%s shop reviews"},
	"saas":    {"best %s software", "best alternatives for %s", "%s tools compared"},
	"content": {"best blogs about %s", "where to learn about %s", "%s guides worth reading"},
	"other":   {"best %s", "top %s providers", "how to choose %s"},
}

// SuggestQuestions offers up to 10 questions a buyer might ask: templates for
// the kind filled with a category from the homepage title or description, then
// Search Console queries of 3 words or more. None names the site.
func SuggestQuestions(kind, title, desc string, queries, words []string) []string {
	t, ok := templates[kind]
	if !ok {
		t = templates["other"]
	}
	var out []string
	seen := map[string]bool{}
	add := func(q string) {
		q = strings.TrimSpace(q)
		k := strings.ToLower(q)
		if len(q) < 8 || seen[k] || mentions.HasAny(q, words) || len(out) >= 10 {
			return
		}
		seen[k] = true
		out = append(out, q)
	}
	if cat := category(title, desc, words); cat != "" {
		for _, f := range t {
			add(strings.Replace(f, "%s", cat, 1))
		}
	}
	for _, q := range queries {
		if len(strings.Fields(q)) >= 3 {
			add(q)
		}
	}
	return out
}

// category is a short phrase for what the site is about: the description's
// first clause, or the title after the brand, without the site's own words.
func category(title, desc string, words []string) string {
	for _, s := range []string{desc, title} {
		for _, sep := range []string{" | ", " - ", " – ", " — ", ". ", ", ", ": "} {
			if i := strings.Index(s, sep); i > 0 {
				if sep == " | " || sep == " - " || sep == " – " || sep == " — " || sep == ": " {
					// "Brand | what it does": prefer the part without the brand.
					parts := strings.Split(s, sep)
					for _, p := range parts {
						if p = strings.TrimSpace(p); p != "" && !mentions.HasAny(p, words) && len(strings.Fields(p)) <= 6 {
							return strings.ToLower(p)
						}
					}
				}
				s = s[:i]
				break
			}
		}
		s = strings.TrimSpace(s)
		if s != "" && !mentions.HasAny(s, words) && len(strings.Fields(s)) <= 6 {
			return strings.ToLower(s)
		}
	}
	return ""
}

var bigPlatforms = []string{"wikipedia.org", "reddit.com", "youtube.com", "github.com", "medium.com", "quora.com", "linkedin.com", "facebook.com", "x.com", "twitter.com", "amazon.com", "google.com"}

// SuggestRivals offers the hosts most often cited across the site's answers,
// leaving out the site, shared platforms and big sites; at most 8.
func SuggestRivals(citedHosts map[string]int, domain string) []Rival {
	domain = strings.TrimPrefix(strings.ToLower(domain), "www.")
	type hc struct {
		h string
		n int
	}
	var list []hc
	for h, n := range citedHosts {
		h = strings.TrimPrefix(strings.ToLower(h), "www.")
		if h == "" || h == domain || strings.HasSuffix(h, "."+domain) || mentions.Generic(h) || big(h) {
			continue
		}
		list = append(list, hc{h, n})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].n != list[j].n {
			return list[i].n > list[j].n
		}
		return list[i].h < list[j].h
	})
	var out []Rival
	for _, x := range list {
		if len(out) == 8 {
			break
		}
		out = append(out, Rival{Name: guessName(x.h), Domain: x.h})
	}
	return out
}

func big(h string) bool {
	for _, b := range bigPlatforms {
		if h == b || strings.HasSuffix(h, "."+b) {
			return true
		}
	}
	return false
}

// guessName makes "Plausible" of "plausible.io".
func guessName(host string) string {
	label, _, _ := strings.Cut(host, ".")
	if label == "" {
		return host
	}
	return strings.ToUpper(label[:1]) + label[1:]
}
