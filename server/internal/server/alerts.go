package server

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/api"
	"github.com/trckable/trckable/server/internal/ledger"
	"github.com/trckable/trckable/server/internal/moments"
	"github.com/trckable/trckable/server/internal/payments"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// alertQuiet is how long an alert stays silent after firing. Being told twice
// that tracking stopped is worse than being told once.
const alertQuiet = 6 * time.Hour

// stoppedAgain is how long a site must stay silent before its "stopped"
// alert speaks a second and last time.
const stoppedAgain = 3 * 24 * time.Hour

// stoppedDue says whether the "stopped receiving visits" alert should be sent
// for a site whose last visit was at `last` (unix seconds), given when the
// alert last fired. It is sent once when the site goes quiet, once more after
// three more days of quiet, then not again: a visit moves `last` past
// lastFired and the cycle starts over.
func stoppedDue(last, lastFired int64, hours float64, now time.Time) bool {
	quiet := now.Unix() - last
	if last == 0 || quiet < int64(hours*3600) {
		return false
	}
	if lastFired <= last {
		return true // quiet, and not told yet
	}
	second := int64(hours*3600) + int64(stoppedAgain.Seconds())
	// Told once already: the second time is three days into the silence, and
	// a fire at or past that mark was the second.
	return quiet >= second && lastFired-last < second
}

// heldAlerts remembers the alerts whose "sent" mark could not be saved, until the
// quiet window is over, so a failing database never turns into a mail every
// ten minutes.
type heldAlerts struct {
	mu sync.Mutex
	at map[string]time.Time
}

func (h *heldAlerts) holding(id string, now time.Time) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	t, ok := h.at[id]
	if ok && now.Sub(t) >= alertQuiet {
		delete(h.at, id)
		return false
	}
	return ok
}

func (h *heldAlerts) hold(id string, now time.Time) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.at == nil {
		h.at = map[string]time.Time{}
	}
	h.at[id] = now
}

// runAlerts checks the four conditions every ten minutes. Nothing runs while
// no alert is configured, which is the normal case. Each site's milestones
// are checked here too, once its day is over (milestones.go), and once
// shortly after a start.
func (s *Server) runAlerts(ctx context.Context) {
	t := time.NewTicker(10 * time.Minute)
	defer t.Stop()
	soon := time.After(time.Minute)
	for {
		select {
		case <-ctx.Done():
			return
		case <-soon:
			s.checkIncidents(ctx)
			s.checkMilestones(ctx)
			continue
		case <-t.C:
		}
		// The alerts that matter most (stopped, disk) go first, so the per-site
		// work after them can never delay them.
		if err := s.checkAlerts(ctx); err != nil && ctx.Err() == nil {
			slog.Warn("alert check failed", "err", err)
		}
		s.checkIncidents(ctx)
		s.checkMilestones(ctx)
		s.checkSurges(ctx)
		s.checkReports(ctx)
	}
}

func (s *Server) checkAlerts(ctx context.Context) error {
	list, err := s.ctl.LiveAlerts(ctx)
	if err != nil || len(list) == 0 {
		return err
	}
	now := time.Now()
	health := s.health(ctx)
	for _, a := range list {
		if now.Unix()-a.LastFired < int64(alertQuiet.Seconds()) || s.held.holding(a.ID, now) {
			continue
		}
		ev, fire := s.evaluate(ctx, a, health, now)
		if !fire {
			continue
		}
		ev.Unsubscribe = s.stopLink(a.ID)
		ev.Settings = s.settingsLink(a.SiteID)
		if err := alerts.Send(ctx, a.Target, ev); err != nil {
			slog.Warn("alert not delivered", "kind", a.Kind, "err", err)
			continue
		}
		if err := s.ctl.MarkFired(ctx, a.ID, now.Unix()); err != nil {
			slog.Warn("alert sent but not marked", "kind", a.Kind, "site", a.SiteID, "err", err)
			s.held.hold(a.ID, now)
		}
		slog.Info("alert sent", "kind", a.Kind, "site", a.SiteID)
	}
	return nil
}

// stopLink is the address an email gives for stopping one alert: it works
// without signing in. Without a public address there is none to give.
func (s *Server) stopLink(alertID string) string {
	if s.cfg.BaseURL == "" || s.box == nil {
		return ""
	}
	return strings.TrimSuffix(s.cfg.BaseURL, "/") + "/u/" + alerts.UnsubscribeToken(s.box.Derive(alerts.KeyLabel), alertID)
}

// settingsLink is where an email sends the person to change a site's alerts
// (the dashboard opens the dialog from it); empty without a public address.
func (s *Server) settingsLink(site string) string {
	if s.cfg.BaseURL == "" {
		return ""
	}
	return strings.TrimSuffix(s.cfg.BaseURL, "/") + "/settings?" + url.Values{"site": {site}, "tab": {"alerts"}}.Encode()
}

// evaluate decides whether one alert should fire right now.
func (s *Server) evaluate(ctx context.Context, a sqlite.Alert, h api.Health, now time.Time) (alerts.Event, bool) {
	info, err := s.ctl.SiteInfo(ctx, a.SiteID)
	if err != nil {
		return alerts.Event{}, false
	}
	ev := alerts.Event{Kind: a.Kind, Site: a.SiteID, Domain: info.Domain, At: now}
	switch a.Kind {
	case "stopped":
		// Silence only matters for a site that was speaking: a site with no
		// events at all has nothing to stop.
		hours := a.Threshold
		if hours <= 0 {
			hours = 6
		}
		var last int64
		if err := s.ctl.DB.QueryRowContext(ctx, `SELECT last_event_at FROM sites WHERE id = ?`, a.SiteID).Scan(&last); err != nil {
			if !errors.Is(err, sql.ErrNoRows) {
				slog.Warn("alert check failed", "kind", a.Kind, "err", err)
			}
			return ev, false
		}
		if !stoppedDue(last, a.LastFired, hours, now) {
			return ev, false
		}
		c, _ := s.ctl.CheckOf(ctx, a.SiteID)
		s.stoppedWords(&ev, info, last, c, now)
		ev.Data = map[string]any{"last_event_at": last}
		return ev, true

	case "disk":
		free, days := h.Store.BytesFree, h.Store.DaysLeft
		limit := a.Threshold
		if limit <= 0 {
			limit = 14 // days
		}
		if days <= 0 || days > limit {
			return ev, false
		}
		ev.Title = "The disk is filling up"
		ev.Message = fmt.Sprintf("About %.0f days of room left at the current rate (%.1f GB free).", days, float64(free)/(1<<30))
		ev.Data = map[string]any{"days_left": days, "bytes_free": free}
		return ev, true

	case "weekly":
		return s.weekly(ctx, a.SiteID, a.LastFired, now, ev)
	}
	// spike and customer need the analytics store; they are checked there.
	return s.evaluateReport(ctx, a, ev, now)
}

// evaluateReport handles the two alerts that need the analytics store: a day
// far above the usual, and a customer who just paid.
func (s *Server) evaluateReport(ctx context.Context, a sqlite.Alert, ev alerts.Event, now time.Time) (alerts.Event, bool) {
	st := s.duck.Load()
	if st == nil {
		return ev, false
	}
	info, err := s.ctl.SiteInfo(ctx, a.SiteID)
	if err != nil {
		return ev, false
	}
	loc, err := time.LoadLocation(info.Timezone)
	if err != nil {
		loc = time.UTC
	}
	today := now.In(loc).Format("2006-01-02")

	switch a.Kind {
	case "spike":
		// Today against the median of the seven days before it, so one good
		// Tuesday does not raise the bar for the rest of the week.
		var todayN, median float64
		var before int
		err := st.DB.QueryRowContext(ctx, `
			WITH d AS (
				SELECT strftime(timezone(?, ts), '%Y-%m-%d') AS day, count(DISTINCT visitor_id) AS visitors
				FROM events WHERE site_id = ? AND kind = 1 AND ts >= now() - INTERVAL 8 DAY
				GROUP BY 1
			)
			SELECT coalesce(max(CASE WHEN day = ? THEN visitors END), 0),
			       coalesce(median(CASE WHEN day <> ? THEN visitors END), 0),
			       count(CASE WHEN day <> ? THEN 1 END)
			FROM d`, info.Timezone, a.SiteID, today, today, today).Scan(&todayN, &median, &before)
		if err != nil {
			return ev, false
		}
		times := a.Threshold
		if times <= 0 {
			times = 3
		}
		if median <= 0 || todayN < 50 || todayN < median*times {
			return ev, false
		}
		ev.Title, ev.Message = busyDay(info.Domain, todayN, median, before)
		ev.Data = map[string]any{"visitors": todayN, "usual": median}
		return ev, true

	case "customer":
		// Someone paid since the last time this alert fired.
		since := a.LastFired
		if since == 0 {
			since = now.Add(-alertQuiet).Unix()
		}
		n, amount := paidSince(ctx, s.ctl.DB, a.SiteID, info.Currency, since)
		if n == 0 {
			return ev, false
		}
		ev.Title = "You got paid"
		if n == 1 {
			ev.Message = fmt.Sprintf("A new payment came in on %s.", info.Domain)
		} else {
			ev.Message = fmt.Sprintf("%d payments came in on %s.", n, info.Domain)
		}
		ev.Data = map[string]any{"payments": n, "amount_minor": amount, "currency": info.Currency}
		return ev, true
	}
	return ev, false
}

// busyDay words the busy-day alert. Against a usual under ten visitors a day,
// or a site with fewer than a week of days behind it, a multiplier says
// nothing ("230×" of one visitor), so it is new traffic: the count alone.
func busyDay(domain string, today, usual float64, days int) (title, message string) {
	if usual < moments.MinUsual || days < moments.MinHistory {
		return "New traffic", fmt.Sprintf("%s has %.0f visitors today, more than it usually gets.", domain, today)
	}
	return "Busy day", fmt.Sprintf("%s has %.0f visitors today — about %s a normal day.", domain, today, moments.Times(today/usual))
}

// paidSince counts a site's real payments after `since` (unix seconds;
// paid_at is unix milliseconds) and sums, net of tax, those paid in the
// site's own currency, in ISO minor units. Other currencies are counted but
// not added: adding yen to dollars would be a wrong number.
func paidSince(ctx context.Context, db *sql.DB, site, currency string, since int64) (n int, amount int64) {
	rows, err := db.QueryContext(ctx, `SELECT provider, currency, gross - coalesce(tax, 0) FROM pay_payments
		WHERE site_id = ? AND paid_at > ? AND test = 0`, site, since*1000)
	if err != nil {
		return 0, 0
	}
	defer rows.Close()
	for rows.Next() {
		var prov, cur string
		var net int64
		if rows.Scan(&prov, &cur, &net) != nil {
			continue
		}
		n++
		if strings.EqualFold(cur, currency) {
			amount += ledger.RoundDiv(max(net, 0), payments.AmountScale(prov, cur))
		}
	}
	return n, amount
}
