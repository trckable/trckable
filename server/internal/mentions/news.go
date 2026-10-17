package mentions

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"net/url"
	"strings"
	"time"
	"unicode"
)

// News and blogs: Google News's RSS search and GDELT's document search. Both
// answer without a key. Google hands out its own redirect address for each
// article, with the publisher's site beside it; GDELT gives the real address.

const (
	googleNews = "https://news.google.com/rss/search"
	gdelt      = "https://api.gdeltproject.org/api/v2/doc/doc"
)

// anyOf writes keywords as a search: "a" OR "b".
func anyOf(keywords []string) string {
	q := make([]string, 0, len(keywords))
	for _, k := range keywords {
		q = append(q, `"`+k+`"`)
	}
	return strings.Join(q, " OR ")
}

type rssFeed struct {
	Items []struct {
		Title   string `xml:"title"`
		Link    string `xml:"link"`
		PubDate string `xml:"pubDate"`
		Desc    string `xml:"description"`
		Source  struct {
			URL  string `xml:"url,attr"`
			Name string `xml:",chardata"`
		} `xml:"source"`
	} `xml:"channel>item"`
}

// SearchGoogleNews returns the articles Google News holds for the keywords
// from the last two days. etag is the one the last answer carried (empty the
// first time); notModified says nothing changed since.
func SearchGoogleNews(ctx context.Context, d Doer, keywords []string, etag string) (list []Mention, newTag string, notModified bool, err error) {
	return searchGoogleNews(ctx, d, keywords, etag, "2d")
}

func searchGoogleNews(ctx context.Context, d Doer, keywords []string, etag, within string) (list []Mention, newTag string, notModified bool, err error) {
	q := url.Values{"q": {anyOf(keywords) + " when:" + within}, "hl": {"en-US"}, "gl": {"US"}, "ceid": {"US:en"}}
	header := map[string]string{}
	if etag != "" {
		header["If-None-Match"] = etag
	}
	body, h, status, err := get(ctx, d, "GET", googleNews+"?"+q.Encode(), header, nil)
	if err != nil {
		return nil, "", false, err
	}
	if status == 304 {
		return nil, etag, true, nil
	}
	var feed rssFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil, "", false, err
	}
	for _, it := range feed.Items {
		at, perr := time.Parse(time.RFC1123, strings.TrimSpace(it.PubDate))
		if perr != nil {
			at, perr = time.Parse(time.RFC1123Z, strings.TrimSpace(it.PubDate))
		}
		host := HostOf(it.Source.URL)
		if perr != nil || !Web(it.Link) || host == "" {
			continue
		}
		title := Snippet(it.Title)
		if name := strings.TrimSpace(it.Source.Name); name != "" {
			title = strings.TrimSuffix(title, " - "+name)
		}
		desc := Snippet(it.Desc)
		if !HasAny(title+" "+desc+" "+it.Link, keywords) {
			continue // the search matches loosely; only an article that names a keyword is a mention
		}
		out := Mention{Source: News, URL: it.Link, Title: title, Host: host, PostedAt: at.Unix()}
		if desc != "" && desc != title && !strings.HasPrefix(desc, title) {
			out.Snippet = Sentence(desc, keywords)
		}
		list = append(list, out)
	}
	return list, h.Get("ETag"), false, nil
}

// SearchGDELT returns the articles GDELT saw for the keywords in the last day.
func SearchGDELT(ctx context.Context, d Doer, keywords []string) ([]Mention, error) {
	q := url.Values{"query": {"(" + anyOf(keywords) + ")"}, "mode": {"artlist"}, "format": {"json"}, "maxrecords": {"50"}, "timespan": {"1d"}, "sort": {"datedesc"}}
	body, _, _, err := get(ctx, d, "GET", gdelt+"?"+q.Encode(), nil, nil)
	if err != nil {
		return nil, err
	}
	var res struct {
		Articles []struct {
			URL, Title, SeenDate, Domain string
		}
	}
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, err
	}
	var out []Mention
	for _, a := range res.Articles {
		at, err := time.Parse("20060102T150405Z", a.SeenDate)
		host := HostOf(a.URL)
		if err != nil || !Web(a.URL) || host == "" {
			continue
		}
		if !HasAny(a.Title+" "+a.URL, keywords) {
			continue
		}
		out = append(out, Mention{Source: News, URL: a.URL, Title: Snippet(a.Title), Host: host, PostedAt: at.Unix()})
	}
	return out, nil
}

// Canonical is an address with what does not name the page taken off:
// scheme, "www.", fragment, tracking parameters and a closing slash.
func Canonical(addr string) string {
	u, err := url.Parse(strings.TrimSpace(addr))
	if err != nil {
		return addr
	}
	q := u.Query()
	for k := range q {
		if strings.HasPrefix(strings.ToLower(k), "utm_") || k == "fbclid" || k == "gclid" {
			q.Del(k)
		}
	}
	rest := strings.TrimSuffix(u.Path, "/")
	if enc := q.Encode(); enc != "" {
		rest += "?" + enc
	}
	return strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.") + rest
}

// TitleKey is a headline reduced to its letters and digits, so the same story
// from two sources compares equal.
func TitleKey(title string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(title) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}
