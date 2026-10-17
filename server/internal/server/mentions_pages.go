package server

import (
	"context"
	"database/sql"
	"log/slog"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/ingest"
	"github.com/trckable/trckable/server/internal/mentions"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Pages that sent visitors are mentions the visits confirm: a thread on Reddit,
// an article, a newsletter page. Nobody has to find them by words; the people
// who followed the link are the proof. They are listed first, with the
// visitors they sent over the last month, and are never judged by the
// matcher (only the site's own pages and blocked sites rule them out).

// pageStat is what one visiting page sent: how many different people, the
// hour the first came, and the hour most came.
type pageStat struct{ visitors, first, peak int64 }

// pageVisitors reads, in the database, the pages that sent at least min people
// in [from, to), counting only visits the classifier called Social or Referral
// (a search result, an AI answer, mail or a campaign is not a page that
// mentions the site).
func pageVisitors(ctx context.Context, db *sql.DB, site string, from, to time.Time, min int) (map[string]pageStat, error) {
	where := `site_id = ? AND kind = 1 AND ts >= ? AND ts < ? AND channel IN (?, ?) AND referrer_url IS NOT NULL AND position('/' IN referrer_url) > 0`
	args := []any{site, from.UTC(), to.UTC(), ingest.ChannelSocial, ingest.ChannelReferral}
	rows, err := db.QueryContext(ctx, `SELECT referrer_url, count(DISTINCT visitor_id), CAST(epoch(min(ts)) AS BIGINT) FROM events WHERE `+where+`
		GROUP BY referrer_url HAVING count(DISTINCT visitor_id) >= ? ORDER BY 2 DESC, 1 LIMIT 500`, append(slices.Clone(args), min)...)
	if err != nil {
		return nil, err
	}
	out := map[string]pageStat{}
	for rows.Next() {
		var form string
		var st pageStat
		if err := rows.Scan(&form, &st.visitors, &st.first); err != nil {
			rows.Close()
			return nil, err
		}
		out[form] = st
	}
	rows.Close()
	if err := rows.Err(); err != nil || len(out) == 0 {
		return out, err
	}
	hours, err := db.QueryContext(ctx, `SELECT referrer_url, CAST(epoch(date_trunc('hour', ts)) AS BIGINT), count(DISTINCT visitor_id) FROM events WHERE `+where+`
		GROUP BY 1, 2 ORDER BY 1, 3 DESC, 2`, args...)
	if err != nil {
		return nil, err
	}
	defer hours.Close()
	for hours.Next() {
		var form string
		var hour, n int64
		if err := hours.Scan(&form, &hour, &n); err != nil {
			return nil, err
		}
		if st, ok := out[form]; ok && st.peak == 0 {
			st.peak = hour // the busiest hour comes first for each page
			out[form] = st
		}
	}
	return out, hours.Err()
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
		got, err := pageVisitors(ctx, db, site.ID, now.AddDate(0, 0, -mentionPageDays), now, mentionPageMin)
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
func (f *mentionFinder) confirm(ctx context.Context, site string, p plan, form string, st pageStat, byAddress map[string]sqlite.Mention, now time.Time) {
	host := form
	if i := strings.IndexByte(form, '/'); i > 0 {
		host = form[:i]
	}
	addr := "https://" + form
	if st.visitors < mentionPageMin || !mentions.Web(addr) || !p.rules.Page(addr).Show {
		return
	}
	cur, found := byAddress[mentions.Canonical(addr)]
	if found && cur.State != sqlite.MentionShown {
		return // one the owner hid, or a judge refused, stays out
	}
	if !found {
		m := sqlite.Mention{Site: site, Source: mentions.Ref, URL: addr, Title: form, Host: host, PostedAt: st.first, State: sqlite.MentionShown, Via: mentions.ViaPage}
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
	_ = f.st.SaveScore(ctx, cur.ID, st.visitors, st.peak, now.Unix())
}
