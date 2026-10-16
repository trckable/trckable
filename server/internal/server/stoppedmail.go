package server

import (
	"fmt"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/mailkit"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// stoppedWords says in plain words what happened, what it probably means (the
// latest check of the site decides which) and where to look.
func (s *Server) stoppedWords(ev *alerts.Event, info sqlite.SiteInfo, last int64, c sqlite.SiteCheck, now time.Time) {
	loc, err := time.LoadLocation(info.Timezone)
	if err != nil {
		loc = time.UTC
	}
	quiet := alerts.Ago(time.Duration(now.Unix()-last) * time.Second)
	lastAt := time.Unix(last, 0).In(loc).Format("15:04 MST, 2 Jan")
	meaning := stoppedMeaning(last, c)
	ev.Title = "Tracking stopped"
	ev.Subject = info.Domain + ": no visits for " + quiet
	ev.Message = fmt.Sprintf("No visits have reached trckable from %s since %s (%s). %s", info.Domain, lastAt, quiet, meaning)
	link := ""
	if s.cfg.BaseURL != "" {
		link = strings.TrimSuffix(s.cfg.BaseURL, "/") + "/" + info.Domain
	}
	ev.Email = &mailkit.Email{
		Preheader: meaning,
		Blocks: []mailkit.Block{
			mailkit.Heading{Eyebrow: "Tracking stopped", Title: info.Domain},
			mailkit.Callout{Tone: mailkit.Bad, Title: "No visits for " + quiet, Text: fmt.Sprintf("No visits have reached trckable from %s since %s.", info.Domain, lastAt)},
			mailkit.Paragraph{Lead: checkedLead, Text: meaning},
			mailkit.Rows{Rows: [][2]string{{"Last visit", lastAt}, {"Quiet for", quiet}}},
			mailkit.Button{Label: statusButton, URL: link},
		},
		Foot: mailkit.Foot{Note: "You get this when a site's visits stop."},
	}
}

// stoppedMeaning reads the latest check of the site: did it answer after the
// last visit, and is the tracking script still on the page.
func stoppedMeaning(last int64, c sqlite.SiteCheck) string {
	switch {
	case c.At <= last:
		return "No check has looked at the site since then. It may be a quiet stretch, or the tracking script may have been removed."
	case c.Error != "":
		return "The site does not answer either (" + c.Error + "), so it is probably down."
	case c.Found == "site":
		return "The homepage answers and the tracking script is still on it, so this is most likely just a quiet stretch, common for small sites at night."
	case c.Found == "none" || c.Found == "other":
		return "The homepage answers, but the tracking script was not found on it. It may have been removed."
	}
	return "The homepage answers, but its page could not be read to look for the tracking script."
}

// probeWords dresses the down and back-up messages as designed emails: what
// happened, the cause in plain words, the checks' summary, and the button.
func (s *Server) probeWords(ev *alerts.Event, site sqlite.SiteRow, before, after sqlite.SiteProbe) {
	loc, err := time.LoadLocation(site.Timezone)
	if err != nil {
		loc = time.UTC
	}
	link := ""
	if s.cfg.BaseURL != "" {
		link = strings.TrimSuffix(s.cfg.BaseURL, "/") + "/" + site.Domain
	}
	at := func(t int64) string { return time.Unix(t, 0).In(loc).Format("15:04 MST, 2 Jan") }
	m := &mailkit.Email{Foot: mailkit.Foot{Note: "You get this when a site stops answering, and when it is back."}}
	if ev.Kind == "up" {
		gap := plainDuration(after.At - before.DownSince)
		ev.Subject = site.Domain + " is back up after " + gap
		ev.Message = fmt.Sprintf("%s answers our checks again after %s.", site.Domain, gap)
		m.Preheader = ev.Message
		m.Blocks = []mailkit.Block{
			mailkit.Heading{Eyebrow: "Back up", Title: site.Domain},
			mailkit.Hero{Tone: mailkit.Good, Badge: &mailkit.Badge{Text: "Answering again", Tone: mailkit.Good, Dot: true}, Eyebrow: "It was down for", Big: gap, Line: "Our checks get an answer again."},
			mailkit.Rows{Rows: [][2]string{{"Down since", at(before.DownSince)}, {"Answering again", at(after.At)}}},
			mailkit.Button{Label: statusButton, URL: link},
		}
	} else {
		ev.Subject = site.Domain + " isn't answering"
		ev.Message = downMessage(site.Timezone, after)
		m.Preheader = fmt.Sprintf("No answer since %s (%s).", at(after.DownSince), after.Error)
		m.Blocks = []mailkit.Block{
			mailkit.Heading{Eyebrow: "Not answering", Title: site.Domain},
			mailkit.Callout{Tone: mailkit.Bad, Title: site.Domain + " isn't answering", Text: fmt.Sprintf("Our checks have not got an answer from %s since %s (%s).", site.Domain, at(after.DownSince), after.Error)},
			mailkit.Paragraph{Lead: checkedLead, Text: fmt.Sprintf("%d checks in a row got no answer, the last at %s. That usually means the site or its server is down. Some visitors may still get through, which is why you may still see people online.", after.Failures, at(after.At))},
			mailkit.Rows{Rows: [][2]string{{"Down since", at(after.DownSince)}, {"Failed checks in a row", fmt.Sprint(after.Failures)}, {"Last check", at(after.At)}}},
			mailkit.Button{Label: statusButton, URL: link},
		}
	}
	ev.Email = m
}

// The words both site emails share.
const (
	checkedLead  = "What we checked"
	statusButton = "Open site status"
)
