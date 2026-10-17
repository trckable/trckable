package server

import (
	"cmp"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/mailkit"
	"github.com/trckable/trckable/server/internal/mentions"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/writer"
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
	mentionResolves  = 10                 // Google News links followed to their publisher per round
	mentionPageDays  = 30                 // how far back the pages that sent visitors are read
	mentionPageEvery = time.Hour          // the least time between two readings of a site's visiting pages
	mentionPageMin   = 2                  // visitors a page must have sent to be listed
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
	analyze func() *sql.DB                     // the analytics store; nil while it warms up
	open    func(site string) []writer.Session // visits still open, not yet in the store; nil is none
	told    func(ctx context.Context, site sqlite.SiteRow, m sqlite.Mention) bool
	judge   mentions.Judge // the optional yes/no check after a match; nil in the core
	judgeOf func() mentions.Judge
	pause   pauses
	pagesAt map[string]time.Time // when each site's visiting pages were last read
	phSince time.Time
	phLast  time.Time // when the newest Product Hunt mention was posted: its upvotes are looked at again for two days
}

// mentionJudge holds the judge a build set, so it can be read while the finder runs.
type mentionJudge struct{ mentions.Judge }

// SetMentionJudge sets the optional yes/no check that runs on each mention
// after it matched ("is this about the site?"). The core has none and works
// without one; a build that has one (it may call a service) sets it before
// Run. A mention it refuses is kept hidden, not deleted; one it cannot answer
// for waits, hidden, for the next round. nil removes it.
func (s *Server) SetMentionJudge(j mentions.Judge) {
	if j == nil {
		s.judge.Store(nil)
		return
	}
	s.judge.Store(&mentionJudge{j})
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
		open: func(site string) []writer.Session {
			if w := s.writer.Load(); w != nil {
				open, _ := w.OpenSessions(site)
				return open
			}
			return nil
		},
	}
	f.told = s.tellMention
	f.judgeOf = func() mentions.Judge {
		if j := s.judge.Load(); j != nil {
			return j.Judge
		}
		return nil
	}
	return f
}

// runMentions looks once per period, a little after the start.
func (s *Server) runMentions(ctx context.Context) {
	if !s.cfg.MentionsOn || s.cfg.MentionsEvery <= 0 {
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

// plan is what one site is searched for and judged by in a round.
type plan struct {
	terms   []string
	rules   mentions.Rules
	subject mentions.Subject
}

// round searches every source, then counts what the mentions brought.
func (f *mentionFinder) round(ctx context.Context) {
	sites, err := f.st.AllSites(ctx)
	if err != nil {
		slog.Warn("mentions: sites not read", "err", err)
		return
	}
	if f.judgeOf != nil {
		f.judge = f.judgeOf()
	}
	plans := map[string]plan{}
	for _, site := range sites {
		rules, err := f.st.MatchRules(ctx, site)
		if err != nil {
			continue
		}
		p := plan{rules: rules, terms: rules.SearchTerms(), subject: mentions.Subject{Domain: site.Domain, Name: site.Name, Topic: rules.Topic}}
		p.terms = p.terms[:min(len(p.terms), mentionsPerSite)]
		plans[site.ID] = p
		if len(p.terms) > 0 {
			f.review(ctx, site.ID, p)
			f.judgePending(ctx, site.ID, p)
		}
	}
	deadline := f.now().Add(f.every)
	var wg sync.WaitGroup
	for _, pass := range []func(context.Context, []sqlite.SiteRow, map[string]plan, time.Time){f.hackerNews, f.news, f.productHunt} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			pass(ctx, sites, plans, deadline)
		}()
	}
	wg.Wait()
	if ctx.Err() == nil {
		f.pages(ctx, sites, plans)
		f.score(ctx, sites)
	}
}

// itemOf is a stored mention as the matcher reads it.
func itemOf(m sqlite.Mention) mentions.Item {
	return mentions.Item{Source: m.Source, URL: m.URL, Host: m.Host, Title: m.Title, Snippet: m.Snippet, Link: m.Link}
}

// review checks what a site has kept against its rules as they are now, so a
// wrong mention does not stay once the matching is stricter or a rule is
// added: what no longer passes is removed, and a news story told twice is
// kept once. A mention the owner hid stays hidden, and one the visits
// confirmed stays (only blocked sites rule it out).
func (f *mentionFinder) review(ctx context.Context, site string, p plan) {
	have, err := f.st.AllMentions(ctx, site, 0, f.now().Add(time.Hour).Unix(), 1000)
	if err != nil {
		return
	}
	slices.SortStableFunc(have, func(a, b sqlite.Mention) int {
		return cmp.Or(cmp.Compare(a.FoundAt, b.FoundAt), cmp.Compare(a.ID, b.ID))
	})
	var kept []mentions.Mention
	for _, m := range have {
		if m.Via == mentions.ViaPage {
			if p.rules.Page(m.URL).Show {
				continue
			}
			_ = f.st.DeleteMention(ctx, m.ID)
			continue
		}
		if m.State != sqlite.MentionHidden {
			v := p.rules.Allowed(itemOf(m))
			if v.Show && (m.Source == mentions.News || m.Link != "") {
				v = p.rules.Match(itemOf(m))
			}
			if !v.Show {
				_ = f.st.DeleteMention(ctx, m.ID)
				continue
			}
			// An item kept before the matcher has no record of what it pointed at, so it is
			// matched on its own text; if that does not name the site it is hidden, not deleted.
			if m.Via == "" && m.Source != mentions.News && m.Link == "" && m.State == sqlite.MentionShown && !p.rules.Match(itemOf(m)).Show {
				_, _ = f.st.SetMentionState(ctx, site, m.ID, sqlite.MentionRejected)
				continue
			}
		}
		if m.Source == mentions.News {
			nm := mentions.Mention{Source: m.Source, URL: m.URL, Title: m.Title}
			if slices.ContainsFunc(kept, func(o mentions.Mention) bool { return mentions.Same(o, nm) }) {
				_ = f.st.DeleteMention(ctx, m.ID)
				continue
			}
			kept = append(kept, nm)
		}
	}
}

// judgePending asks the judge again about the mentions it could not answer for.
func (f *mentionFinder) judgePending(ctx context.Context, site string, p plan) {
	if f.judge == nil {
		return
	}
	list, err := f.st.PendingMentions(ctx, site, 100)
	if err != nil {
		return
	}
	for _, m := range list {
		state, ok := f.ask(ctx, p, itemOf(m))
		if ok {
			_, _ = f.st.SetMentionState(ctx, site, m.ID, state)
		}
	}
}

// ask puts an item to the judge. ok is false when the judge could not answer.
func (f *mentionFinder) ask(ctx context.Context, p plan, it mentions.Item) (state string, ok bool) {
	if f.judge == nil {
		return sqlite.MentionShown, true
	}
	about, err := f.judge.About(ctx, p.subject, it)
	switch {
	case err != nil:
		slog.Warn("mentions: judge did not answer", "err", err)
		return sqlite.MentionPending, false
	case !about:
		return sqlite.MentionRejected, true
	}
	return sqlite.MentionShown, true
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

// save keeps the mentions that pass the site's rules (and the judge, if
// there is one). What fails a rule is not kept; what the judge refuses is kept
// hidden; what it cannot answer for waits, hidden, for the next round.
func (f *mentionFinder) save(ctx context.Context, site string, p plan, list []mentions.Mention) (newest int64) {
	for _, m := range list {
		newest = max(newest, m.PostedAt)
		if !mentions.Web(m.URL) {
			continue
		}
		it := mentions.Item{Source: m.Source, URL: m.URL, Host: m.Host, Title: m.Title, Snippet: m.Snippet, Link: m.Link}
		v := p.rules.Match(it)
		if !v.Show {
			continue
		}
		state := sqlite.MentionShown
		if _, known, _ := f.st.MentionState(ctx, site, m.URL); !known {
			state, _ = f.ask(ctx, p, it)
		}
		_, err := f.st.SaveMention(ctx, sqlite.Mention{Site: site, Source: m.Source, URL: m.URL, Kind: m.Kind, Title: m.Title, Author: m.Author, Host: m.Host,
			Points: m.Points, Comments: m.Comments, Snippet: m.Snippet, Front: m.Front, PostedAt: m.PostedAt, State: state, Via: v.Via, Link: m.Link}, f.now().Unix())
		if err != nil {
			slog.Warn("mentions: not saved", "site", site, "err", err)
		}
	}
	return newest
}

// hackerNews asks Algolia, site by site (the ones looked at longest ago
// first), one call per site for all its words, and notes what is on the front page.
func (f *mentionFinder) hackerNews(ctx context.Context, sites []sqlite.SiteRow, plans map[string]plan, deadline time.Time) {
	if f.pause.blocked("hn", f.now()) {
		return
	}
	cur, err := f.st.MentionCursors(ctx, mentions.HN)
	if err != nil {
		return
	}
	sites = slices.Clone(sites) // the passes run side by side: each sorts its own
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
		p := plans[site.ID]
		w := p.terms
		if len(w) == 0 || !f.within(ctx, deadline) || f.pause.blocked("hn", f.now()) {
			continue
		}
		since := cur[site.ID].Cursor
		if since == 0 {
			since = f.now().Add(-mentionFirstLook).Unix()
		}
		found, err := mentions.SearchHN(ctx, f.get, w, since)
		f.sleep(ctx, f.gap["hn"])
		if err != nil {
			f.fail("hn", err)
			continue
		}
		f.pause.ok("hn")
		found = mentions.Dedupe(found)
		for i := range found {
			_, found[i].Front = front[found[i].URL]
		}
		newest := f.save(ctx, site.ID, p, found)
		_ = f.st.SaveMentionCursor(ctx, site.ID, mentions.HN, sqlite.MentionCursor{Cursor: max(since, newest), CheckedAt: f.now().Unix()})
	}
}

// news asks Google News and GDELT for each site's words together. The same
// story from both, or found again by another word, is one mention.
func (f *mentionFinder) news(ctx context.Context, sites []sqlite.SiteRow, plans map[string]plan, deadline time.Time) {
	resolves := mentionResolves
	cur, err := f.st.MentionCursors(ctx, mentions.News)
	if err != nil {
		return
	}
	sites = slices.Clone(sites)
	sqlite.SortMentionsDue(sites, cur)
	for _, site := range sites {
		p := plans[site.ID]
		w := p.terms
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
				for i := range list {
					list[i].URL = f.resolve(ctx, list[i].URL, &resolves)
				}
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
		f.save(ctx, site.ID, p, f.unseenNews(ctx, site.ID, mentions.Dedupe(found)))
		_ = f.st.SaveMentionCursor(ctx, site.ID, mentions.News, sqlite.MentionCursor{ETag: tag, CheckedAt: f.now().Unix()})
	}
}

// unseenNews drops the stories a site already has (of any state: one the
// owner hid is not found again), found by the other source or by an earlier
// round: the same address, or a near-identical headline on any site.
func (f *mentionFinder) unseenNews(ctx context.Context, site string, list []mentions.Mention) []mentions.Mention {
	if len(list) == 0 {
		return nil
	}
	have, err := f.st.AllMentions(ctx, site, f.now().Add(-mentionNewsDays).Unix(), f.now().Add(time.Hour).Unix(), 500)
	if err != nil {
		return list
	}
	var seen []mentions.Mention
	for _, m := range have {
		seen = append(seen, mentions.Mention{Source: m.Source, URL: m.URL, Title: m.Title})
	}
	var out []mentions.Mention
	for _, m := range list {
		if !slices.ContainsFunc(seen, func(o mentions.Mention) bool { return mentions.Same(o, m) }) {
			out = append(out, m)
		}
	}
	return out
}

// resolve gives a Google News link its publisher's address, so the story
// found there and by another source is one; the call that follows a redirect
// is made for a few links per round.
func (f *mentionFinder) resolve(ctx context.Context, link string, budget *int) string {
	real := mentions.Resolve(ctx, f.get, link, false)
	if real == link && *budget > 0 && mentions.HostOf(link) == "news.google.com" {
		*budget--
		real = mentions.Resolve(ctx, f.get, link, true)
	}
	return real
}

// productHunt looks at the newest launches once and matches them to every site.
func (f *mentionFinder) productHunt(ctx context.Context, sites []sqlite.SiteRow, plans map[string]plan, _ time.Time) {
	if f.token == "" || f.pause.blocked("ph", f.now()) {
		return
	}
	now := f.now()
	after := now.Add(-time.Hour) // launches are listed for a while before they settle; saving twice is harmless
	switch {
	case f.phSince.IsZero():
		after = now.Add(-24 * time.Hour)
	case now.Sub(f.phLast) < mentionAfter:
		after = now.Add(-mentionAfter) // a recent launch of ours: its upvotes are read again for two days
	}
	posts, err := mentions.RecentPH(ctx, f.get, f.token, after)
	if err != nil {
		f.fail("ph", err)
		return
	}
	f.pause.ok("ph")
	f.phSince = now
	for _, site := range sites {
		if p := plans[site.ID]; len(p.terms) > 0 {
			f.phLast = time.Unix(max(f.phLast.Unix(), f.save(ctx, site.ID, p, mentions.PHMatch(posts, p.terms))), 0)
		}
	}
}

// visit is one visitor in one hour.
type visit struct {
	visitor uint64
	hour    int64
}

// hostVisits are the visitors whose sessions began in [from, to) with host as
// their referrer, by hour.
func hostVisits(ctx context.Context, db *sql.DB, site, host string, from, to time.Time) ([]visit, error) {
	return visitsOf(ctx, db, `SELECT DISTINCT visitor_id, CAST(epoch(date_trunc('hour', start)) AS BIGINT) FROM sessions
		WHERE site_id = ? AND start >= ? AND start < ? AND referrer = ?`, site, from.UTC(), to.UTC(), host)
}

// pageVisits are the visitors who arrived from one page (its address as a
// visit stores it, mentions.RefForm), by hour.
func pageVisits(ctx context.Context, db *sql.DB, site, form string, from, to time.Time) ([]visit, error) {
	return visitsOf(ctx, db, `SELECT DISTINCT visitor_id, CAST(epoch(date_trunc('hour', ts)) AS BIGINT) FROM events
		WHERE site_id = ? AND kind = 1 AND ts >= ? AND ts < ? AND referrer_url = ?`, site, from.UTC(), to.UTC(), form)
}

func visitsOf(ctx context.Context, db *sql.DB, q string, args ...any) ([]visit, error) {
	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []visit
	for rows.Next() {
		var v visit
		if err := rows.Scan(&v.visitor, &v.hour); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// openVisits are the visits still open (not yet in the sessions table) that
// began in [from, to) from host.
func openVisits(list []writer.Session, host string, from, to time.Time) []visit {
	var out []visit
	for _, s := range list {
		at := time.UnixMilli(s.Start)
		if s.Referrer == host && !at.Before(from) && at.Before(to) {
			out = append(out, visit{s.Visitor, at.Truncate(time.Hour).Unix()})
		}
	}
	return out
}

// tally is how many different visitors came and the hour most of them came in
// (the earliest when two tie).
func tally(list []visit) (visitors, peak int64) {
	people := map[uint64]bool{}
	hours := map[int64]map[uint64]bool{}
	for _, v := range list {
		people[v.visitor] = true
		if hours[v.hour] == nil {
			hours[v.hour] = map[uint64]bool{}
		}
		hours[v.hour][v.visitor] = true
	}
	most := 0
	for h, who := range hours {
		if len(who) > most || (len(who) == most && h < peak) {
			most, peak = len(who), h
		}
	}
	return int64(len(people)), peak
}

// brought counts the people a mention sent in [from, to). A visit from the
// mention's own page counts alone when its address can name it. Otherwise the
// visits from its host count, open ones too, except on a big shared site
// (Medium, GitHub, Reddit…), where a visit from the host says nothing about
// one post: those count only by the page, else none.
func (f *mentionFinder) brought(ctx context.Context, db *sql.DB, m sqlite.Mention, from, to time.Time) (visitors, peak int64, err error) {
	var vs []visit
	if form, ok := mentions.RefForm(m.URL); ok {
		if vs, err = pageVisits(ctx, db, m.Site, form, from, to); err != nil {
			return 0, 0, err
		}
	}
	if len(vs) == 0 && !mentions.Generic(m.Host) {
		if vs, err = hostVisits(ctx, db, m.Site, m.Host, from, to); err != nil {
			return 0, 0, err
		}
		if f.open != nil {
			vs = append(vs, openVisits(f.open(m.Site), m.Host, from, to)...)
		}
	}
	visitors, peak = tally(vs)
	return visitors, peak, nil
}

// window is the stretch of time whose visits a mention gets: from ten minutes
// before it was posted, or from where the one before it from the same host
// stopped, to two days after, or to where the next one from that host begins,
// and never past now. Each visit goes to one mention: the same traffic is
// never counted, or alerted, twice. host lists every mention of that host.
func window(m sqlite.Mention, host []sqlite.Mention, now time.Time) (from, to time.Time) {
	posted := time.Unix(m.PostedAt, 0)
	from, to = posted.Add(-mentionBefore), posted.Add(mentionAfter)
	for _, o := range host {
		if o.ID == m.ID {
			continue
		}
		at := time.Unix(o.PostedAt, 0)
		if o.PostedAt > m.PostedAt || (o.PostedAt == m.PostedAt && o.ID > m.ID) {
			to = minTimes(to, at) // the next one takes the visitors after it
		} else {
			from = maxTimes(from, minTimes(at.Add(mentionAfter), posted)) // the one before had them until now
		}
	}
	return from, minTimes(to, now)
}

func minTimes(a, b time.Time) time.Time {
	if b.Before(a) {
		return b
	}
	return a
}

func maxTimes(a, b time.Time) time.Time {
	if b.After(a) {
		return b
	}
	return a
}

// score counts what each mention brought: the visitors from its host in its
// window (see window). Mentions stay counted for two days; after that they
// keep their last number.
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
		var host []sqlite.Mention
		if sib, err := f.st.MentionsOfHost(ctx, m.Site, m.Host, m.PostedAt-int64(mentionAfter.Seconds())); err == nil {
			host = sib
		}
		from, to := window(m, host, now)
		var visitors, peak int64
		if to.After(from) {
			if visitors, peak, err = f.brought(ctx, db, m, from, to); err != nil {
				slog.Warn("mentions: not counted", "site", m.Site, "err", err)
				continue
			}
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
	msg := fmt.Sprintf("%s was mentioned on %s: %q.", site.Domain, where, mailkit.Short(m.Title, 120))
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
	ev.Email = mentionEmail(site.Domain, title, where, m, link)
	ev.Data = map[string]any{"source": m.Source, "url": m.URL, "visitors": m.Visitors, "front": m.Front}
	return ev
}

// mentionMark is where a mention was made, as the email names it, and the
// source's own tile: drawn, not fetched.
func mentionMark(m sqlite.Mention, where string) (string, mailkit.Mark) {
	source, mark := where, mailkit.Mark{Letter: "N", Color: "#5b6573"}
	switch m.Source {
	case mentions.HN:
		mark = mailkit.Mark{Letter: "Y", Color: "#ff6600"}
	case mentions.PH:
		mark = mailkit.Mark{Letter: "P", Color: "#da552f"}
	default:
		if m.Host != "" {
			source = m.Host
			mark.Letter = strings.ToUpper(string([]rune(m.Host)[0]))
		}
	}
	return source, mark
}

// mentionEmail is the mention as a designed email: what it brought, and a
// quote card of where the site was named, with the source's own mark.
func mentionEmail(domain, title, where string, m sqlite.Mention, link string) *mailkit.Email {
	e := &mailkit.Email{Preheader: mailkit.Cut(m.Title, 120), Foot: mailkit.Foot{Note: "You get this when a mention brings people to your site."}}
	e.Blocks = []mailkit.Block{mailkit.Heading{Eyebrow: title, Title: domain}}
	var front *mailkit.Badge
	if m.Front {
		front = &mailkit.Badge{Text: "On the front page", Tone: mailkit.Celebrate, Dot: true}
	}
	switch {
	case m.Visitors > 0:
		e.Blocks = append(e.Blocks, mailkit.Hero{Tone: mailkit.Celebrate, Badge: front, Big: mailkit.Number(m.Visitors), Unit: "visitors", Line: "came from it so far"})
	case front != nil:
		e.Blocks = append(e.Blocks, *front)
	}
	source, mark := mentionMark(m, where)
	var meta []string
	if m.Author != "" {
		meta = append(meta, "by "+m.Author)
	}
	if m.Points > 0 {
		meta = append(meta, fmt.Sprintf("%d points", m.Points))
	}
	if m.Comments > 0 {
		meta = append(meta, fmt.Sprintf("%d comments", m.Comments))
	}
	e.Blocks = append(e.Blocks,
		mailkit.Quote{Mark: mark, Source: source, Meta: strings.Join(meta, " · "), Title: mailkit.Cut(m.Title, 160), Text: mailkit.Cut(m.Snippet, 280), URL: m.URL},
		mailkit.Button{Label: "See it on your dashboard", URL: link})
	return e
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
