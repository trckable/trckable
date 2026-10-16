package server

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/milestones"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// siteWork bounds one site's share of the alerts loop (a milestone check, a
// report, a surge look), so one slow site cannot hold up the rest.
const siteWork = 30 * time.Second

// checkMilestones runs each site's milestone check once its day is over
// (internal/milestones), from the alerts loop: no ticker of its own. A site
// already checked for yesterday costs one comparison. What is new goes to
// the site's "milestone" alert, if it has one: off unless set.
func (s *Server) checkMilestones(ctx context.Context) {
	st, w := s.duck.Load(), s.writer.Load()
	if st == nil || w == nil || !w.Ready() {
		return
	}
	q := query.Q{DB: st.DB, Open: w.OpenSessions, Payments: s.payments}
	sites, err := s.ctl.MilestoneSites(ctx)
	if err != nil {
		slog.Warn("milestones check failed", "err", err)
		return
	}
	now := time.Now()
	var live []sqlite.Alert
	for _, site := range sites {
		if ctx.Err() != nil {
			return
		}
		siteCtx, cancel := context.WithTimeout(ctx, siteWork)
		fresh, err := milestones.Check(siteCtx, q, s.ctl, site, now)
		cancel()
		if err != nil {
			slog.Warn("milestones check failed", "site", site.ID, "err", err)
			continue
		}
		if len(fresh) == 0 {
			continue
		}
		if live == nil {
			if live, err = s.ctl.LiveAlerts(ctx); err != nil {
				continue
			}
		}
		s.tellMilestones(ctx, site.ID, fresh, live, now)
	}
}

// tellMilestones sends what a site just reached to its milestone alert. A
// money milestone says no amount: an alert can go to a shared channel.
func (s *Server) tellMilestones(ctx context.Context, site string, fresh []sqlite.Milestone, live []sqlite.Alert, now time.Time) {
	info, err := s.ctl.SiteInfo(ctx, site)
	if err != nil {
		return
	}
	list, err := s.ctl.Milestones(ctx, site, "")
	if err != nil {
		list = nil
	}
	for _, a := range live {
		if a.SiteID != site || a.Kind != "milestone" {
			continue
		}
		for _, m := range fresh {
			title, msg := milestones.AlertLine(milestones.Say(m, false), info.Domain)
			ev := alerts.Event{Kind: "milestone", Site: site, Domain: info.Domain, At: now, Title: title, Message: msg,
				Data: map[string]any{"milestone": m.Kind, "step": m.Step, "reached_on": m.Day}}
			headline, mail := milestones.Email(m, list, info.Domain, s.cfg.BaseURL)
			ev.Email, ev.Subject = mail, strings.TrimSuffix(headline, " 🎉")
			ev.Unsubscribe = s.stopLink(a.ID)
			ev.Settings = s.settingsLink(site)
			if err := alerts.Send(ctx, a.Target, ev); err != nil {
				slog.Warn("alert not delivered", "kind", a.Kind, "err", err)
				continue
			}
			if err := s.ctl.MarkFired(ctx, a.ID, now.Unix()); err != nil {
				slog.Warn("alert sent but not marked", "kind", a.Kind, "site", site, "err", err)
			}
		}
	}
}
