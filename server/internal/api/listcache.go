package api

import (
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/permissions"
)

// listTTL is how long a built sites list is shared. Every open dashboard polls
// the list; the window is far inside one poll, so a site going down still
// reaches the dashboard on its next one.
const listTTL = 5 * time.Second

// listCache keeps the encoded sites list per (account, who may see which
// sites, whether the proxy key shows). Anything that changes a site drops it.
type listCache struct {
	mu sync.Mutex
	m  map[string]listEntry
}

type listEntry struct {
	body []byte
	exp  time.Time
}

func (c *listCache) get(key string, now time.Time) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	if !ok || !now.Before(e.exp) {
		delete(c.m, key)
		return nil, false
	}
	return e.body, true
}

func (c *listCache) put(key string, body []byte, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil || len(c.m) > 512 {
		c.m = map[string]listEntry{}
	}
	c.m[key] = listEntry{body: body, exp: now.Add(listTTL)}
}

func (c *listCache) purge() {
	c.mu.Lock()
	defer c.mu.Unlock()
	clear(c.m)
}

// listKey is what makes two requests share a list: the same account, the same
// visible sites, and the same answer on the proxy key.
func (a *API) listKey(r *http.Request) string {
	p := principalOf(r)
	var b strings.Builder
	b.WriteString(p.account)
	if canUser(p.user, permissions.ActProxyKey) {
		b.WriteString("|k")
	}
	if p.sites != nil {
		ids := make([]string, 0, len(p.sites))
		for id, ok := range p.sites {
			if ok {
				ids = append(ids, id)
			}
		}
		sort.Strings(ids)
		b.WriteString("|only|" + strings.Join(ids, ","))
	}
	return b.String()
}
