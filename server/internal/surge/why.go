package surge

import (
	"sort"
	"strings"
)

// Count is one value and how many of the people online have it.
type Count struct {
	Value string
	N     int64
}

// Seen is who is online, by what they have in common: the lists are the
// values with their people, most first.
type Seen struct {
	Online, Before int64
	Hosts          []Count // referring sites
	Channels       []Count
	Pages          []Count
	Countries      []Count
	Campaigns      []Count
	Devices        []Count
}

// hostNames are the referring sites people know by a name.
var hostNames = map[string]string{
	"facebook.com": "Facebook", "instagram.com": "Instagram", "threads.net": "Threads", "t.co": "X", "x.com": "X",
	"twitter.com": "X", "reddit.com": "Reddit", "linkedin.com": "LinkedIn", "lnkd.in": "LinkedIn", "youtube.com": "YouTube",
	"news.ycombinator.com": "Hacker News", "producthunt.com": "Product Hunt", "google.com": "Google", "bing.com": "Bing",
	"duckduckgo.com": "DuckDuckGo", "tiktok.com": "TikTok", "pinterest.com": "Pinterest", "whatsapp.com": "WhatsApp",
	"telegram.org": "Telegram", "t.me": "Telegram", "medium.com": "Medium", "github.com": "GitHub", "substack.com": "Substack",
}

// Name is a referring site as people say it: "l.facebook.com" is Facebook,
// anything unknown is its own host without a leading www.
func Name(host string) string {
	h := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(host)), "www.")
	for {
		if n, ok := hostNames[h]; ok {
			return n
		}
		i := strings.IndexByte(h, '.')
		if i < 0 || strings.IndexByte(h[i+1:], '.') < 0 {
			return h
		}
		h = h[i+1:] // l.facebook.com -> facebook.com
	}
}

// Build says why a site is busy: the source that sent most of the people
// online (a named referring site, or the channel when nobody has one), the
// page most are on, a campaign or a country when one stands out, and where
// it was a quarter of an hour ago. hosts are the referring hosts that make
// up the source, to ask how many it usually sends.
func Build(s Seen, minutes int) (why Why, hosts []string) {
	why = Why{Before: s.Before, Minutes: minutes}
	// A source's hosts together: l.facebook.com and m.facebook.com are Facebook.
	byName := map[string]*Count{}
	members := map[string][]string{}
	var order []string
	for _, h := range s.Hosts {
		n := Name(h.Value)
		if byName[n] == nil {
			byName[n] = &Count{Value: n}
			order = append(order, n)
		}
		byName[n].N += h.N
		members[n] = append(members[n], h.Value)
	}
	sort.SliceStable(order, func(a, b int) bool { return byName[order[a]].N > byName[order[b]].N })
	var topChannel Count
	if len(s.Channels) > 0 {
		topChannel = s.Channels[0]
	}
	switch {
	case len(order) > 0 && byName[order[0]].N*2 >= topChannel.N:
		top := byName[order[0]]
		why.Source, why.SourceDim, why.SourceValue, why.SourceN = top.Value, "referrer", members[top.Value][0], top.N
		hosts = members[top.Value]
	case topChannel.N > 0:
		why.Source, why.SourceDim, why.SourceValue, why.SourceN = topChannel.Value, "channel", topChannel.Value, topChannel.N
	}
	if len(s.Campaigns) > 0 && s.Campaigns[0].N >= 2 && s.Campaigns[0].N*3 >= s.Online {
		why.Campaign = s.Campaigns[0].Value
	}
	if len(s.Pages) > 0 && s.Pages[0].N >= 2 {
		why.Page, why.PageN = s.Pages[0].Value, s.Pages[0].N
	}
	if len(s.Countries) > 0 && s.Countries[0].N >= 2 && s.Countries[0].N*2 > s.Online {
		why.Country, why.CountryN = s.Countries[0].Value, s.Countries[0].N
	}
	return why, hosts
}
