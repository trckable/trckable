package server

import (
	"context"
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
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The light uptime probe: every few minutes (TRCKABLE_UPTIME_EVERY, 0 is
// off) one GET of each site's homepage, nothing else: no scripts, a small
// body read, redirects followed. A final 2xx or 3xx is up. A site is down
// after two failed probes in a row and up again after one good one. The
// daily install check (checks.go) is separate and looks for the snippet.

const (
	probeTimeout = 10 * time.Second
	probeWorkers = 8
	probeBody    = 4 << 10 // enough to let the server finish its answer
)

// prober looks at the sites. Its parts are fields so tests can fake the
// network and the clock.
type prober struct {
	st      *sqlite.Store
	every   time.Duration
	workers int
	now     func() time.Time
	sleep   func(ctx context.Context, d time.Duration)
	get     func(ctx context.Context, url string) (int, error)
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
		get: func(ctx context.Context, url string) (int, error) {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
			if err != nil {
				return 0, err
			}
			req.Header.Set("User-Agent", "trckable-uptime/"+Version)
			res, err := client.Do(req)
			if err != nil {
				return 0, err
			}
			defer res.Body.Close()
			_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, probeBody))
			return res.StatusCode, nil
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
	status, err := p.get(pctx, url)
	ms := int(time.Since(began).Milliseconds())
	cancel()
	if ctx.Err() != nil {
		return
	}
	if err != nil && errors.Is(err, alerts.ErrUnsafeTarget) {
		return // redirected somewhere private
	}
	cause := probeCause(status, err)
	before, after, err := p.st.RecordProbe(ctx, site.ID, p.now().Unix(), status, ms, cause)
	if err != nil {
		slog.Warn("uptime probe not saved", "site", site.ID, "err", err)
		return
	}
	p.changed(ctx, site, before, after)
}

// probeCause says in plain words why a look failed; empty when it did not.
func probeCause(status int, err error) string {
	var dns *net.DNSError
	switch {
	case err == nil && status >= 200 && status < 400:
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
	switch {
	case !before.Down() && after.Down():
		s.tellProbe(ctx, site, "down", "Your site isn't answering our checks", downMessage(site.Timezone, after), after)
	case before.Down() && after.Failures == 0:
		s.tellProbe(ctx, site, "up", "Your site is back", fmt.Sprintf("%s answers again after %s.", site.Domain, plainDuration(after.At-before.DownSince)), after)
	}
}

// tellProbe sends one message to the site's "tracking stopped" alerts, the
// same mail or webhook as a site that went quiet. It does not mark them as
// fired: their own cadence is theirs.
func (s *Server) tellProbe(ctx context.Context, site sqlite.SiteRow, kind, title, message string, p sqlite.SiteProbe) {
	list, err := s.ctl.LiveAlerts(ctx)
	if err != nil {
		return
	}
	for _, a := range list {
		if a.SiteID != site.ID || a.Kind != "stopped" {
			continue
		}
		ev := alerts.Event{Kind: kind, Site: site.ID, Domain: site.Domain, At: time.Unix(p.At, 0), Title: title, Message: message,
			Data: map[string]any{"status": p.Status, "down_since": p.DownSince}}
		ev.Unsubscribe = s.stopLink(a.ID)
		ev.Settings = s.settingsLink(site.ID)
		if err := alerts.Send(ctx, a.Target, ev); err != nil {
			slog.Warn("alert not delivered", "kind", kind, "err", err)
			continue
		}
		slog.Info("alert sent", "kind", kind, "site", site.ID)
	}
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
