package api

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
)

// Referrer icons: the small picture of a site beside its name in Sources.
// The visitor's browser never asks that site, or anyone else, for it: this
// server fetches it once, through the guard alerts use (public hosts only,
// every connection checked, size and time limited), keeps it in a small cache
// and serves it from here. A site without a usable icon is remembered for a
// day, and the dashboard draws an initial instead.

// refIconClient is the guarded client the fetches use; tests swap it so they
// never reach the internet.
var refIconClient = func() *http.Client { return alerts.SafeClient(6 * time.Second) }

const (
	maxRefIconHosts  = 12  // hosts one request may ask about: a list's rows
	refIconEntries   = 300 // the cache holds at most this many answers
	refIconKeep      = 7 * 24 * time.Hour
	refIconMissKeep  = 24 * time.Hour
	refIconFetches   = 4               // at most this many fetches at once, instance-wide
	refIconNew       = 60              // new hosts looked up per minute, instance-wide
	refIconWait      = 4 * time.Second // how long a request waits for the fetches it started
	refIconFetchTime = 10 * time.Second
)

type refIcon struct {
	typ  string // "" = this host has no icon we can use
	data []byte
	at   time.Time
}

// refIcons is the cache, bounded in entries and (through the icon size limit)
// in bytes. The oldest answer goes first.
type refIcons struct {
	mu      sync.Mutex
	m       map[string]*refIcon
	order   []string
	pending map[string]chan struct{} // hosts being fetched now
	slots   chan struct{}
}

func newRefIcons() *refIcons {
	return &refIcons{m: map[string]*refIcon{}, pending: map[string]chan struct{}{}, slots: make(chan struct{}, refIconFetches)}
}

// get returns what is known about a host: its answer, and whether there is one.
func (c *refIcons) get(host string, now time.Time) (*refIcon, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[host]
	if !ok {
		return nil, false
	}
	keep := refIconKeep
	if e.typ == "" {
		keep = refIconMissKeep
	}
	if now.Sub(e.at) > keep {
		return nil, false
	}
	return e, true
}

func (c *refIcons) put(host string, e *refIcon) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.m[host]; !ok {
		c.order = append(c.order, host)
		if len(c.order) > refIconEntries {
			delete(c.m, c.order[0])
			c.order = c.order[1:]
		}
	}
	c.m[host] = e
}

// label is one DNS label.
var refLabel = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

// refHost cleans a referring site's name into a host this server may look up:
// plain DNS labels with a dot and a letters-only ending, so no address, no
// port, no path, no credentials and no single-label internal name.
func refHost(s string) (string, bool) {
	h := strings.ToLower(strings.TrimSpace(s))
	if len(h) > 253 {
		return "", false
	}
	labels := strings.Split(h, ".")
	if len(labels) < 2 {
		return "", false
	}
	for _, l := range labels {
		if !refLabel.MatchString(l) {
			return "", false
		}
	}
	if tld := labels[len(labels)-1]; len(tld) < 2 || strings.ContainsAny(tld, "0123456789-") || tld == "local" || tld == "internal" || tld == "localhost" || tld == "test" {
		return "", false
	}
	return h, true
}

// fetchRefIcon asks a site's home page for its icons and takes the first usable
// one, then the two places browsers look by themselves. The answer is the
// image, or nothing.
func fetchRefIcon(ctx context.Context, client *http.Client, home string) (typ string, data []byte) {
	named, _ := declaredIcons(ctx, client, home)
	for _, u := range append(named, home+"favicon.ico", home+"apple-touch-icon.png") {
		if b, ok := getIcon(ctx, client, u); ok {
			return iconType(b), b
		}
	}
	return "", nil
}

// lookup fetches a host's icon in the background (one fetch per host at a
// time, a few at once, a few new hosts a minute) and returns a channel that
// closes when its answer is cached. A busy server returns nil: the host is
// asked about again next time.
func (a *API) lookup(host string) <-chan struct{} {
	c := a.refIcons
	c.mu.Lock()
	if done, ok := c.pending[host]; ok {
		c.mu.Unlock()
		return done
	}
	select {
	case c.slots <- struct{}{}:
	default:
		c.mu.Unlock()
		return nil
	}
	if !a.loginRate.allow("referrer-icons", a.Now(), refIconNew, time.Minute) {
		<-c.slots
		c.mu.Unlock()
		return nil
	}
	done := make(chan struct{})
	c.pending[host] = done
	c.mu.Unlock()
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), refIconFetchTime)
		defer cancel()
		typ, data := fetchRefIcon(ctx, refIconClient(), "https://"+host+"/")
		c.put(host, &refIcon{typ: typ, data: data, at: a.Now()})
		c.mu.Lock()
		delete(c.pending, host)
		c.mu.Unlock()
		<-c.slots
		close(done)
	}()
	return done
}

// referrerIcons serves GET /api/v1/referrer-icons?host=a.com&host=b.org: which
// of those sites have an icon here. Hosts not known yet are fetched now; the
// answer waits a few seconds for them, and the rest arrive on the next ask.
func (a *API) referrerIcons(w http.ResponseWriter, r *http.Request) {
	if principalOf(r).user == nil {
		fail(w, http.StatusForbidden, "an API key reads reports only")
		return
	}
	asked := r.URL.Query()["host"]
	if len(asked) > maxRefIconHosts {
		fail(w, http.StatusBadRequest, "ask about at most 12 sites")
		return
	}
	var waits []<-chan struct{}
	for _, s := range asked {
		if h, ok := refHost(s); ok {
			if _, known := a.refIcons.get(h, a.Now()); !known {
				if done := a.lookup(h); done != nil {
					waits = append(waits, done)
				}
			}
		}
	}
	timeout := time.After(refIconWait)
	for _, done := range waits {
		select {
		case <-done:
		case <-timeout:
		case <-r.Context().Done():
		}
	}
	out := []string{}
	for _, s := range asked {
		if h, ok := refHost(s); ok {
			if e, known := a.refIcons.get(h, a.Now()); known && e.typ != "" {
				out = append(out, s)
			}
		}
	}
	w.Header().Set("Cache-Control", "private, max-age=300")
	writeJSON(w, http.StatusOK, map[string]any{"icons": out})
}

// referrerIcon serves GET /api/v1/referrer-icons/{host}: the picture, only
// from what is already kept. The dashboard asks for the ones the list above
// named, so this never reaches out.
func (a *API) referrerIcon(w http.ResponseWriter, r *http.Request) {
	if principalOf(r).user == nil {
		fail(w, http.StatusForbidden, "an API key reads reports only")
		return
	}
	h, ok := refHost(r.PathValue("host"))
	if !ok {
		fail(w, http.StatusNotFound, "no icon")
		return
	}
	e, known := a.refIcons.get(h, a.Now())
	if !known || e.typ == "" {
		fail(w, http.StatusNotFound, "no icon")
		return
	}
	w.Header().Set("Content-Type", e.typ)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=86400")
	_, _ = w.Write(e.data)
}
