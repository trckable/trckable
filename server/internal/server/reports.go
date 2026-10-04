package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/modules"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/reports"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Scheduled reports: a site's numbers, sent on the first morning of the week
// or the month to the people a schedule names, in their language and the
// site's own look, with a PDF if asked. Built on the weekly email's own
// numbers and clock (weekly.go); the difference is who receives it and how it
// reads. Each person gets their own message with their own link to stop it.

// reportsReady says whether reports can go out at all: they need a mail
// server, and an address and key to build each email's stop link from. A
// report without that link is never sent.
func (s *Server) reportsReady() bool {
	return alerts.Mail != nil && s.cfg.BaseURL != "" && s.box != nil
}

// monthlyDue is weeklyDue for a month: the month that just ended, from 08:00
// on the first day of the new one until it has been sent.
func monthlyDue(now time.Time, loc *time.Location, lastSent int64) (from, to time.Time, due bool) {
	t := now.In(loc)
	first := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, loc)
	if t.Before(first.Add(8*time.Hour)) || lastSent >= first.Add(8*time.Hour).Unix() {
		return time.Time{}, time.Time{}, false
	}
	return first.AddDate(0, -1, 0), first, true
}

// lastMonth is the month that just ended.
func lastMonth(now time.Time, loc *time.Location) (from, to time.Time) {
	t := now.In(loc)
	first := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, loc)
	return first.AddDate(0, -1, 0), first
}

// period is what a schedule reports on: the days, and the same length before
// them to compare with.
type period struct{ from, to, prevFrom, prevTo time.Time }

func periodOf(cadence string, from, to time.Time) period {
	if cadence == "monthly" {
		return period{from, to, from.AddDate(0, -1, 0), from}
	}
	return period{from, to, from.AddDate(0, 0, -7), from}
}

// scheduleClock reads a site's time zone and first day of the week.
func (s *Server) scheduleClock(ctx context.Context, site string, info sqlite.SiteInfo) (*time.Location, int) {
	loc, err := time.LoadLocation(info.Timezone)
	if err != nil {
		loc = time.UTC
	}
	weekStart := 1
	if c, err := s.ctl.SiteConfig(ctx, site); err == nil {
		weekStart = c.WeekStart
	}
	return loc, weekStart
}

// reportClock is the time reports are judged by; tests move it.
var reportClock = time.Now

// retryAfter keeps a report that could not be sent from being tried every ten
// minutes for a week: one try an hour.
var (
	reportTried   = map[string]time.Time{}
	reportTriedMu sync.Mutex
)

func recentlyTried(id string, now time.Time) bool {
	reportTriedMu.Lock()
	defer reportTriedMu.Unlock()
	if t, ok := reportTried[id]; ok && now.Sub(t) < time.Hour {
		return true
	}
	reportTried[id] = now
	return false
}

// checkReports sends every schedule that is due. Nothing runs while no
// schedule is set up, which is the normal case.
func (s *Server) checkReports(ctx context.Context) {
	list, err := s.ctl.LiveReportSchedules(ctx)
	if err != nil || len(list) == 0 {
		if err != nil {
			slog.Warn("report check failed", "err", err)
		}
		return
	}
	if !s.reportsReady() {
		return
	}
	q := s.api.Query()
	if q == nil {
		return
	}
	now := reportClock()
	for _, sc := range list {
		info, err := s.ctl.SiteInfo(ctx, sc.SiteID)
		if err != nil {
			continue
		}
		// SiteInfo does not carry these two: read here. A site that never sent
		// anything has nothing to report, and nor does one added after the
		// period ended.
		var created, last int64
		if err := s.ctl.DB.QueryRowContext(ctx, `SELECT created_at, last_event_at FROM sites WHERE id = ?`, sc.SiteID).Scan(&created, &last); err != nil || last == 0 {
			continue
		}
		loc, weekStart := s.scheduleClock(ctx, sc.SiteID, info)
		var from, to time.Time
		var due bool
		if sc.Cadence == "monthly" {
			from, to, due = monthlyDue(now, loc, sc.LastSent)
		} else {
			from, to, due = weeklyDue(now, loc, weekStart, sc.LastSent)
		}
		if !due || created >= to.Unix() || recentlyTried(sc.ID, now) {
			continue
		}
		sent, err := s.sendSchedule(ctx, q, sc, info, loc, periodOf(sc.Cadence, from, to), sc.Recipients)
		if sent > 0 {
			s.ctl.MarkReportSent(ctx, sc.ID, now.Unix())
			slog.Info("report sent", "site", sc.SiteID, "cadence", sc.Cadence, "recipients", sent)
		}
		if err != nil {
			slog.Warn("report not delivered to everyone", "site", sc.SiteID, "err", err)
		}
	}
}

// sendSchedule builds one schedule's report and sends it to each address on
// its own. It returns how many it reached, and the first failure.
func (s *Server) sendSchedule(ctx context.Context, q *query.Q, sc sqlite.ReportSchedule, info sqlite.SiteInfo, loc *time.Location, p period, to []string) (int, error) {
	d, err := s.reportData(ctx, q, sc, info, loc, p)
	if err != nil {
		return 0, err
	}
	pdf := []alerts.Attachment{}
	if sc.PDF {
		pdf = append(pdf, alerts.Attachment{Name: pdfName(info, p), Type: "application/pdf", Data: reports.PDF(d)})
	}
	sent := 0
	var first error
	for _, addr := range to {
		d.Unsubscribe = s.reportStopLink(sc.ID, addr)
		if err := alerts.SendReport(ctx, addr, s.reportEmail(d, pdf)); err != nil {
			if first == nil {
				first = err
			}
			continue
		}
		sent++
	}
	return sent, first
}

// reportEmail dresses a report as the email one person gets.
func (s *Server) reportEmail(d reports.Data, files []alerts.Attachment) alerts.Report {
	atts := append([]alerts.Attachment{}, files...)
	if len(d.Brand.Logo) > 0 {
		atts = append([]alerts.Attachment{{Name: "logo", Type: d.Brand.LogoType, Data: d.Brand.Logo, Inline: reports.LogoCID}}, atts...)
	}
	from := "trckable"
	if d.Brand.HideBrand {
		from = d.Brand.Name
	}
	return alerts.Report{FromName: from, Subject: d.Subject(), Text: reports.Text(d), HTML: reports.HTML(d), Unsubscribe: d.Unsubscribe, Attachments: atts, At: time.Now()}
}

// pdfName is the file's name: the site and the day the period began.
func pdfName(info sqlite.SiteInfo, p period) string {
	clean := strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '.' || r == '-' {
			return r
		}
		return '-'
	}, info.Domain)
	return fmt.Sprintf("%s-%s.pdf", clean, p.from.Format("2006-01-02"))
}

// reportStopLink is the address that removes one address from one schedule,
// opened without signing in.
func (s *Server) reportStopLink(id, email string) string {
	if s.cfg.BaseURL == "" || s.box == nil {
		return ""
	}
	return strings.TrimSuffix(s.cfg.BaseURL, "/") + "/r/" + alerts.ReportToken(s.box.Derive(alerts.ReportKeyLabel), id, email)
}

// reportData reads the numbers of a period and the one before it, and the
// look the site's share links wear.
func (s *Server) reportData(ctx context.Context, q *query.Q, sc sqlite.ReportSchedule, info sqlite.SiteInfo, loc *time.Location, p period) (reports.Data, error) {
	set, _ := modules.Store{DB: s.ctl.DB}.Of(ctx, sc.SiteID)
	params := query.Params{Site: sc.SiteID, From: p.from.UTC(), To: p.to.UTC(), TZ: loc.String(), Bucket: "day", Limit: 10,
		Currency: info.Currency, Revenue: set.Has("revenue"), Goals: set.Has("goals")}
	cur, err := q.Report(ctx, params)
	if err != nil {
		return reports.Data{}, err
	}
	params.From, params.To = p.prevFrom.UTC(), p.prevTo.UTC()
	prev, err := q.Report(ctx, params)
	if err != nil {
		return reports.Data{}, err
	}
	name := info.Name
	if name == "" {
		name = info.Domain
	}
	d := reports.Data{Site: name, Client: sc.Name, Cadence: sc.Cadence, Lang: sc.Lang, From: p.from, To: p.to, Cur: cur, Prev: prev,
		Brand: s.reportBrand(ctx, sc.SiteID, name)}
	return d, nil
}

// reportBrand is the look of a site's share links, as far as a report can
// wear it: an SVG logo is left out (mail clients and PDF do not draw it).
func (s *Server) reportBrand(ctx context.Context, site, name string) reports.Brand {
	look := s.ctl.ShareLookOf(ctx, site)
	b := reports.Brand{Name: name, Color: look.Color, HideBrand: look.HideBrand}
	if b.Color == "" {
		b.Color = s.ctl.ShareBrand(ctx, site).Color
	}
	if typ, data, err := s.ctl.ShareLogo(ctx, site); err == nil && typ != "image/svg+xml" {
		b.Logo, b.LogoType = data, typ
	}
	return b
}

// sendReportNow sends the last complete period of a schedule to one address,
// for the person who asked. Nothing is marked as sent.
func (s *Server) sendReportNow(ctx context.Context, sc sqlite.ReportSchedule, email string) error {
	if !s.reportsReady() {
		return errors.New("reports need email set up on this server")
	}
	q := s.api.Query()
	if q == nil {
		return errors.New("the report is not ready yet: try again in a moment")
	}
	info, err := s.ctl.SiteInfo(ctx, sc.SiteID)
	if err != nil {
		return err
	}
	loc, weekStart := s.scheduleClock(ctx, sc.SiteID, info)
	var from, to time.Time
	if sc.Cadence == "monthly" {
		from, to = lastMonth(time.Now(), loc)
	} else {
		from, to = lastWeek(time.Now(), loc, weekStart)
	}
	n, err := s.sendSchedule(ctx, q, sc, info, loc, periodOf(sc.Cadence, from, to), []string{email})
	if n == 0 && err == nil {
		err = errors.New("the report could not be made")
	}
	return err
}
