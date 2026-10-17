package server

import (
	"context"
	"database/sql"
	"log/slog"
	"sort"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/mentions"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Pages that sent visitors are mentions the visits confirm: a thread on Reddit,
// an article, a newsletter page. Nobody has to find them by words; the people
// who followed the link are the proof. They are listed first, with the
// visitors they sent over the last month, and are never judged by the
// matcher (only the site's own pages and blocked sites rule them out).

// pageVisitors are the visitors that came from each page, by hour, over a stretch.
func pageVisitors(ctx context.Context, db *sql.DB, site string, from, to time.Time) (map[string][]visit, error) {
	rows, err := db.QueryContext(ctx, `SELECT referrer_url, visitor_id, CAST(epoch(date_trunc('hour', ts)) AS BIGINT) FROM events
		WHERE site_id = ? AND kind = 1 AND ts >= ? AND ts < ? AND referrer_url IS NOT NULL AND referrer_url <> '' AND position('/' IN referrer_url) > 0
		GROUP BY ALL LIMIT 50000`, site, from.UTC(), to.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]visit{}
	for rows.Next() {
		var form string
		var v visit
		if err := rows.Scan(&form, &v.visitor, &v.hour); err != nil {
			return nil, err
		}
		out[form] = append(out[form], v)
	}
	return out, rows.Err()
}

// pages lists, for each site, the pages that sent at least two visitors in the
// last month, and keeps the count of what each sent. Once an hour per site.
func (f *mentionFinder) pages(ctx context.Context, sites []sqlite.SiteRow, plans map[string]plan) {
	db := f.analyze()
	if db == nil {
		return
	}
	if f.pagesAt == nil {
		f.pagesAt = map[string]time.Time{}
	}
	now := f.now()
	for _, site := range sites {
		if ctx.Err() != nil {
			return
		}
		if at, ok := f.pagesAt[site.ID]; ok && now.Sub(at) < mentionPageEvery {
			continue
		}
		p, ok := plans[site.ID]
		if !ok {
			continue
		}
		got, err := pageVisitors(ctx, db, site.ID, now.AddDate(0, 0, -mentionPageDays), now)
		if err != nil {
			slog.Warn("mentions: pages not read", "site", site.ID, "err", err)
			continue
		}
		f.pagesAt[site.ID] = now
		forms := make([]string, 0, len(got))
		for form := range got {
			forms = append(forms, form)
		}
		sort.Strings(forms)
		have, _ := f.st.AllMentions(ctx, site.ID, now.AddDate(0, 0, -mentionPageDays-1).Unix(), now.Add(time.Hour).Unix(), 5000)
		byAddress := map[string]sqlite.Mention{}
		for _, m := range have {
			byAddress[mentions.Canonical(m.URL)] = m
		}
		for _, form := range forms {
			f.confirm(ctx, site.ID, p, form, got[form], byAddress, now)
		}
	}
}

// confirm keeps one visiting page as a mention, or marks the one already
// found at that address (by words, with or without "www.") as confirmed, and
// stores the visitors it sent.
func (f *mentionFinder) confirm(ctx context.Context, site string, p plan, form string, list []visit, byAddress map[string]sqlite.Mention, now time.Time) {
	visitors, peak := tally(list)
	host := form
	if i := strings.IndexByte(form, '/'); i > 0 {
		host = form[:i]
	}
	addr := "https://" + form
	if visitors < mentionPageMin || mentions.RefIgnored(host) || !mentions.Web(addr) || !p.rules.Page(addr).Show {
		return
	}
	cur, found := byAddress[mentions.Canonical(addr)]
	if found && cur.State != sqlite.MentionShown {
		return // one the owner hid, or a judge refused, stays out
	}
	if !found {
		first := list[0].hour
		for _, v := range list {
			first = min(first, v.hour)
		}
		m := sqlite.Mention{Site: site, Source: mentions.Ref, URL: addr, Title: form, Host: host, PostedAt: first, State: sqlite.MentionShown, Via: mentions.ViaPage}
		if _, err := f.st.SaveMention(ctx, m, now.Unix()); err != nil {
			slog.Warn("mentions: page not saved", "site", site, "err", err)
			return
		}
		var err error
		if cur, err = f.st.MentionsAtAddress(ctx, site, addr); err != nil || cur.ID == 0 {
			return
		}
	}
	_ = f.st.ConfirmMention(ctx, site, cur.ID)
	_ = f.st.SaveScore(ctx, cur.ID, visitors, peak, now.Unix())
}
