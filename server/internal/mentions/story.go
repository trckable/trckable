package mentions

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/url"
	"strings"
	"unicode"
)

// Dedupe drops a mention that is the same story as an earlier one: the same
// canonical address, or (for news) a near-identical headline, on any site, since
// a story is copied from one publisher to the next. Order is kept.
func Dedupe(list []Mention) []Mention {
	seen := map[string]bool{}
	var out []Mention
	for _, m := range list {
		if seen[Canonical(m.URL)] || (m.Source == News && anyStory(out, m)) {
			continue
		}
		seen[Canonical(m.URL)] = true
		out = append(out, m)
	}
	return out
}

// anyStory says whether one of the news items in list is the story m tells.
func anyStory(list []Mention, m Mention) bool {
	for _, o := range list {
		if o.Source == News && SameStory(o.Title, m.Title) {
			return true
		}
	}
	return false
}

// Same says whether two stored or found mentions are one: the same canonical
// address, or news with a near-identical headline.
func Same(a, b Mention) bool {
	return Canonical(a.URL) == Canonical(b.URL) || (a.Source == News && b.Source == News && SameStory(a.Title, b.Title))
}

// SameStory says whether two headlines tell one story: the same letters once
// the publisher's name is taken off, or nearly all the words of the shorter
// (85%, and 75% of the longer) in common, with at least four words each.
func SameStory(a, b string) bool {
	ka, kb := TitleKey(stripPublisher(a)), TitleKey(stripPublisher(b))
	if ka == "" || kb == "" {
		return false
	}
	if ka == kb {
		return true
	}
	wa, wb := titleWords(a), titleWords(b)
	if len(wa) < 4 || len(wb) < 4 {
		return false
	}
	common := 0
	for w := range wa {
		if wb[w] {
			common++
		}
	}
	return float64(common) >= 0.85*float64(min(len(wa), len(wb))) && float64(common) >= 0.75*float64(max(len(wa), len(wb)))
}

// stripPublisher takes a trailing " - Publisher" or " | Publisher" off a headline.
func stripPublisher(t string) string {
	for _, sep := range []string{" - ", " | ", " – ", " — "} {
		if i := strings.LastIndex(t, sep); i > 0 && len(t)-i < 40 {
			return t[:i]
		}
	}
	return t
}

func titleWords(t string) map[string]bool {
	out := map[string]bool{}
	for _, w := range strings.FieldsFunc(strings.ToLower(stripPublisher(t)), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
		out[w] = true
	}
	return out
}

// Resolve returns the publisher's own address for a Google News link, so a
// story found by Google and by another source is counted once. The old links
// carry the address inside; for the others a call follows the redirect, if
// follow is true. Any other address is returned as it is; when nothing works,
// so is the Google one.
func Resolve(ctx context.Context, d Doer, link string, follow bool) string {
	u, err := url.Parse(link)
	if err != nil || u.Hostname() != "news.google.com" {
		return link
	}
	if real := decodeGoogleLink(u.Path); real != "" {
		return real
	}
	if !follow {
		return link
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
	if err != nil {
		return link
	}
	req.Header.Set("User-Agent", "trckable-mentions")
	res, err := d.Do(req)
	if err != nil {
		return link
	}
	defer res.Body.Close()
	if res.Request != nil && res.Request.URL != nil && res.Request.URL.Hostname() != "" && !strings.HasSuffix(res.Request.URL.Hostname(), "google.com") && Web(res.Request.URL.String()) {
		return res.Request.URL.String()
	}
	return link
}

// decodeGoogleLink reads the address out of an older Google News article path
// (/rss/articles/CBMi…): base64 around the address.
func decodeGoogleLink(path string) string {
	i := strings.LastIndex(path, "/articles/")
	if i < 0 {
		return ""
	}
	id := path[i+len("/articles/"):]
	b, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(id, "="))
	if err != nil {
		return ""
	}
	s := string(b)
	at := strings.Index(s, "http")
	if at < 0 {
		return ""
	}
	end := len(s)
	for j := at; j < len(s); j++ {
		if s[j] < 0x21 || s[j] > 0x7e {
			end = j
			break
		}
	}
	if real := s[at:end]; Web(real) && HostOf(real) != "news.google.com" {
		return real
	}
	return ""
}
