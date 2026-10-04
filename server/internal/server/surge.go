package server

import (
	"context"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/surge"
)

// A site far busier than usual (internal/surge) is looked for on every round
// of the alerts loop, for the sites that had a visit in the last ten minutes
// (an open dashboard asks for itself, once a minute), and told to the site's
// "surge" alert when it begins: one message at most every three hours.

// checkSurges looks at each site that had a visit lately. A site's first look
// after a start is a few queries; after that, one every ten minutes.
func (s *Server) checkSurges(ctx context.Context) {
	sites, err := s.ctl.AllSites(ctx)
	if err != nil {
		slog.Warn("surge check failed", "err", err)
		return
	}
	recent := time.Now().Add(-10 * time.Minute).Unix()
	for _, site := range sites {
		if ctx.Err() != nil {
			return
		}
		if site.LastEventAt < recent {
			continue
		}
		s.api.CheckSurge(ctx, site.ID)
	}
}

// tellSurge sends a surge that just began to the site's surge alerts, with
// the dashboard's link filtered to the source when the server has an address.
func (s *Server) tellSurge(sg surge.Surge) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	list, err := s.ctl.LiveAlerts(ctx)
	if err != nil {
		return
	}
	info, err := s.ctl.SiteInfo(ctx, sg.Site)
	if err != nil {
		return
	}
	now := time.Now()
	for _, a := range list {
		if !surgeDue(a, sg.Site, now) {
			continue
		}
		ev := surgeEvent(sg, info.Domain, s.surgeLink(info.Domain, sg), now)
		ev.Site = sg.Site
		ev.Unsubscribe = s.stopLink(a.ID)
		if err := alerts.Send(ctx, a.Target, ev); err != nil {
			slog.Warn("alert not delivered", "kind", a.Kind, "err", err)
			continue
		}
		s.ctl.MarkFired(ctx, a.ID, now.Unix())
		slog.Info("alert sent", "kind", a.Kind, "site", sg.Site)
	}
}

// surgeDue says whether this alert is the site's surge alert and has not
// spoken within the cooldown: one message at most every three hours.
func surgeDue(a sqlite.Alert, site string, now time.Time) bool {
	return a.SiteID == site && a.Kind == "surge" && a.Enabled && now.Unix()-a.LastFired >= int64(surge.Cooldown.Seconds())
}

// surgeEvent words one surge for a webhook or an email.
func surgeEvent(sg surge.Surge, domain, link string, now time.Time) alerts.Event {
	ev := alerts.Event{Kind: "surge", Domain: domain, At: now, Title: surge.Subject, Message: surge.Body(sg, domain, link)}
	ev.Data = map[string]any{"online": sg.Online, "usual": sg.Usual, "source": sg.Why.Source, "page": sg.Why.Page}
	return ev
}

// surgeLink is the dashboard on Live, filtered to the source when there is
// one; empty without a public address.
func (s *Server) surgeLink(domain string, sg surge.Surge) string {
	if s.cfg.BaseURL == "" {
		return ""
	}
	link := strings.TrimSuffix(s.cfg.BaseURL, "/") + "/" + domain
	if sg.Why.SourceDim != "" {
		link += "?" + url.Values{"f": {sg.Why.SourceDim + ":" + sg.Why.SourceValue}}.Encode()
	}
	return link
}
