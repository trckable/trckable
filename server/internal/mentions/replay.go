package mentions

import "sort"

// Replay runs the matcher over stored feed items without touching anything:
// it is how a change to the matching is checked against real data before it is
// switched on. Items are read as they were stored (a mention's fields), per site.

// ReplaySite is one site and the rules it is matched by.
type ReplaySite struct {
	ID       string   `json:"id"`
	Domain   string   `json:"domain"`
	Names    []string `json:"names"`
	Topic    []string `json:"topic"`
	Required []string `json:"required"`
	Excluded []string `json:"excluded"`
	Blocked  []string `json:"blocked"`
}

// ReplayItem is one stored feed item. Site is the id of a ReplaySite (site_id
// is read as well, so a row dumped from the mentions table fits as it is).
type ReplayItem struct {
	Site     string `json:"site"`
	SiteID   string `json:"site_id"`
	Source   string `json:"source"`
	URL      string `json:"url"`
	Host     string `json:"host"`
	Title    string `json:"title"`
	Snippet  string `json:"snippet"`
	Link     string `json:"link"`
	PostedAt int64  `json:"posted_at"`
}

// ReplayInput is a dump: the sites and the items found for them.
type ReplayInput struct {
	Sites []ReplaySite `json:"sites"`
	Items []ReplayItem `json:"items"`
}

// ReplayResult is the matcher's answer for one item.
type ReplayResult struct {
	Site     string
	Source   string
	URL      string
	Title    string
	PostedAt int64
	Verdict  Verdict
	Dup      bool // the same story as an earlier hit: counted once, not listed as another
}

// Hit says whether the item would be shown.
func (r ReplayResult) Hit() bool { return r.Verdict.Show && !r.Dup }

// Replay matches every item against its site's rules, oldest first, and marks
// the repeats of a story already shown. Items of a site the dump does not
// describe are refused with the reason "unknown site".
func Replay(in ReplayInput) []ReplayResult {
	rules := map[string]Rules{}
	for _, s := range in.Sites {
		rules[s.ID] = Rules{Domain: s.Domain, Names: s.Names, Topic: s.Topic, Required: s.Required, Excluded: s.Excluded, Blocked: s.Blocked}
	}
	items := append([]ReplayItem(nil), in.Items...)
	sort.SliceStable(items, func(i, j int) bool { return items[i].PostedAt < items[j].PostedAt })
	shown := map[string][]Mention{}
	var out []ReplayResult
	for _, it := range items {
		site := it.Site
		if site == "" {
			site = it.SiteID
		}
		res := ReplayResult{Site: site, Source: it.Source, URL: it.URL, Title: it.Title, PostedAt: it.PostedAt}
		r, ok := rules[site]
		if !ok {
			res.Verdict = Verdict{Reason: "unknown site"}
			out = append(out, res)
			continue
		}
		res.Verdict = r.Match(Item{Source: it.Source, URL: it.URL, Host: it.Host, Title: it.Title, Snippet: it.Snippet, Link: it.Link})
		if res.Verdict.Show {
			m := Mention{Source: it.Source, URL: it.URL, Title: it.Title}
			for _, o := range shown[site] {
				if Same(o, m) {
					res.Dup = true
					break
				}
			}
			if !res.Dup {
				shown[site] = append(shown[site], m)
			}
		}
		out = append(out, res)
	}
	return out
}
