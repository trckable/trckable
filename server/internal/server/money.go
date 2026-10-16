package server

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/mailkit"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/realtime"
	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/surge"
)

// Money coming in is told the moment the ledger has it (revenue.OnNotice): to
// the dashboards that are open, as the line they show, and by message to the
// site's money alert ("Money in" in Settings → Alerts). A new customer, an
// upgrade and a refund each get a message; renewals and one-time sales are in
// the weekly report, not in the inbox.

// moneyMailPerHour bounds the messages one site's money alert sends in an
// hour: a reconciliation that finds a burst of late payments is a few
// messages, never a flood.
const moneyMailPerHour = 12

// mailed counts the money messages sent per site in the last hour.
type mailed struct {
	mu sync.Mutex
	at map[string][]time.Time
}

func (m *mailed) allow(site string, now time.Time) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.at == nil {
		m.at = map[string][]time.Time{}
	}
	keep := m.at[site][:0]
	for _, t := range m.at[site] {
		if now.Sub(t) < time.Hour {
			keep = append(keep, t)
		}
	}
	if len(keep) >= moneyMailPerHour {
		m.at[site] = keep
		return false
	}
	m.at[site] = append(keep, now)
	return true
}

// tellMoney is what a notice does: the stream first, then the messages.
func (s *Server) tellMoney(site string, n revenue.Notice) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		source := s.sourceOf(ctx, site, n)
		s.hub.PublishSale(site, realtime.Sale{TS: n.At, Amount: n.Amount, Currency: n.Currency, Exponent: n.Exponent, Change: n.Kind, Text: n.Words(source), Late: n.Late})
		s.mailMoney(ctx, site, n, source)
	}()
}

// sourceOf is who sent a new customer or a sale, as people say it
// ("Google"), and empty when the buyer is not known or came direct.
func (s *Server) sourceOf(ctx context.Context, site string, n revenue.Notice) string {
	if n.Visitor == 0 || (n.Kind != revenue.NoticeNew && n.Kind != revenue.NoticeSale) {
		return ""
	}
	st, w := s.duck.Load(), s.writer.Load()
	if st == nil || w == nil || !w.Ready() {
		return ""
	}
	q := query.Q{DB: st.DB, Open: w.OpenSessions, Payments: s.payments}
	ref, channel, err := q.VisitorSource(ctx, site, n.Visitor, time.UnixMilli(n.At))
	if err != nil {
		return ""
	}
	if ref != "" {
		return surge.Name(ref)
	}
	if channel == "Direct" {
		return ""
	}
	return channel
}

func (s *Server) mailMoney(ctx context.Context, site string, n revenue.Notice, source string) {
	if n.Kind != revenue.NoticeNew && n.Kind != revenue.NoticeUpgrade && n.Kind != revenue.NoticeRefund {
		return
	}
	list, err := s.ctl.LiveAlerts(ctx)
	if err != nil {
		return
	}
	info, err := s.ctl.SiteInfo(ctx, site)
	if err != nil {
		return
	}
	loc, err := time.LoadLocation(info.Timezone)
	if err != nil {
		loc = time.UTC
	}
	for _, a := range list {
		if a.SiteID != site || a.Kind != "customer" {
			continue
		}
		if !s.mailedMoney.allow(site, time.Now()) {
			slog.Warn("money message held back: too many in an hour", "site", site)
			return
		}
		ev := moneyEvent(n, info.Domain, source, s.siteLink(info.Domain), loc)
		ev.Site = site
		ev.Unsubscribe = s.stopLink(a.ID)
		ev.Settings = s.settingsLink(site)
		if err := alerts.Send(ctx, a.Target, ev); err != nil {
			slog.Warn("alert not delivered", "kind", a.Kind, "err", err)
			continue
		}
		slog.Info("alert sent", "kind", a.Kind, "site", site)
	}
}

// siteLink opens the site's dashboard; empty without a public address.
func (s *Server) siteLink(domain string) string {
	if s.cfg.BaseURL == "" {
		return ""
	}
	return strings.TrimSuffix(s.cfg.BaseURL, "/") + "/" + domain
}

// Words of the money email.
const (
	moneyNote   = "You get this when money comes in: a new customer, an upgrade or a refund."
	moneyOpen   = "Open %s"
	moneyPaid   = "Paid"
	moneyRefund = "Refunded"
	moneyPlans  = "Plan"
	moneyVia    = "Came from"
)

// moneyEvent words one notice for a message: the same line the dashboard
// shows, then the email, a money top with the few facts under it.
func moneyEvent(n revenue.Notice, domain, source, link string, loc *time.Location) alerts.Event {
	words := n.Words(source)
	at := time.UnixMilli(n.At).In(loc)
	ev := alerts.Event{Kind: "customer", Domain: domain, At: at, Title: words, Message: words + " on " + domain, Subject: words + " · " + domain,
		Data: map[string]any{"kind": n.Kind, "amount_minor": n.Amount, "currency": n.Currency, "paid_at": at.Format(time.RFC3339), "late": n.Late}}
	label, tone := moneyLabel(n.Kind)
	amount := revenue.Money(n.Amount, n.Currency, n.Exponent)
	big := amount
	switch n.Kind {
	case revenue.NoticeUpgrade:
		big = "+" + amount
	case revenue.NoticeRefund:
		big = "−" + amount
	}
	var rows [][2]string
	if n.Kind == revenue.NoticeUpgrade && n.To != "" {
		plan := n.To
		if n.From != "" {
			plan = n.From + " → " + n.To
		}
		rows = append(rows, [2]string{moneyPlans, plan})
	}
	if source != "" && (n.Kind == revenue.NoticeNew || n.Kind == revenue.NoticeSale) {
		rows = append(rows, [2]string{moneyVia, source})
	}
	when := moneyPaid
	if n.Kind == revenue.NoticeRefund {
		when = moneyRefund
	}
	rows = append(rows, [2]string{when, moneyTime(at, time.Now().In(loc), n.Late)})
	ev.Email = &mailkit.Email{
		Preheader: words,
		Blocks: []mailkit.Block{
			mailkit.Heading{Title: domain},
			mailkit.Hero{Tone: tone, Eyebrow: label, Big: big},
			mailkit.Rows{Rows: rows},
			mailkit.Button{Label: fmt.Sprintf(moneyOpen, domain), URL: link},
		},
		Foot: mailkit.Foot{Note: moneyNote},
	}
	return ev
}

func moneyLabel(kind string) (string, mailkit.Tone) {
	switch kind {
	case revenue.NoticeNew:
		return "New customer", mailkit.Good
	case revenue.NoticeUpgrade:
		return "Upgrade", mailkit.Good
	case revenue.NoticeRefund:
		return "Refund", mailkit.Warn
	case revenue.NoticeRenewal:
		return "Renewal", mailkit.Neutral
	}
	return "Sale", mailkit.Good
}

// moneyTime is when it happened: "just now" for a fresh one, the real time
// for one found late ("14:05", with the day when it is not today).
func moneyTime(at, now time.Time, late bool) string {
	if !late {
		return "just now"
	}
	if at.Format(time.DateOnly) == now.Format(time.DateOnly) {
		return at.Format("15:04")
	}
	return at.Format("2 Jan, 15:04")
}
