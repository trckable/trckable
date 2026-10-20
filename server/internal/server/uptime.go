package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"io"
	"log/slog"
	"net"
	"net/http"
	neturl "net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/notice"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The light uptime probe: every few minutes (TRCKABLE_UPTIME_EVERY, 0 is
// off) one GET of each site's homepage, nothing else: no scripts, a small
// body read, redirects followed. A final answer from the site (2xx, 3xx, and
// an auth wall, 401 or 407) is up; no answer, a failed lookup or handshake, a
// timeout or a 5xx or other 4xx such as 404 is down; a block or challenge from a firewall (403, 429, a
// challenge page) is neither: we cannot look, which says nothing about the
// site's visitors. A site is down after two failed probes in a row and up
// again after one good one; blocked looks change neither. The daily install
// check (checks.go) is separate and looks for the snippet.

const (
	probeTimeout = 10 * time.Second
	probeWorkers = 8
	probeBody    = 16 << 10 // enough to let the server finish its answer and to see a challenge page
)

// prober looks at the sites. Its parts are fields so tests can fake the
// network and the clock.
type prober struct {
	st      *sqlite.Store
	every   time.Duration
	workers int
	now     func() time.Time
	sleep   func(ctx context.Context, d time.Duration)
	get     func(ctx context.Context, url string) (look, error)
	refused func(ctx context.Context, url string) bool
	// changed hears about each probe once it is recorded.
	changed func(ctx context.Context, site sqlite.SiteRow, before, after sqlite.SiteProbe)
}

func (s *Server) newProber() *prober {
	client := alerts.SafeClient(probeTimeout)
	p := &prober{
		st: s.ctl, every: s.cfg.UptimeEvery, workers: probeWorkers, now: time.Now,
		sleep: func(ctx context.Context, d time.Duration) {
			select {
			case <-ctx.Done():
			case <-time.After(d):
			}
		},
		get: func(ctx context.Context, url string) (look, error) {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
			if err != nil {
				return look{}, err
			}
			req.Header.Set("User-Agent", "trckable-uptime/"+Version)
			res, err := client.Do(req)
			if err != nil {
				return look{}, err
			}
			defer res.Body.Close()
			body, _ := io.ReadAll(io.LimitReader(res.Body, probeBody))
			return look{
				Status: res.StatusCode, Body: string(body),
				Challenged: strings.EqualFold(res.Header.Get("Cf-Mitigated"), "challenge"),
			}, nil
		},
		refused: refusedAddress,
	}
	p.changed = s.probed
	return p
}

// refusedAddress says whether an address is one this server will not call
// (this machine, a private network).
func refusedAddress(ctx context.Context, url string) bool {
	return errors.Is(alerts.CheckTarget(ctx, url), alerts.ErrUnsafeTarget)
}

// runUptime probes every site once per period, each at its own moment inside
// it so a thousand sites are not looked at in the same second.
func (s *Server) runUptime(ctx context.Context) {
	if s.cfg.UptimeEvery <= 0 {
		return
	}
	p := s.newProber()
	for ctx.Err() == nil {
		started := p.now()
		p.round(ctx)
		p.sleep(ctx, p.every-p.now().Sub(started))
	}
}

// offset is where in the period a site is looked at: stable for a site, and
// spread evenly over the sites.
func offset(site string, every time.Duration) time.Duration {
	h := fnv.New32a()
	h.Write([]byte(site))
	return time.Duration(uint64(every) * uint64(h.Sum32()) / (1 << 32)) //nolint:gosec // a duration is never negative
}

// round looks at every site once, each at its offset, with at most
// `workers` looks going at the same time.
func (p *prober) round(ctx context.Context) {
	sites, err := p.st.AllSites(ctx)
	if err != nil {
		slog.Warn("uptime probe failed", "err", err)
		return
	}
	// Sites come in the order they were made; wait for them in the order of
	// their moments, or most looks would pile up at the end of the period.
	sort.SliceStable(sites, func(i, j int) bool {
		return offset(sites[i].ID, p.every) < offset(sites[j].ID, p.every)
	})
	began := p.now()
	slots := make(chan struct{}, p.workers)
	var wg sync.WaitGroup
	for _, site := range sites {
		if wait := offset(site.ID, p.every) - p.now().Sub(began); wait > 0 {
			p.sleep(ctx, wait)
		}
		select {
		case <-ctx.Done():
			wg.Wait()
			return
		case slots <- struct{}{}:
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() { <-slots }()
			p.probe(ctx, site)
		}()
	}
	wg.Wait()
}

// bareHostname says whether a stored domain is only a hostname: no port, login,
// path or query.
func bareHostname(d string) bool {
	return d != "" && !strings.ContainsAny(d, " /:@?#\\[]%")
}

// probe looks at one site and records what it found. An address this server
// will not call (a private one) is not looked at, and is not down.
func (p *prober) probe(ctx context.Context, site sqlite.SiteRow) {
	if !bareHostname(site.Domain) {
		return // a port, login or query would aim the look somewhere else
	}
	url := (&neturl.URL{Scheme: "https", Host: site.Domain, Path: "/"}).String()
	if p.refused(ctx, url) {
		return
	}
	pctx, cancel := context.WithTimeout(ctx, probeTimeout)
	began := time.Now()
	l, err := p.get(pctx, url)
	ms := int(time.Since(began).Milliseconds())
	cancel()
	if ctx.Err() != nil {
		return
	}
	if err != nil && errors.Is(err, alerts.ErrUnsafeTarget) {
		return // redirected somewhere private
	}
	var before, after sqlite.SiteProbe
	if classify(l, err) == outcomeBlocked {
		before, after, err = p.st.RecordBlocked(ctx, site.ID, p.now().Unix(), l.Status, ms)
	} else {
		before, after, err = p.st.RecordProbe(ctx, site.ID, p.now().Unix(), l.Status, ms, probeCause(l.Status, err))
	}
	if err != nil {
		slog.Warn("uptime probe not saved", "site", site.ID, "err", err)
		return
	}
	p.changed(ctx, site, before, after)
}

// look is what one GET of the homepage answered.
type look struct {
	Status     int
	Body       string // the first bytes of the answer
	Challenged bool   // Cf-Mitigated: challenge
}

type outcome int

const (
	outcomeUp outcome = iota
	outcomeDown
	outcomeBlocked
)

// challengeMarks are what the challenge and block pages of the common
// firewalls say in their body.
var challengeMarks = []string{
	"just a moment...", "cf-chl", "challenge-platform", "attention required! | cloudflare",
	"checking your browser", "_incapsula_", "incapsula incident", "pardon our interruption",
	"captcha-delivery.com", "px-captcha",
}

// classify says what a look means. Up: the site answered. Down: nothing
// answered, or a server error (Cloudflare's 520 to 526 included). Blocked: a
// firewall refused or challenged our check (403, 429, a challenge header or
// page), which is not the site failing.
func classify(l look, err error) outcome {
	switch {
	case err != nil:
		return outcomeDown
	case l.Challenged, l.Status == http.StatusForbidden, l.Status == http.StatusTooManyRequests:
		return outcomeBlocked
	case l.Status == http.StatusServiceUnavailable && challengePage(l.Body):
		return outcomeBlocked
	case l.Status == http.StatusUnauthorized, l.Status == http.StatusProxyAuthRequired:
		return outcomeUp // an auth wall: the server answers
	case l.Status >= 400 || l.Status < 200:
		return outcomeDown
	}
	return outcomeUp
}

func challengePage(body string) bool {
	body = strings.ToLower(body)
	for _, m := range challengeMarks {
		if strings.Contains(body, m) {
			return true
		}
	}
	return false
}

// probeCause says in plain words why a look failed; empty when it did not.
func probeCause(status int, err error) string {
	var dns *net.DNSError
	switch {
	case err == nil && (status >= 200 && status < 400 || status == http.StatusUnauthorized || status == http.StatusProxyAuthRequired):
		return ""
	case err == nil:
		return fmt.Sprintf("Your homepage answered %d", status)
	case errors.As(err, &dns) && dns.IsNotFound:
		return "DNS name not found"
	case errors.Is(err, context.DeadlineExceeded) || isTimeout(err):
		return fmt.Sprintf("No answer within %d seconds", int(probeTimeout.Seconds()))
	}
	return "The server could not be reached"
}

func isTimeout(err error) bool {
	var ne net.Error
	return errors.As(err, &ne) && ne.Timeout()
}

// probed brings the site's incident up to date after a probe and tells its
// "tracking stopped" alerts the moment the site goes down or comes back:
// once each, since only the change is told.
func (s *Server) probed(ctx context.Context, site sqlite.SiteRow, before, after sqlite.SiteProbe) {
	// The incident is the dashboard's record; the alert is the person's news.
	// One failing never keeps the other from happening.
	s.stepSiteIncident(ctx, site, after)
	switch {
	case !before.Down() && after.Down():
		s.tellProbe(ctx, site, "down", "Your site isn't answering our checks", downMessage(site.Timezone, after), before, after)
	case before.Down() && after.Failures == 0:
		s.tellProbe(ctx, site, "up", "Your site is back", fmt.Sprintf("%s answers again after %s.", site.Domain, plainDuration(after.At-before.DownSince)), before, after)
	}
}

// stepSiteIncident brings the site's incident up to date after a probe.
func (s *Server) stepSiteIncident(ctx context.Context, site sqlite.SiteRow, after sqlite.SiteProbe) {
	c, err := s.ctl.CheckOf(ctx, site.ID)
	if err != nil {
		slog.Warn("incident check failed", "site", site.ID, "err", err)
		return
	}
	var h history
	if st := s.duck.Load(); st != nil {
		h = duckHistory{st.DB}
	}
	siteCtx, cancel := context.WithTimeout(ctx, siteWork)
	defer cancel()
	if err := stepIncident(siteCtx, s.ctl, h, site.ID, site.LastEventAt, c, after, after.At); err != nil {
		slog.Warn("incident check failed", "site", site.ID, "err", err)
	}
}

// probeForm is the outbox row of a site going down or coming back. Who is told
// is looked up when it is delivered, and a lookup that fails makes the row be
// tried again, so the change is not lost: the site will not go down twice.
const probeForm = "probe"

// probeSite is the part of a site a probe row keeps: what the words need, and
// nothing that opens the site (not its proxy key).
type probeSite struct {
	ID       string `json:"id"`
	Domain   string `json:"domain"`
	Timezone string `json:"timezone"`
}

// probeNotice is what a probe row keeps.
type probeNotice struct {
	Site    probeSite        `json:"site"`
	Kind    string           `json:"kind"`
	Title   string           `json:"title"`
	Message string           `json:"message"`
	Before  sqlite.SiteProbe `json:"before"`
	After   sqlite.SiteProbe `json:"after"`
}

// tellProbe tells the site's "tracking stopped" alerts, by the same mail or
// webhook as a site that went quiet, that it went down or is back. It does
// not mark them as fired: their own cadence is theirs.
func (s *Server) tellProbe(ctx context.Context, site sqlite.SiteRow, kind, title, message string, before, p sqlite.SiteProbe) {
	body, err := json.Marshal(probeNotice{Site: probeSite{ID: site.ID, Domain: site.Domain, Timezone: site.Timezone}, Kind: kind, Title: title, Message: message, Before: before, After: p})
	if err == nil {
		account, _ := s.ctl.SiteAccount(ctx, site.ID) // without one, the row is just not tied to an account
		err = s.notices.Queue(ctx, sqlite.OutboxRow{Key: fmt.Sprintf("probe:%s:%s:%d", site.ID, kind, p.At), Account: account, Kind: kind, Form: probeForm, Body: string(body)})
	}
	if err != nil {
		slog.Warn("alert not kept", "kind", kind, "site", site.ID)
	}
}

// deliverProbe writes the message for each of the site's "tracking stopped"
// alerts. Each goes out and is retried on its own; this row is done once they
// are all written.
func (s *Server) deliverProbe(ctx context.Context, r sqlite.OutboxRow) error {
	var n probeNotice
	if err := json.Unmarshal([]byte(r.Body), &n); err != nil {
		return err
	}
	list, err := s.ctl.LiveAlerts(ctx)
	if err != nil {
		return err
	}
	for _, a := range list {
		if a.SiteID != n.Site.ID || a.Kind != "stopped" {
			continue
		}
		ev := alerts.Event{Kind: n.Kind, Site: n.Site.ID, Domain: n.Site.Domain, At: time.Unix(n.After.At, 0), Title: n.Title, Message: n.Message,
			Data: map[string]any{"status": n.After.Status, "down_since": n.After.DownSince}}
		s.probeWords(&ev, sqlite.SiteRow{ID: n.Site.ID, Domain: n.Site.Domain, Timezone: n.Site.Timezone}, n.Before, n.After)
		ev.Unsubscribe = s.stopLink(a.ID)
		ev.Settings = s.settingsLink(n.Site.ID)
		if err := s.notices.Alert(ctx, r.Account, r.Key+"/"+a.ID, n.Kind, a.Target, ev); err != nil {
			if !errors.Is(err, notice.ErrNoMail) {
				return err // not kept: this row is tried again, and the ones already kept are not written twice
			}
			slog.Warn("alert not delivered", "kind", n.Kind, "err", err) // never deliverable: the others still go
		}
	}
	return nil
}

// downMessage is the down alert's text: the same words as the bar on the
// site's pages in the dashboard.
func downMessage(tz string, p sqlite.SiteProbe) string {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	return fmt.Sprintf("Your site isn't answering our checks since %s (%s). Some visitors still get through, which is why you may still see people online.",
		time.Unix(p.DownSince, 0).In(loc).Format("15:04"), p.Error)
}

// plainDuration is a stretch in the words an email uses.
func plainDuration(secs int64) string {
	m := max(secs, 0) / 60
	switch {
	case m < 1:
		return "under a minute"
	case m == 1:
		return "1 minute"
	case m < 60:
		return fmt.Sprintf("%d minutes", m)
	case m < 48*60:
		h := fmt.Sprintf("%d hours", m/60)
		if m/60 == 1 {
			h = "1 hour"
		}
		if m%60 == 0 {
			return h
		}
		return fmt.Sprintf("%s %d minutes", h, m%60)
	}
	return fmt.Sprintf("%d days", m/(24*60))
}
