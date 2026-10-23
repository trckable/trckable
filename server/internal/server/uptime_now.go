package server

import (
	"context"
	"errors"
	"net"
	"sync"
	"time"
)

// recheckEvery is the least time between two unscheduled looks at one site.
const recheckEvery = 5 * time.Minute

// recheckGate lets one unscheduled look per site through in each recheckEvery.
type recheckGate struct {
	mu   sync.Mutex
	last map[string]time.Time
}

// allow says whether a look at the site may happen at now, and counts it if so.
func (g *recheckGate) allow(site string, now time.Time) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if at, ok := g.last[site]; ok && now.Sub(at) < recheckEvery {
		return false
	}
	if g.last == nil {
		g.last = map[string]time.Time{}
	}
	g.last[site] = now
	return true
}

// probeNow looks at a site's homepage now, off the schedule, without making
// the caller wait. force skips the gate (a changed domain); otherwise at most
// one look per site in recheckEvery.
func (s *Server) probeNow(site string, force bool) {
	if s.cfg.UptimeEvery <= 0 {
		return
	}
	p := s.nowProber()
	if !force && !s.rechecks.allow(site, p.now()) {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		row, err := p.st.SiteRowOf(ctx, site)
		if err != nil {
			return
		}
		p.probe(ctx, row)
	}()
}

// nowProber is the prober the unscheduled looks share.
func (s *Server) nowProber() *prober {
	s.nowOnce.Do(func() { s.nowP = s.newProber() })
	return s.nowP
}

// domainExists says whether a name is in DNS. Only a clear "not found" says
// no: a slow or failing lookup must not keep anyone from their own address.
func domainExists(ctx context.Context, host string) bool {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	_, err := net.DefaultResolver.LookupHost(ctx, host)
	var dns *net.DNSError
	return !(errors.As(err, &dns) && dns.IsNotFound)
}
