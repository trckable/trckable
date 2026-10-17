package server

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/mailkit"
	"github.com/trckable/trckable/server/internal/reports"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

const (
	weeklyMentionsShown = 3
	weeklyMentionsRead  = 200
)

// weeklyMentions is the week's section on who talked about the site: the
// mentions that brought visitors, most first, three of them and a count of the rest.
func weeklyMentions(list []sqlite.Mention, link string) (x reports.Weekly) {
	var got []sqlite.Mention
	for _, m := range list {
		if m.Visitors > 0 {
			got = append(got, m)
		}
	}
	sort.SliceStable(got, func(i, j int) bool { return got[i].Visitors > got[j].Visitors })
	for i, m := range got {
		if i == weeklyMentionsShown {
			x.MentionsMore = len(got) - i
			break
		}
		source, mark := mentionMark(m, SourceName(m.Source))
		x.Mentions = append(x.Mentions, mailkit.MentionRow{Mark: mark, Source: source, Title: m.Title, URL: m.URL, Visitors: m.Visitors})
	}
	x.MentionsLink = link
	return x
}

// mentionsPage is the dashboard's Mentions page for a site, when the instance has an address.
func (s *Server) mentionsPage(domain string) string {
	if s.cfg.BaseURL == "" {
		return ""
	}
	return strings.TrimSuffix(s.cfg.BaseURL, "/") + "/" + domain + "/mentions"
}

// weekMentions reads the mentions posted in the week from the same store the Mentions page reads.
func (s *Server) weekMentions(ctx context.Context, siteID, domain string, from, to time.Time) reports.Weekly {
	list, err := s.ctl.Mentions(ctx, siteID, from.Unix(), to.Unix(), weeklyMentionsRead)
	if err != nil {
		return reports.Weekly{}
	}
	return weeklyMentions(list, s.mentionsPage(domain))
}
