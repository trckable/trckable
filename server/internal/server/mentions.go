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
	"github.com/trckable/trckable/server/internal/mentions"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Where each site is talked about. Every TRCKABLE_MENTIONS_EVERY (default 20
// minutes, 0 is off) Hacker News, the news and blogs (and Product Hunt, with a
// token) are searched for each site's address, name and added words. Each
// source has one worker that keeps its own pace, so a thousand sites never
// become a thousand calls at once, and a source that asks for quiet is left
// alone for longer each time it does. What a mention brought is counted from
// the sessions that arrived from its host in the minutes before it was posted
// to two days after, and again every round for those two days.

const (
	mentionBefore    = 10 * time.Minute
	mentionAfter     = 48 * time.Hour
	mentionFirstLook = 7 * 24 * time.Hour // how far back a site's first look reaches on Hacker News
	mentionsPerSite  = 12                 // words searched per site and source
	mentionAlertAt   = 20                 // visitors from one mention that are worth an email
	mentionNewsDays  = 3 * 24 * time.Hour // how far back a news item is compared to find the same story
)

// The pace of each source (the least time between two of its calls) and the
// longest it is left alone after failures.
var mentionGap = map[string]time.Duration{"hn": 150 * time.Millisecond, "gnews": time.Second, "gdelt": 5500 * time.Millisecond, "ph": time.Second}

const mentionPauseMax = 30 * time.Minute

// MentionSources are the sources this server searches, for the dashboard.
func MentionSources(productHunt bool) []string {
	if productHunt {
		return []string{mentions.HN, mentions.PH, mentions.News}
	}
	return []string{mentions.HN, mentions.News}
}

// pauses remembers which sources asked for quiet.
type pauses struct {
	mu    sync.Mutex
	fails map[string]int
	until map[string]time.Time
}

func (p *pauses) blocked(src string, now time.Time) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return now.Before(p.until[src])
}

func (p *pauses) ok(src string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.fails, src)
	delete(p.until, src)
}

// failed starts (or lengthens) a source's pause: a minute, then two, four, up to half an hour.
func (p *pauses) failed(src string, now time.Time) time.Duration {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.fails == nil {
		p.fails, p.until = map[string]int{}, map[string]time.Time{}
	}
	p.fails[src]++
	d := min(time.Minute<<min(p.fails[src]-1, 10), mentionPauseMax)
	p.until[src] = now.Add(d)
	return d
}

// mentionFinder searches the sources. Its parts are fields so tests can
// answer from recorded files and move the clock.
type mentionFinder struct {
	st      *sqlite.Store
	get     mentions.Doer
	every   time.Duration
	token   string
	now     func() time.Time
	sleep   func(ctx context.Context, d time.Duration)
	gap     map[string]time.Duration
	analyze func() *sql.DB // the analytics store; nil while it warms up
	told    func(ctx context.Context, site sqlite.SiteRow, m sqlite.Mention) bool
	pause   pauses
	phSince time.Time
}

func (s *Server) newMentionFinder() *mentionFinder {
	f := &mentionFinder{
		st: s.ctl, get: alerts.SafeClient(20 * time.Second), every: s.cfg.MentionsEvery, token: s.cfg.ProductHuntToken, now: time.Now,
		sleep: func(ctx context.Context, d time.Duration) {
			select {
			case <-ctx.Done():
			case <-time.After(d):
			}
		},
		gap: mentionGap,
		analyze: func() *sql.DB {
			if st := s.duck.Load(); st != nil {
				return st.DB
			}
			return nil
		},
	}
	f.told = s.tellMention
	return f
}

// runMentions looks once per period, a little after the start.
func (s *Server) runMentions(ctx context.Context) {
	if s.cfg.MentionsEvery <= 0 {
		return
	}
	f := s.newMentionFinder()
	f.sleep(ctx, time.Minute)
	for ctx.Err() == nil {
		began := f.now()
		f.round(ctx)
		f.sleep(ctx, f.every-f.now().Sub(began))
	}
}

// round searches every source, then counts what the mentions brought.
func (f *mentionFinder) round(ctx context.Context) {
	sites, err := f.st.AllSites(ctx)
	if err != nil {
		slog.Warn("mentions: sites not read", "err", err)
		return
	}
	words := map[string][]string{}
	for _, site := range sites {
		if w, err := f.st.SearchWords(ctx, site); err == nil && len(w) > 0 {
			words[site.ID] = w[:min(len(w), mentionsPerSite)]
		}
	}
	deadline := f.now().Add(f.every)
	var wg sync.WaitGroup
	for _, pass := range []func(context.Context, []sqlite.SiteRow, map[string][]string, time.Time){f.hackerNews, f.news, f.productHunt} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			pass(ctx, sites, words, deadline)
		}()
	}
	wg.Wait()
	if ctx.Err() == nil {
		f.score(ctx, sites)
	}
}

// within says whether a pass may go on: not cancelled, not past its round.
func (f *mentionFinder) within(ctx context.Context, deadline time.Time) bool {
	return ctx.Err() == nil && f.now().Before(deadline)
}

// fail pauses a source after it failed, and says so once per pause.
func (f *mentionFinder) fail(src string, err error) {
	d := f.pause.failed(src, f.now())
	slog.Warn("mentions: source failed", "source", src, "pause", d, "err", err)
}

func (f *mentionFinder) save(ctx context.Context, site string, list []mentions.Mention) (newest int64) {
	for _, m := range list {
		newest = max(newest, m.PostedAt)
		if !mentions.Web(m.URL) {
			continue
		}
		_, err := f.st.SaveMention(ctx, sqlite.Mention{Site: site, Source: m.Source, URL: m.URL, Kind: m.Kind, Title: m.Title, Author: m.Author, Host: m.Host,
			Points: m.Points, Front: m.Front, PostedAt: m.PostedAt}, f.now().Unix())
		if err != nil {
			slog.Warn("mentions: not saved", "site", site, "err", err)
		}
	}
	return newest
}

// hackerNews asks Algolia, site by site (the ones looked at longest ago
// first), one call per word, and notes what is on the front page.
func (f *mentionFinder) hackerNews(ctx context.Context, sites []sqlite.SiteRow, words map[string][]string, deadline time.Time) {
	if f.pause.blocked("hn", f.now()) {
		return
	}
	cur, err := f.st.MentionCursors(ctx, mentions.HN)
	if err != nil {
		return
	}
	sqlite.SortMentionsDue(sites, cur)
	front, err := mentions.FrontHN(ctx, f.get)
	if err == nil {
		urls := make([]string, 0, len(front))
		for u := range front {
			urls = append(urls, u)
		}
		_ = f.st.MarkFront(ctx, urls)
	} else if errors.Is(err, mentions.ErrLimited) {
		f.fail("hn", err)
		return
	}
	for _, site := range sites {
		w := words[site.ID]
		if len(w) == 0 || !f.within(ctx, deadline) || f.pause.blocked("hn", f.now()) {
			continue
		}
		since := cur[site.ID].Cursor
		if since == 0 {
			since = f.now().Add(-mentionFirstLook).Unix()
		}
		var found []mentions.Mention
		failed := false
		for _, word := range w {
			list, err := mentions.SearchHN(ctx, f.get, word, since)
			if err != nil {
				f.fail("hn", err)
				failed = true
				break
			}
			found = append(found, list...)
			f.sleep(ctx, f.gap["hn"])
		}
		if failed {
			continue
		}
		f.pause.ok("hn")
		found = mentions.Dedupe(found)
		for i := range found {
			_, found[i].Front = front[found[i].URL]
		}
		newest := f.save(ctx, site.ID, found)
		_ = f.st.SaveMentionCursor(ctx, site.ID, mentions.HN, sqlite.MentionCursor{Cursor: max(since, newest), CheckedAt: f.now().Unix()})
	}
}

// news asks Google News and GDELT for each site's words together. The same
// story from both, or found again by another word, is one mention.
func (f *mentionFinder) news(ctx context.Context, sites []sqlite.SiteRow, words map[string][]string, deadline time.Time) {
	cur, err := f.st.MentionCursors(ctx, mentions.News)
	if err != nil {
		return
	}
	sqlite.SortMentionsDue(sites, cur)
	for _, site := range sites {
		w := words[site.ID]
		if len(w) == 0 || !f.within(ctx, deadline) {
			continue
		}
		var found []mentions.Mention
		tag := cur[site.ID].ETag
		if !f.pause.blocked("gnews", f.now()) {
			list, newTag, _, err := mentions.SearchGoogleNews(ctx, f.get, w, tag)
			switch {
			case err != nil:
				f.fail("gnews", err)
			default:
				f.pause.ok("gnews")
				found, tag = append(found, list...), newTag
			}
			f.sleep(ctx, f.gap["gnews"])
		}
		if !f.pause.blocked("gdelt", f.now()) && f.within(ctx, deadline) {
			list, err := mentions.SearchGDELT(ctx, f.get, w)
			if err != nil {
				f.fail("gdelt", err)
			} else {
				f.pause.ok("gdelt")
				found = append(found, list...)
			}
			f.sleep(ctx, f.gap["gdelt"])
		}
		f.save(ctx, site.ID, f.unseenNews(ctx, site.ID, mentions.Dedupe(found)))
		_ = f.st.SaveMentionCursor(ctx, site.ID, mentions.News, sqlite.MentionCursor{ETag: tag, CheckedAt: f.now().Unix()})
	}
}

// unseenNews drops the stories a site already has, found by the other source
// or by an earlier round: by address, or by headline on the same site.
func (f *mentionFinder) unseenNews(ctx context.Context, site string, list []mentions.Mention) []mentions.Mention {
	if len(list) == 0 {
		return nil
	}
	have, err := f.st.Mentions(ctx, site, f.now().Add(-mentionNewsDays).Unix(), f.now().Add(time.Hour).Unix(), 500)
	if err != nil {
		return list
	}
	seen := map[string]bool{}
	for _, m := range have {
		if m.Source == mentions.News {
			seen[mentions.Canonical(m.URL)], seen[m.Host+"|"+mentions.TitleKey(m.Title)] = true, true
		}
	}
	var out []mentions.Mention
	for _, m := range list {
		if !seen[mentions.Canonical(m.URL)] && !seen[m.Host+"|"+mentions.TitleKey(m.Title)] {
			out = append(out, m)
		}
	}
	return out
}

// productHunt looks at the newest launches once and matches them to every site.
func (f *mentionFinder) productHunt(ctx context.Context, sites []sqlite.SiteRow, words map[string][]string, _ time.Time) {
	if f.token == "" || f.pause.blocked("ph", f.now()) {
		return
	}
	now := f.now()
	if f.phSince.IsZero() {
		f.phSince = now.Add(-24 * time.Hour)
	}
	posts, err := mentions.RecentPH(ctx, f.get, f.token, f.phSince)
	if err != nil {
		f.fail("ph", err)
		return
	}
	f.pause.ok("ph")
	f.phSince = now.Add(-time.Hour) // launches are listed for a while before they settle; saving twice is harmless
	for _, site := range sites {
		if w := words[site.ID]; len(w) > 0 {
			f.save(ctx, site.ID, mentions.PHMatch(posts, w))
		}
	}
}

// brought counts the people a mention sent: sessions that began between its
// start and its end with the host as their referrer, and the busiest hour.
func brought(ctx context.Context, db *sql.DB, site, host string, from, to time.Time) (visitors, peak int64, err error) {
	if err = db.QueryRowContext(ctx, `SELECT count(DISTINCT visitor_id) FROM sessions
		WHERE site_id = ? AND start >= ? AND start < ? AND referrer = ?`, site, from.UTC(), to.UTC(), host).Scan(&visitors); err != nil || visitors == 0 {
		return visitors, 0, err
	}
	var hour time.Time
	err = db.QueryRowContext(ctx, `SELECT date_trunc('hour', start) AS h FROM sessions
		WHERE site_id = ? AND start >= ? AND start < ? AND referrer = ?
		GROUP BY h ORDER BY count(DISTINCT visitor_id) DESC, h LIMIT 1`, site, from.UTC(), to.UTC(), host).Scan(&hour)
	return visitors, hour.Unix(), err
}

// exact counts the visits that came from the mention's own address.
func exact(ctx context.Context, db *sql.DB, site, addr string, from, to time.Time) (int64, error) {
	var n int64
	err := db.QueryRowContext(ctx, `SELECT count(DISTINCT visitor_id) FROM events
		WHERE site_id = ? AND kind = 1 AND ts >= ? AND ts < ? AND referrer_url = ?`, site, from.UTC(), to.UTC(), addr).Scan(&n)
	return n, err
}

// score counts what each mention brought: the visitors from its host in
// [posted - 10 min, posted + 48 h], never past the next mention of its kind
// from the same host (those visitors are that one's) and never past now. A
// comment posted under a story of the same host shows none of its own: they
// are the story's. The visits that
// came from the mention's own address count alone when there are any. Mentions
// stay counted for two days; after that they keep their last number.
func (f *mentionFinder) score(ctx context.Context, sites []sqlite.SiteRow) {
	db := f.analyze()
	if db == nil {
		return
	}
	now := f.now()
	list, err := f.st.MentionsToScore(ctx, now.Add(-mentionAfter-time.Hour).Unix())
	if err != nil {
		slog.Warn("mentions: not read", "err", err)
		return
	}
	byID := map[string]sqlite.SiteRow{}
	for _, s := range sites {
		byID[s.ID] = s
	}
	for _, m := range list {
		if ctx.Err() != nil {
			return
		}
		posted := time.Unix(m.PostedAt, 0)
		if m.ScoredAt != 0 && now.Sub(posted) >= mentionAfter+time.Hour {
			continue // settled
		}
		end := posted.Add(mentionAfter)
		if end.After(now) {
			end = now
		}
		covered := false
		if sib, err := f.st.MentionsOfHost(ctx, m.Site, m.Host, m.PostedAt-int64(mentionAfter.Seconds())); err == nil {
			for _, o := range sib {
				if o.ID == m.ID {
					continue
				}
				later := o.PostedAt > m.PostedAt || (o.PostedAt == m.PostedAt && o.ID > m.ID)
				switch {
				case later && (o.Kind == m.Kind) && time.Unix(o.PostedAt, 0).Before(end):
					end = time.Unix(o.PostedAt, 0) // the next of its kind takes the visitors after it
				case m.Kind == "comment" && o.Kind != "comment" && !later && posted.Sub(time.Unix(o.PostedAt, 0)) < mentionAfter:
					covered = true // a comment under a story shares its visitors
				}
			}
		}
		if covered {
			if err := f.st.SaveScore(ctx, m.ID, 0, 0, now.Unix()); err != nil {
				slog.Warn("mentions: score not saved", "site", m.Site, "err", err)
			}
			continue
		}
		from := posted.Add(-mentionBefore)
		if !end.After(from) {
			end = from.Add(time.Minute)
		}
		visitors, peak, err := brought(ctx, db, m.Site, m.Host, from, end)
		if err != nil {
			slog.Warn("mentions: not counted", "site", m.Site, "err", err)
			continue
		}
		if n, err := exact(ctx, db, m.Site, m.URL, from, end); err == nil && n > 0 && n <= visitors {
			visitors = n
		}
		if err := f.st.SaveScore(ctx, m.ID, visitors, peak, now.Unix()); err != nil {
			slog.Warn("mentions: score not saved", "site", m.Site, "err", err)
			continue
		}
		m.Visitors, m.PeakHour = visitors, peak
		if !m.Alerted && now.Sub(posted) < mentionAfter && (visitors >= mentionAlertAt || (m.Front && m.Source == mentions.HN)) {
			if site, ok := byID[m.Site]; ok && f.told(ctx, site, m) {
				_ = f.st.MarkMentionAlerted(ctx, m.ID)
			}
		}
	}
}

func minTime(a, b time.Time) time.Time {
	if b.Before(a) {
		return b
	}
	return a
}

// SourceName is a source as a person calls it.
func SourceName(src string) string {
	switch src {
	case mentions.HN:
		return "Hacker News"
	case mentions.PH:
		return "Product Hunt"
	}
	return "the news"
}

// tellMention sends a mention to the site's mention alerts, once. It says
// whether anyone was told (so a mention is not used up before an alert exists).
func (s *Server) tellMention(ctx context.Context, site sqlite.SiteRow, m sqlite.Mention) bool {
	list, err := s.ctl.LiveAlerts(ctx)
	if err != nil {
		return false
	}
	told := false
	for _, a := range list {
		if a.SiteID != site.ID || a.Kind != "mention" {
			continue
		}
		ev := mentionEvent(site, m, s.mentionLink(site.Domain))
		ev.Site = site.ID
		ev.Unsubscribe = s.stopLink(a.ID)
		ev.Settings = s.settingsLink(site.ID)
		if err := alerts.Send(ctx, a.Target, ev); err != nil {
			slog.Warn("alert not delivered", "kind", a.Kind, "err", err)
			continue
		}
		if err := s.ctl.MarkFired(ctx, a.ID, time.Now().Unix()); err != nil {
			slog.Warn("alert sent but not marked", "kind", a.Kind, "site", site.ID, "err", err)
		}
		slog.Info("alert sent", "kind", a.Kind, "site", site.ID)
		told = true
	}
	return told
}

func (s *Server) mentionLink(domain string) string {
	if s.cfg.BaseURL == "" {
		return ""
	}
	return strings.TrimSuffix(s.cfg.BaseURL, "/") + "/" + url.PathEscape(domain)
}

// mentionEvent words one mention for a webhook or an email.
func mentionEvent(site sqlite.SiteRow, m sqlite.Mention, link string) alerts.Event {
	where := SourceName(m.Source)
	title := "Mentioned on " + where
	if m.Source == mentions.News {
		title = "Mentioned in the news"
	}
	msg := fmt.Sprintf("%s was mentioned on %s: %q.", site.Domain, where, alerts.Short(m.Title, 120))
	switch {
	case m.Visitors > 0:
		msg += fmt.Sprintf(" %d people have come from it so far.", m.Visitors)
	case m.Front:
		msg += " It is on the front page now."
	}
	ev := alerts.Event{Kind: "mention", Domain: site.Domain, At: time.Now(), Title: title, Message: msg, Subject: title + ": " + site.Domain}
	if link != "" {
		ev.Message += "\n\n" + link
	}
	card := &alerts.Card{Eyebrow: title, Live: true, Text: alerts.Short(m.Title, 160), CTA: "See it on your dashboard", Link: link, Note: "You get this when a mention brings people to your site."}
	if m.Visitors > 0 {
		card.Big, card.Strong, card.Sub, card.Text = fmt.Sprint(m.Visitors), "visitors", "came from it so far", ""
		card.Rows = [][2]string{{"Where", where}, {"What", alerts.Short(m.Title, 60)}}
	}
	if m.Front {
		card.Rows = append(card.Rows, [2]string{"Front page", "Yes"})
	}
	ev.Card = card
	ev.Data = map[string]any{"source": m.Source, "url": m.URL, "visitors": m.Visitors, "front": m.Front}
	return ev
}

// pruneMentions removes the mentions older than a site's own "keep for N days".
func (s *Server) pruneMentions(ctx context.Context) {
	plan, err := s.ctl.RetentionPlan(ctx)
	if err != nil {
		return
	}
	for site, days := range plan {
		if _, err := s.ctl.PruneMentions(ctx, site, time.Now().AddDate(0, 0, -days).Unix()); err != nil {
			slog.Warn("mentions: retention failed", "site", site, "err", err)
		}
	}
}
