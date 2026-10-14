// Package mentions finds where a site is talked about: Hacker News, Product
// Hunt and the news and blogs. Every source is keyless except Product Hunt,
// which wants a developer token. A mention is stored as public facts only
// (where, a title or snippet, the author's public handle, when); never a
// profile. The package parses what the sources answer; fetching on a timer,
// storing and matching to traffic are the server's (server/mentions.go).
package mentions

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"unicode"
)

// The sources a mention can come from.
const (
	HN   = "hn"
	PH   = "ph"
	News = "news"
)

// Hosts whose visits count as brought by a mention of that source.
const (
	HNHost = "news.ycombinator.com"
	PHHost = "producthunt.com"
)

// SnippetMax is the most a stored title or snippet holds, in characters.
const SnippetMax = 280

// MaxBody caps what any source may answer with.
const maxBody = 2 << 20

// Mention is one place a site was talked about.
type Mention struct {
	Source   string
	URL      string // the dedupe key
	Kind     string // "comment" for a Hacker News comment; empty otherwise
	Title    string // title or snippet, at most SnippetMax characters
	Author   string // public handle; empty for news
	Host     string // the host whose visits it can bring: HN and Product Hunt's own, an article's site
	PostedAt int64  // unix seconds
	Points   int    // Hacker News points, Product Hunt upvotes
	Front    bool   // on the Hacker News front page
}

// Doer is the part of an HTTP client the sources need, so tests can answer
// from recorded files instead of the network.
type Doer interface {
	Do(*http.Request) (*http.Response, error)
}

// ErrLimited says a source asked to be left alone for a while (429 or 5xx).
var ErrLimited = errors.New("the source asked for a pause")

// get reads one answer, up to maxBody bytes. A 304 returns (nil, 304, nil).
func get(ctx context.Context, d Doer, method, addr string, header map[string]string, body io.Reader) ([]byte, http.Header, int, error) {
	req, err := http.NewRequestWithContext(ctx, method, addr, body)
	if err != nil {
		return nil, nil, 0, err
	}
	req.Header.Set("User-Agent", "trckable-mentions")
	for k, v := range header {
		req.Header.Set(k, v)
	}
	res, err := d.Do(req)
	if err != nil {
		return nil, nil, 0, err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotModified {
		return nil, res.Header, res.StatusCode, nil
	}
	if res.StatusCode == http.StatusTooManyRequests || res.StatusCode >= 500 {
		return nil, res.Header, res.StatusCode, fmt.Errorf("%w: %d", ErrLimited, res.StatusCode)
	}
	if res.StatusCode != http.StatusOK {
		return nil, res.Header, res.StatusCode, fmt.Errorf("answered %d", res.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, maxBody))
	return b, res.Header, res.StatusCode, err
}

// Has says whether text names keyword as a word of its own, in any case:
// "acme" is in "Show HN: Acme, a tool" and not in "acmeism".
func Has(text, keyword string) bool {
	text, keyword = strings.ToLower(text), strings.ToLower(strings.TrimSpace(keyword))
	if keyword == "" {
		return false
	}
	for from := 0; ; {
		i := strings.Index(text[from:], keyword)
		if i < 0 {
			return false
		}
		i += from
		end := i + len(keyword)
		if edge(text, i, -1) && edge(text, end, 1) {
			return true
		}
		from = i + 1
	}
}

// edge says whether the character on one side of a match is not part of a word.
func edge(s string, at, dir int) bool {
	var r rune
	switch {
	case dir < 0 && at == 0, dir > 0 && at >= len(s):
		return true
	case dir < 0:
		r = []rune(s[:at])[len([]rune(s[:at]))-1]
	default:
		r = []rune(s[at:])[0]
	}
	return !unicode.IsLetter(r) && !unicode.IsDigit(r)
}

// HasAny says whether text names any of the keywords.
func HasAny(text string, keywords []string) bool {
	for _, k := range keywords {
		if Has(text, k) {
			return true
		}
	}
	return false
}

// Snippet is text as one plain line of at most SnippetMax characters: tags
// gone, entities read, spaces collapsed.
func Snippet(s string) string {
	s = stripTags(s)
	s = strings.Join(strings.Fields(s), " ")
	r := []rune(s)
	if len(r) > SnippetMax {
		return string(r[:SnippetMax-1]) + "…"
	}
	return s
}

func stripTags(s string) string {
	var b strings.Builder
	in := false
	for _, r := range s {
		switch {
		case r == '<':
			in = true
			b.WriteRune(' ')
		case r == '>' && in:
			in = false
		case !in:
			b.WriteRune(r)
		}
	}
	return unescape(b.String())
}

var entities = strings.NewReplacer("&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`, "&#x27;", "'", "&#39;", "'", "&#x2F;", "/", "&nbsp;", " ")

func unescape(s string) string { return entities.Replace(s) }

// HostOf is an address's host without "www.", or "" when it is not a web address.
func HostOf(addr string) string {
	u, err := url.Parse(strings.TrimSpace(addr))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return ""
	}
	return strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
}

// Web says whether an address is one a link may point to.
func Web(addr string) bool { return HostOf(addr) != "" }
