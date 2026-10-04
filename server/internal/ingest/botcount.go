package ingest

import (
	"sort"
	"sync"
	"time"
)

// What kind of automation was turned away. Counted, never described: no user
// agent and no address is kept, only how many.
const (
	BotOther    = "bot"        // a robot, a script, a client that names no browser
	BotAI       = "ai-crawler" // an AI company's crawler
	BotHeadless = "headless"   // a browser driven by a program, or a testing tool
	BotHosting  = "hosting"    // a visit from a data centre, with strict filtering on
)

// BotCount is the number of visits of one kind turned away for a site on one
// UTC day.
type BotCount struct {
	Site string
	Day  string // YYYY-MM-DD, UTC
	Kind string
	N    uint64
}

type botKey struct{ site, day, kind string }

// BotCounts holds what has been turned away since it was last drained. The
// zero value is ready. It lives in memory and is written out once a minute
// (and at shutdown): a crash loses at most that minute of a number nobody is
// billed or charged by.
type BotCounts struct {
	mu sync.Mutex
	m  map[botKey]uint64
}

// Add counts one turned-away visit for a site, on the UTC day of at.
func (b *BotCounts) Add(site string, at time.Time, kind string) {
	b.add(botKey{site, at.UTC().Format(time.DateOnly), kind}, 1)
}

func (b *BotCounts) add(k botKey, n uint64) {
	b.mu.Lock()
	if b.m == nil {
		b.m = map[botKey]uint64{}
	}
	b.m[k] += n
	b.mu.Unlock()
}

// Drain returns everything counted so far and starts again from nothing, so
// each visit is handed over exactly once. A write that fails gives its rows
// back with Restore.
func (b *BotCounts) Drain() []BotCount {
	b.mu.Lock()
	m := b.m
	b.m = nil
	b.mu.Unlock()
	out := make([]BotCount, 0, len(m))
	for k, n := range m {
		out = append(out, BotCount{k.site, k.day, k.kind, n})
	}
	sort.Slice(out, func(i, j int) bool {
		a, c := out[i], out[j]
		if a.Site != c.Site {
			return a.Site < c.Site
		}
		if a.Day != c.Day {
			return a.Day < c.Day
		}
		return a.Kind < c.Kind
	})
	return out
}

// Restore puts drained counts back after a write that did not happen.
func (b *BotCounts) Restore(rows []BotCount) {
	for _, r := range rows {
		b.add(botKey{r.Site, r.Day, r.Kind}, r.N)
	}
}
