package server

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/mailkit"
)

// setupWait is how long a site may have no visit before its owners get the one
// reminder; the dashboard's bell says the same after the same wait.
const setupWait = 3 * 24 * time.Hour

// checkSetupMail sends, once, to the owners of a site that has had no visit
// three days after it was added: the line to install, and where to look. It
// runs with the alert checks, and does nothing without an outgoing mail server
// or a public address (the install line points at this server).
func (s *Server) checkSetupMail(ctx context.Context) {
	base := strings.TrimSuffix(s.cfg.BaseURL, "/")
	if alerts.Mail == nil || base == "" {
		return
	}
	now := time.Now()
	due, err := s.ctl.SetupMailDue(ctx, now, setupWait)
	if err != nil {
		slog.Warn("setup reminder check failed", "err", err)
		return
	}
	for _, d := range due {
		if ctx.Err() != nil {
			return
		}
		ev := setupMailEvent(d.Site, d.Domain, base, now)
		sent := len(d.Owners) == 0
		for _, to := range d.Owners {
			if err := alerts.Send(ctx, "mailto:"+to, ev); err != nil {
				slog.Warn("setup reminder not delivered", "site", d.Site, "err", err)
				continue
			}
			sent = true
		}
		if !sent {
			continue // tried again at the next check
		}
		if err := s.ctl.MarkSetupMailed(ctx, d.Site, now.Unix()); err != nil {
			slog.Warn("setup reminder sent but not marked", "site", d.Site, "err", err)
		}
	}
}

// installLine is the script tag on one line, as the Add a site step gives it.
func installLine(base, site, domain string) string {
	return fmt.Sprintf(`<script defer data-site="%s" data-domain="%s" src="%s/js/%s.js"></script>`, site, domain, base, site)
}

func setupMailEvent(site, domain, base string, now time.Time) alerts.Event {
	line := installLine(base, site, domain)
	msg := domain + " has not sent a visit yet. Add this line to the <head> of every page: " + line
	return alerts.Event{
		Kind: "setup", Site: site, Domain: domain, At: now,
		Title: "Finish installing " + domain, Message: msg, Subject: "Finish installing trckable on " + domain,
		Email: &mailkit.Email{
			Preheader: domain + " has not sent a visit yet.",
			Blocks: []mailkit.Block{
				mailkit.Heading{Eyebrow: "Not installed yet", Title: domain},
				mailkit.Callout{Tone: mailkit.Bad, Title: "No visit yet", Text: domain + " was added three days ago and no visit has reached trckable."},
				mailkit.Paragraph{Lead: "The install line", Text: "Add this to the <head> of every page, or paste it where your site keeps its header code:"},
				mailkit.Paragraph{Text: line},
				mailkit.Paragraph{Text: "If it is there already, open the site in trckable: the setup card checks the page and says what it finds.", Muted: true},
				mailkit.Button{Label: "Open the setup", URL: base + "/" + domain},
			},
			Foot: mailkit.Foot{Note: "You get this once, when a site has no visit three days after it was added."},
		},
	}
}
