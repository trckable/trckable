package server

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/modules"
	"github.com/trckable/trckable/server/internal/query"
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

// weeklyText words the report. It is plain text on purpose: every chat tool
// and every mail client shows it the same.
func weeklyText(domain string, from, to time.Time, cur, prev *query.Result, link string) (title, msg string, data map[string]any) {
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
		if len(cur.Goals) > 0 {
			g := cur.Goals[0]
			lines = append(lines, fmt.Sprintf("Top goal: %s, %s visitors", g.Value, number(g.Visitors)))
		}
		if m := cur.Money; m != nil && m.Payments > 0 {
			line := fmt.Sprintf("Revenue: %s from %s payment", amount(m.Revenue, m.Currency, m.Exponent), number(m.Payments))
			if m.Payments != 1 {
				line += "s"
			}
			if prev.Money != nil {
				line += ", " + change(float64(m.Revenue), float64(prev.Money.Revenue))
			}
			lines = append(lines, line)
		}
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
	set, _ := modules.Store{DB: s.ctl.DB}.Of(ctx, siteID)
	p := query.Params{Site: siteID, From: from.UTC(), To: to.UTC(), TZ: loc.String(), Bucket: "day", Limit: 3,
		Currency: info.Currency, Revenue: set.Has("revenue"), Goals: set.Has("goals")}
	cur, err := q.Report(ctx, p)
	if err != nil {
		return ev, false
	}
	pp := p
	pp.From, pp.To = from.AddDate(0, 0, -7).UTC(), from.UTC()
	prev, err := q.Report(ctx, pp)
	if err != nil {
		return ev, false
	}
	link := ""
	if s.cfg.BaseURL != "" {
		link = strings.TrimSuffix(s.cfg.BaseURL, "/") + "/" + info.Domain
	}
	ev.Title, ev.Message, ev.Data = weeklyText(info.Domain, from, to, cur, prev, link)
	ev.Text = ev.Title + " — " + ev.Message
	return ev, true
}
