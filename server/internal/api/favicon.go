package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/trckable/trckable/server/internal/permissions"
)

// The Add a site field shows the site's favicon before the site exists, and
// the new site starts with it. Both go through findFavicon (brand.go), so the
// same guard applies: public hosts only, size and time limited.

const (
	faviconKeep = time.Hour        // a found icon
	faviconMiss = 10 * time.Minute // none, or the site did not answer
	faviconMax  = 2000
)

type faviconEntry struct {
	data []byte
	at   time.Time
}

// faviconCache remembers the answer per domain, misses included, so typing
// the same name again does not fetch again. It holds at most faviconMax
// entries (the oldest go first), and at most faviconBusy fetches run at once
// on the whole instance, one per domain however many people ask.
type faviconCache struct {
	mu     sync.Mutex
	m      map[string]faviconEntry
	flight singleflight.Group
	once   sync.Once
	sem    chan struct{}
}

const faviconBusy = 8

var errFaviconBusy = errors.New("too many icon lookups at once")

var previewDomain = regexp.MustCompile(`^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

func (c *faviconCache) get(domain string, now time.Time) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[domain]
	if !ok {
		return nil, false
	}
	ttl := faviconMiss
	if e.data != nil {
		ttl = faviconKeep
	}
	if now.Sub(e.at) >= ttl {
		delete(c.m, domain)
		return nil, false
	}
	return e.data, true
}

func (c *faviconCache) put(domain string, data []byte, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil {
		c.m = map[string]faviconEntry{}
	}
	if _, have := c.m[domain]; !have && len(c.m) >= faviconMax {
		oldest, when := "", now
		for k, e := range c.m {
			if oldest == "" || e.at.Before(when) {
				oldest, when = k, e.at
			}
		}
		delete(c.m, oldest)
	}
	c.m[domain] = faviconEntry{data: data, at: now}
}

// cachedFavicon is findFavicon with the per-domain memory in front. Only an
// answer from a site that was reached is kept: a cancelled request, a site
// that did not answer or a busy instance is never remembered as "no favicon".
func (a *API) cachedFavicon(ctx context.Context, domain string) ([]byte, error) {
	c := &a.favicons
	if data, ok := c.get(domain, a.Now()); ok {
		return data, nil
	}
	c.once.Do(func() { c.sem = make(chan struct{}, faviconBusy) })
	ch := c.flight.DoChan(domain, func() (any, error) {
		select {
		case c.sem <- struct{}{}:
			defer func() { <-c.sem }()
		default:
			return nil, errFaviconBusy
		}
		// The fetch belongs to everyone waiting on it, not to the first.
		fctx := context.WithoutCancel(ctx)
		data, reached := a.findFavicon(fctx, domain)
		if reached && fctx.Err() == nil {
			c.put(domain, data, a.Now())
		}
		return data, nil
	})
	select {
	case res := <-ch:
		if res.Err != nil {
			return nil, res.Err
		}
		data, _ := res.Val.([]byte)
		return data, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// previewFavicon answers with the favicon of a domain that is not a site yet.
func (a *API) previewFavicon(w http.ResponseWriter, r *http.Request) {
	if !requireAct(w, r, permissions.ActChange, "only someone who can add a site can look up its favicon") {
		return
	}
	domain := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("domain")))
	if len(domain) > 253 || !previewDomain.MatchString(domain) {
		fail(w, http.StatusBadRequest, "that is not a domain")
		return
	}
	if !a.loginRate.allow("favicon-preview:"+principalOf(r).account, a.Now(), 30, time.Minute) ||
		!a.loginRate.allow("favicon-preview-ip:"+a.ip(r), a.Now(), 60, time.Minute) {
		fail(w, http.StatusTooManyRequests, "tried many times just now: try again in a minute")
		return
	}
	data, err := a.cachedFavicon(r.Context(), domain)
	if errors.Is(err, errFaviconBusy) {
		fail(w, http.StatusServiceUnavailable, "busy: try again in a moment")
		return
	}
	if err != nil {
		return // the person left
	}
	if data == nil {
		fail(w, http.StatusNotFound, "no favicon")
		return
	}
	w.Header().Set("Content-Type", iconType(data))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	_, _ = w.Write(data) //nolint:gosec // an image fetched from the site, sent with its own type and nosniff
}

// startIcon gives a new site its favicon in the background: a failure is
// silent, since the letter is a fine mark and Settings can still set one. An
// icon set meanwhile is kept, and a stopping server does not wait for it.
func (a *API) startIcon(site, domain string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		go func() {
			select {
			case <-a.stopping:
				cancel()
			case <-ctx.Done():
			}
		}()
		data, err := a.cachedFavicon(ctx, domain)
		if err != nil || data == nil || ctx.Err() != nil {
			return
		}
		if _, _, err := a.Ctl.BrandIcon(ctx, site); !errors.Is(err, sql.ErrNoRows) {
			return // it has one already (or the site is gone)
		}
		if typ := iconType(data); typ != "" {
			_ = a.Ctl.SetBrandIcon(ctx, site, typ, data)
		}
	}()
}
