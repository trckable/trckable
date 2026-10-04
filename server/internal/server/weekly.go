package server

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/modules"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/reports"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/surge"
)

// The weekly report: last week's numbers, delivered on the first morning of the site's week to the
// same place as the site's other alerts. One short message a week is the
// digest people actually read; a daily one becomes noise by Thursday.

// weeklyDue says which week the report covers (the week that just ended, in
// the site's own timezone, starting on the site's first day of the week:
// 1 Monday, 0 Sunday) and whether it should go now: from 08:00 on that first
// day until it has been sent that week. A server that was down that morning
// sends it when it is back, the same week.
func weeklyDue(now time.Time, loc *time.Location, weekStart int, lastFired int64) (from, to time.Time, due bool) {
	t := now.In(loc)
	day := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
	back := (int(day.Weekday()) + 6) % 7
	if weekStart == 0 {
		back = int(day.Weekday())
	}
	first := day.AddDate(0, 0, -back)
	sendAt := first.Add(8 * time.Hour)
	if t.Before(sendAt) || lastFired >= sendAt.Unix() {
		return time.Time{}, time.Time{}, false
	}
	return first.AddDate(0, 0, -7), first, true
}

// hadAWeek says whether a site has a week to report: it sent something at
// some point, and it existed before that week ended. A report on a site that
// never sent anything would only say "nothing arrived" every Monday, which the
// dashboard and "tracking stopped" already say better.
func hadAWeek(createdAt, lastEventAt int64, weekEnd time.Time) bool {
	return lastEventAt > 0 && createdAt < weekEnd.Unix()
}

var channelNames = map[string]string{"AI": "AI assistants"}

func change(cur, prev float64) string {
	if prev <= 0 {
		if cur > 0 {
			return "new this week"
		}
		return "no change"
	}
	d := (cur - prev) / prev * 100
	if math.Abs(d) < 0.5 {
		return "about the same as the week before"
	}
	dir := "up"
	if d < 0 {
		dir = "down"
	}
	return fmt.Sprintf("%s %.0f%% on the week before", dir, math.Abs(d))
}

func number(n int64) string {
	s := fmt.Sprint(n)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}

// amount writes minor units as whole currency, the way a summary reads.
func amount(minor int64, cur string, exp int) string {
	whole := int64(math.Round(float64(minor) / math.Pow10(exp)))
	sym := map[string]string{"USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥"}[cur]
	if sym == "" {
		return number(whole) + " " + cur
	}
	return sym + number(whole)
}

// aiWeek is what AI did in the week: the visitors its assistants sent, and the
// hits its crawlers made (answering and training; zero with the crawlers module off).
type aiWeek struct{ Visitors, Crawls int64 }

// aiLine is the report's one line about AI, or none when it was quiet.
func aiLine(a aiWeek) string {
	plural := func(n int64, one, many string) string {
		if n == 1 {
			return number(n) + " " + one
		}
		return number(n) + " " + many
	}
	switch {
	case a.Visitors > 0 && a.Crawls > 0:
		return fmt.Sprintf("AI assistants sent %s; crawlers read %s.", plural(a.Visitors, "visitor", "visitors"), plural(a.Crawls, "page", "pages"))
	case a.Visitors > 0:
		return fmt.Sprintf("AI assistants sent %s.", plural(a.Visitors, "visitor", "visitors"))
	case a.Crawls > 0:
		return fmt.Sprintf("AI crawlers read %s.", plural(a.Crawls, "page", "pages"))
	}
	return ""
}

// goalLine is the report's line about its top goal, or none.
func goalLine(cur *query.Result) string {
	if len(cur.Goals) == 0 {
		return ""
	}
	g := cur.Goals[0]
	return fmt.Sprintf("Top goal: %s, %s visitors", g.Value, number(g.Visitors))
}

// revenueLine is the report's line about money, or none without payments.
func revenueLine(cur, prev *query.Result) string {
	m := cur.Money
	if m == nil || m.Payments == 0 {
		return ""
	}
	line := fmt.Sprintf("Revenue: %s from %s payment", amount(m.Revenue, m.Currency, m.Exponent), number(m.Payments))
	if m.Payments != 1 {
		line += "s"
	}
	if prev.Money != nil {
		line += ", " + change(float64(m.Revenue), float64(prev.Money.Revenue))
	}
	return line
}

// weeklyHTML is the report as a designed email: the same numbers and
// sentences as weeklyText, laid out by package reports. It returns the page
// as a function of the stop link, which is known only when it is sent.
func weeklyHTML(domain string, from, to time.Time, cur, prev *query.Result, ai aiWeek, busiest, link string) func(string) string {
	var x reports.Weekly
	x.Link = link
	if cur.KPIs.Visitors > 0 {
		for _, line := range []string{aiLine(ai), revenueLine(cur, prev), goalLine(cur)} {
			if line != "" {
				x.Facts = append(x.Facts, line)
			}
		}
		if busiest != "" {
			x.Moments = append(x.Moments, busiest)
		}
		x.Moments = append(x.Moments, weeklyInsights(cur, prev)...)
	}
	d := reports.Data{Site: domain, Cadence: "weekly", Lang: "en", From: from, To: to, Cur: cur, Prev: prev}
	return func(stop string) string {
		d.Unsubscribe = stop
		return reports.WeeklyHTML(d, x)
	}
}

// weeklyText words the report. It is plain text on purpose: every chat tool
// and every mail client shows it the same.
func weeklyText(domain string, from, to time.Time, cur, prev *query.Result, ai aiWeek, busiest, link string) (title, msg string, data map[string]any) {
	last := to.AddDate(0, 0, -1)
	title = "Your week"
	lines := []string{fmt.Sprintf("%s, %s – %s", domain, from.Format("Jan 2"), last.Format("Jan 2"))}
	k := cur.KPIs
	lines = append(lines, fmt.Sprintf("%s visitors, %s.", number(k.Visitors), change(float64(k.Visitors), float64(prev.KPIs.Visitors))))
	if k.Visitors == 0 {
		lines = append(lines, "Nothing arrived this week. If that is unexpected, check that the script is still on the site.")
	} else {
		lines = append(lines, fmt.Sprintf("%s pageviews · bounce %.0f%% · %s a visit", number(k.Pageviews), k.BounceRate*100, (time.Duration(k.AvgSessionS)*time.Second).Round(time.Second)))
		top := func(label string, rows []query.Row, name func(string) string) {
			var parts []string
			for i, r := range rows {
				if i == 3 {
					break
				}
				parts = append(parts, fmt.Sprintf("%s %s", name(r.Value), number(r.Visitors)))
			}
			if len(parts) > 0 {
				lines = append(lines, label+": "+strings.Join(parts, " · "))
			}
		}
		top("Top sources", cur.Dims["channel"], func(v string) string {
			if n, ok := channelNames[v]; ok {
				return n
			}
			return v
		})
		top("Top pages", cur.Dims["entry_page"], func(v string) string { return v })
		if line := aiLine(ai); line != "" {
			lines = append(lines, line)
		}
		if line := goalLine(cur); line != "" {
			lines = append(lines, line)
		}
		if line := revenueLine(cur, prev); line != "" {
			lines = append(lines, line)
		}
	}
	if busiest != "" && k.Visitors > 0 {
		lines = append(lines, busiest)
	}
	if more := weeklyInsights(cur, prev); len(more) > 0 {
		lines = append(lines, "")
		lines = append(lines, more...)
	}
	if link != "" {
		lines = append(lines, "", link)
	}
	data = map[string]any{"from": from.Format("2006-01-02"), "to": last.Format("2006-01-02"), "visitors": k.Visitors, "pageviews": k.Pageviews, "previous_visitors": prev.KPIs.Visitors}
	if cur.Money != nil {
		data["revenue_minor"] = cur.Money.Revenue
		data["currency"] = cur.Money.Currency
	}
	return title, strings.Join(lines, "\n"), data
}

// weekly builds the report for one site, when it is due.
func (s *Server) weekly(ctx context.Context, siteID string, lastFired int64, now time.Time, ev alerts.Event) (alerts.Event, bool) {
	q := s.api.Query()
	if q == nil {
		return ev, false
	}
	info, err := s.ctl.SiteInfo(ctx, siteID)
	if err != nil {
		return ev, false
	}
	loc, err := time.LoadLocation(info.Timezone)
	if err != nil {
		loc = time.UTC
	}
	weekStart := 1
	if c, err := s.ctl.SiteConfig(ctx, siteID); err == nil {
		weekStart = c.WeekStart
	}
	from, to, due := weeklyDue(now, loc, weekStart, lastFired)
	if !due {
		return ev, false
	}
	if !hadAWeek(info.CreatedAt, info.LastEventAt, to) {
		return ev, false
	}
	return s.weeklyEvent(ctx, q, info, loc, from, to, ev)
}

// weeklyEvent words one week's report: the numbers, the week before for
// comparison, and a link into the dashboard when the instance has an address.
func (s *Server) weeklyEvent(ctx context.Context, q *query.Q, info sqlite.SiteInfo, loc *time.Location, from, to time.Time, ev alerts.Event) (alerts.Event, bool) {
	siteID := ev.Site
	set, _ := modules.Store{DB: s.ctl.DB}.Of(ctx, siteID)
	// More rows than the email shows: the findings compare whole breakdowns.
	p := query.Params{Site: siteID, From: from.UTC(), To: to.UTC(), TZ: loc.String(), Bucket: "day", Limit: 10,
		Currency: info.Currency, Revenue: set.Has("revenue"), Goals: set.Has("goals"), NewReferrers: 5}
	cur, err := q.Report(ctx, p)
	if err != nil {
		return ev, false
	}
	pp := p
	pp.From, pp.To = from.AddDate(0, 0, -7).UTC(), from.UTC()
	pp.NewReferrers = 0
	prev, err := q.Report(ctx, pp)
	if err != nil {
		return ev, false
	}
	ai := aiWeek{}
	for _, r := range cur.Dims["channel"] {
		if r.Value == "AI" {
			ai.Visitors = r.Visitors
		}
	}
	if set.Has("crawlers") {
		if rep, err := q.Crawlers(ctx, p); err == nil {
			ai.Crawls = rep.Kinds["answer"] + rep.Kinds["train"]
		}
	}
	link := ""
	if s.cfg.BaseURL != "" {
		// The dashboard on that week, against the one before it.
		link = fmt.Sprintf("%s/%s?from=%s&to=%s&compare=previous", strings.TrimSuffix(s.cfg.BaseURL, "/"), info.Domain, from.Format("2006-01-02"), to.AddDate(0, 0, -1).Format("2006-01-02"))
	}
	busiest := ""
	if b, err := s.ctl.BusiestSurge(ctx, siteID, from.Unix(), to.Unix()); err == nil && b != nil {
		busiest = surge.Busiest(*b, time.Unix(b.Started, 0).In(loc))
	}
	ev.Title, ev.Message, ev.Data = weeklyText(info.Domain, from, to, cur, prev, ai, busiest, link)
	ev.Text = ev.Title + " — " + ev.Message
	ev.HTML = weeklyHTML(info.Domain, from, to, cur, prev, ai, busiest, link)
	ev.Inline = []alerts.Attachment{{Name: "logo.png", Type: "image/png", Data: reports.Logo, Inline: reports.LogoCID}}
	return ev, true
}

// sendWeeklyNow sends the last complete week's report, the one Monday's email
// carries, to one address now. It is for the person who asked: nothing is
// marked as sent, so the scheduled report still goes out when it is due.
func (s *Server) sendWeeklyNow(ctx context.Context, siteID, email string) error {
	q := s.api.Query()
	if q == nil {
		return errors.New("the report is not ready yet: try again in a moment")
	}
	info, err := s.ctl.SiteInfo(ctx, siteID)
	if err != nil {
		return err
	}
	loc, err := time.LoadLocation(info.Timezone)
	if err != nil {
		loc = time.UTC
	}
	weekStart := 1
	if c, err := s.ctl.SiteConfig(ctx, siteID); err == nil {
		weekStart = c.WeekStart
	}
	now := time.Now()
	from, to := lastWeek(now, loc, weekStart)
	ev, ok := s.weeklyEvent(ctx, q, info, loc, from, to, alerts.Event{Kind: "weekly", Site: siteID, Domain: info.Domain, At: now})
	if !ok {
		return errors.New("the report could not be made")
	}
	return alerts.Send(ctx, "mailto:"+email, ev)
}

// lastWeek is the week that just ended: from the first day of the site's week
// before this one, to the first day of this one.
func lastWeek(now time.Time, loc *time.Location, weekStart int) (from, to time.Time) {
	t := now.In(loc)
	day := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
	back := (int(day.Weekday()) + 6) % 7
	if weekStart == 0 {
		back = int(day.Weekday())
	}
	first := day.AddDate(0, 0, -back)
	return first.AddDate(0, 0, -7), first
}
