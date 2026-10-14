package server

import (
	"fmt"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
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
	ev.Card = &alerts.Card{
		Eyebrow: "Tracking stopped",
		Big:     "No visits for " + quiet,
		Text:    fmt.Sprintf("No visits have reached trckable from %s since %s.\n\n%s", info.Domain, lastAt, meaning),
		Rows:    [][2]string{{"Site", info.Domain}, {"Last visit", lastAt}},
		CTA:     "Open site status",
		Link:    link,
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
	c := alerts.Card{CTA: "Open site status", Link: link}
	if ev.Kind == "up" {
		gap := plainDuration(after.At - before.DownSince)
		ev.Subject = site.Domain + " is back up after " + gap
		c.Eyebrow, c.Live, c.Big = "Back up", true, site.Domain+" is back"
		c.Text = fmt.Sprintf("%s answers our checks again after %s.", site.Domain, gap)
		c.Rows = [][2]string{{"Down since", at(before.DownSince)}, {"Answering again", at(after.At)}}
		ev.Message = c.Text
	} else {
		ev.Subject = site.Domain + " isn't answering"
		c.Eyebrow, c.Big = "Not answering", site.Domain+" isn't answering"
		c.Text = fmt.Sprintf("Our checks have not got an answer from %s since %s (%s).\n\nThat usually means the site or its server is down. Some visitors may still get through, which is why you may still see people online.", site.Domain, at(after.DownSince), after.Error)
		c.Rows = [][2]string{{"Down since", at(after.DownSince)}, {"Failed checks in a row", fmt.Sprint(after.Failures)}, {"Last check", at(after.At)}}
		ev.Message = downMessage(site.Timezone, after)
	}
	ev.Card = &c
}
