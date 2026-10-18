package ingest

import (
	"sort"
	"sync"
	"time"
)

// Events refused for a hostname the site does not list, counted per site, day
// and hostname: only the name of the host and how many, so the setup card can
// say "visits are arriving from other.com". Bounded twice: a site keeps at most
// hostsPerSiteDay names a day, and the whole table at most hostsHeld, because
// anyone who knows a site id can post made-up names.
const (
	hostsPerSiteDay = 20
	hostsHeld       = 2000
	hostMaxLen      = 100
)

// HostCount is the number of events refused for one hostname of a site on one
// UTC day.
type HostCount struct {
	Site string
	Day  string // YYYY-MM-DD, UTC
	Host string
	N    uint64
}

type hostKey struct{ site, day, host string }

// HostCounts holds the refused hostnames since it was last drained. The zero
// value is ready. In memory, written out with the bot counts.
type HostCounts struct {
	mu     sync.Mutex
	m      map[hostKey]uint64
	perDay map[[2]string]int
}

// plainHost is a hostname worth keeping: letters, digits, dots and hyphens.
func plainHost(h string) bool {
	if h == "" || len(h) > hostMaxLen {
		return false
	}
	for _, c := range h {
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '.' || c == '-') {
			return false
		}
	}
	return true
}

// Add counts one refused event for a site, on the UTC day of at.
func (b *HostCounts) Add(site, host string, at time.Time) {
	if !plainHost(host) {
		return
	}
	k := hostKey{site, at.UTC().Format(time.DateOnly), host}
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, ok := b.m[k]; !ok {
		day := [2]string{k.site, k.day}
		if len(b.m) >= hostsHeld || b.perDay[day] >= hostsPerSiteDay {
			return
		}
		if b.m == nil {
			b.m, b.perDay = map[hostKey]uint64{}, map[[2]string]int{}
		}
		b.perDay[day]++
	}
	b.m[k]++
}

// Drain returns everything counted so far and starts again from nothing.
func (b *HostCounts) Drain() []HostCount {
	b.mu.Lock()
	m := b.m
	b.m, b.perDay = nil, nil
	b.mu.Unlock()
	out := make([]HostCount, 0, len(m))
	for k, n := range m {
		out = append(out, HostCount{k.site, k.day, k.host, n})
	}
	sort.Slice(out, func(i, j int) bool {
		a, c := out[i], out[j]
		if a.Site != c.Site {
			return a.Site < c.Site
		}
		if a.Day != c.Day {
			return a.Day < c.Day
		}
		return a.Host < c.Host
	})
	return out
}

// Restore puts drained counts back after a write that did not happen.
func (b *HostCounts) Restore(rows []HostCount) {
	for _, r := range rows {
		b.mu.Lock()
		if b.m == nil {
			b.m, b.perDay = map[hostKey]uint64{}, map[[2]string]int{}
		}
		k := hostKey{r.Site, r.Day, r.Host}
		if _, ok := b.m[k]; !ok {
			b.perDay[[2]string{r.Site, r.Day}]++
		}
		b.m[k] += r.N
		b.mu.Unlock()
	}
}
