package server

import (
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/mailkit"
	"github.com/trckable/trckable/server/internal/milestones"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/reports"
	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/surge"
)

// EmailSamples are every email trckable sends, built by the same code that
// sends them, from made-up numbers for a made-up site: for the preview
// (trckabled emails preview) and for trying them in real mail clients. base is
// where the links point.
func EmailSamples(base string) []mailkit.Page {
	base = strings.TrimSuffix(base, "/")
	if base == "" {
		base = "https://stats.example.com"
	}
	const domain = "shop.example.com"
	now := time.Date(2026, 10, 16, 9, 30, 0, 0, time.UTC)
	s := &Server{}
	s.cfg.BaseURL = base
	stop, settings := base+"/u/sample.sig", base+"/settings?site=sample&tab=alerts"
	alert := func(name string, ev alerts.Event) mailkit.Page {
		ev.Domain, ev.At, ev.Unsubscribe, ev.Settings = domain, now, stop, settings
		r := alerts.Compose(ev)
		return page(name, r)
	}
	var out []mailkit.Page

	// A milestone, with the first visit 47 days before.
	m := sqlite.Milestone{Kind: milestones.Pageviews, Step: "10000", Value: 10000, Day: "2026-10-15"}
	headline, mail := milestones.Email(m, []sqlite.Milestone{m, {Kind: milestones.Pageviews, Step: "1", Value: 1, Day: "2026-08-29"}}, domain, base)
	out = append(out, alert("milestone", alerts.Event{Kind: "milestone", Subject: strings.TrimSuffix(headline, " 🎉"), Email: mail}))

	// A surge, rising over the last half hour.
	sg := surge.Surge{Started: now.Add(-12 * time.Minute).Unix(), Online: 53, Usual: 20,
		Why: surge.Why{Source: "Facebook", SourceDim: "referrer", SourceValue: "l.facebook.com", SourceN: 34, SourceUsual: 2, Page: "/blog/launch-post", PageN: 30, Before: 20, Minutes: 15}}
	online := []int64{14, 15, 13, 16, 15, 17, 16, 18, 17, 19, 20, 19, 21, 22, 24, 23, 26, 29, 31, 34, 33, 37, 40, 42, 41, 45, 48, 50, 52, 53}
	out = append(out, alert("surge", surgeEvent(sg, domain, base+"/"+domain, now, time.UTC, online)))

	// Down, back up, and stopped.
	site := sqlite.SiteRow{ID: "sample", Domain: domain, Timezone: "UTC"}
	down := sqlite.SiteProbe{At: now.Unix(), Error: "No answer within 10 seconds", Failures: 3, DownSince: now.Add(-14 * time.Minute).Unix()}
	for _, kind := range []string{"down", "up"} {
		ev := alerts.Event{Kind: kind}
		after := down
		if kind == "up" {
			after = sqlite.SiteProbe{At: now.Add(9 * time.Minute).Unix()}
		}
		s.probeWords(&ev, site, down, after)
		out = append(out, alert("site-"+kind, ev))
	}
	var stopped alerts.Event
	last := now.Add(-6*time.Hour - 5*time.Minute).Unix()
	s.stoppedWords(&stopped, sqlite.SiteInfo{Domain: domain, Timezone: "UTC"}, last, sqlite.SiteCheck{At: last + 600, Found: "none"}, now)
	out = append(out, alert("site-stopped", stopped))

	// A mention on Hacker News that is bringing people.
	men := sqlite.Mention{Source: "hn", URL: "https://news.ycombinator.com/item?id=41234567", Title: "Show HN: A one-person shop that ships in a day", Author: "maya",
		Points: 212, Comments: 87, Snippet: "We switched to shop.example.com for our launch and it was the smoothest checkout we have tried.", Front: true, Visitors: 1240}
	ev := mentionEvent(site, men, base+"/"+domain)
	out = append(out, alert("mention", ev))

	// Money coming in: a new customer, an upgrade, a refund, and one found late.
	ms := now.UnixMilli()
	for _, m := range []struct {
		name   string
		n      revenue.Notice
		source string
	}{
		{"money-new", revenue.Notice{At: ms, Kind: revenue.NoticeNew, Amount: 4200, Currency: "USD", Exponent: 2}, "Google"},
		{"money-upgrade", revenue.Notice{At: ms, Kind: revenue.NoticeUpgrade, Amount: 21800, Currency: "USD", Exponent: 2, From: "Pro", To: "Business"}, ""},
		{"money-refund", revenue.Notice{At: ms, Kind: revenue.NoticeRefund, Amount: 1200, Currency: "USD", Exponent: 2}, ""},
		{"money-late", revenue.Notice{At: now.Add(-5 * time.Hour).UnixMilli(), Kind: revenue.NoticeNew, Amount: 4200, Currency: "USD", Exponent: 2, Late: true}, "Google"},
	} {
		out = append(out, alert(m.name, moneyEvent(m.n, domain, m.source, base+"/"+domain, time.UTC)))
	}

	// The weekly report.
	from := time.Date(2026, 10, 5, 0, 0, 0, 0, time.UTC)
	cur := &query.Result{
		KPIs: query.KPIs{Visitors: 4512, Pageviews: 10301, BounceRate: 0.45, AvgSessionS: 130},
		Dims: map[string][]query.Row{
			"channel":    {{Value: "Search", Visitors: 1203}, {Value: "AI", Visitors: 702}, {Value: "Direct", Visitors: 650}},
			"entry_page": {{Value: "/", Visitors: 2000}, {Value: "/blog/launch-post", Visitors: 900}, {Value: "/pricing", Visitors: 410}},
		},
	}
	for i, v := range []int64{520, 610, 580, 700, 820, 690, 592} {
		cur.Series = append(cur.Series, query.Point{T: from.AddDate(0, 0, i).Format(time.DateOnly), Visitors: v})
	}
	prev := &query.Result{KPIs: query.KPIs{Visitors: 4000, Pageviews: 10800, BounceRate: 0.5, AvgSessionS: 120}}
	link := base + "/" + domain + "?from=2026-10-05&to=2026-10-11&compare=previous"
	weekly := alerts.Event{Kind: "weekly", Title: "Your week", Email: weeklyEmail(domain, from, from.AddDate(0, 0, 7), cur, prev, aiWeek{Visitors: 702}, "Busiest moment: Thu 18:45, 53 people online, mostly from Facebook.", link, weeklyMentions(weekMentionSamples(), base+"/"+domain+"/mentions"))}
	out = append(out, alert("weekly", weekly))

	// A client's report in German, in the client's colour.
	d := reports.Data{Site: domain, Client: "Acme GmbH", Cadence: "weekly", Lang: "de", From: from, To: from.AddDate(0, 0, 7), Cur: cur, Prev: prev,
		Brand: reports.Brand{Name: "Acme GmbH", Color: "#336699"}, Unsubscribe: base + "/r/sample"}
	out = append(out, page("report-client", s.reportEmail(d, nil)))

	// The sign-in code, and an alert with no design of its own.
	code := alerts.CodeMail{Code: "331 983", Source: "the trckable mobile app", Requester: "Pixel 8 (Android)", Place: "Berlin, DE", At: now}
	out = append(out, page("sign-in-code", code.Report("Your trckable app sign-in code: 331 983")))
	out = append(out, alert("plain-alert", alerts.Event{Kind: "health", Title: "The disk is 91% full", Message: "The data folder has 2.1 GB left. Old raw events can be pruned under Settings → Data."}))
	return out
}

// page is a finished email for the preview.
func page(name string, r alerts.Report) mailkit.Page {
	p := mailkit.Page{Name: name, Subject: r.Subject, HTML: r.HTML, Text: r.Text}
	for _, a := range r.Attachments {
		if a.Inline != "" {
			p.Images = append(p.Images, mailkit.Picture{CID: a.Inline, Name: a.Name, Type: a.Type, Data: a.Data})
		}
	}
	return p
}

// weekMentionSamples are the week's mentions in the sample weekly email.
func weekMentionSamples() []sqlite.Mention {
	return []sqlite.Mention{
		{Source: "hn", URL: "https://news.ycombinator.com/item?id=41234567", Title: "Show HN: A one-person shop that ships in a day", Visitors: 1240},
		{Source: "ph", URL: "https://www.producthunt.com/posts/one-person-shop", Title: "One-person shop: checkout in a day", Visitors: 310},
		{Source: "news", Host: "indiehackers.example", URL: "https://indiehackers.example/posts/shipping-fast", Title: "How a solo founder ships a store in a day", Visitors: 64},
		{Source: "news", Host: "devweekly.example", URL: "https://devweekly.example/issues/212", Title: "Dev Weekly 212", Visitors: 9},
	}
}
