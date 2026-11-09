package api

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
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
// the same name again does not fetch again.
type faviconCache struct {
	mu sync.Mutex
	m  map[string]faviconEntry
}

var previewDomain = regexp.MustCompile(`^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

// cachedFavicon is findFavicon with the per-domain memory in front.
func (a *API) cachedFavicon(ctx context.Context, domain string) []byte {
	now := a.Now()
	c := &a.favicons
	c.mu.Lock()
	e, ok := c.m[domain]
	c.mu.Unlock()
	if ok {
		ttl := faviconMiss
		if e.data != nil {
			ttl = faviconKeep
		}
		if now.Sub(e.at) < ttl {
			return e.data
		}
	}
	data, _ := a.findFavicon(ctx, domain)
	c.mu.Lock()
	if c.m == nil || len(c.m) >= faviconMax {
		c.m = map[string]faviconEntry{}
	}
	c.m[domain] = faviconEntry{data: data, at: now}
	c.mu.Unlock()
	return data
}

// previewFavicon answers with the favicon of a domain that is not a site yet.
func (a *API) previewFavicon(w http.ResponseWriter, r *http.Request) {
	domain := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("domain")))
	if len(domain) > 253 || !previewDomain.MatchString(domain) {
		fail(w, http.StatusBadRequest, "that is not a domain")
		return
	}
	if !a.loginRate.allow("favicon-preview:"+principalOf(r).account, a.Now(), 30, time.Minute) {
		fail(w, http.StatusTooManyRequests, "tried many times just now: try again in a minute")
		return
	}
	data := a.cachedFavicon(r.Context(), domain)
	if data == nil {
		fail(w, http.StatusNotFound, "no favicon")
		return
	}
	w.Header().Set("Content-Type", iconType(data))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	_, _ = w.Write(data)
}

// startIcon gives a new site its favicon in the background: a failure is
// silent, since the letter is a fine mark and Settings can still set one.
func (a *API) startIcon(site, domain string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		data := a.cachedFavicon(ctx, domain)
		if data == nil {
			return
		}
		if typ := iconType(data); typ != "" {
			_ = a.Ctl.SetBrandIcon(ctx, site, typ, data)
		}
	}()
}
