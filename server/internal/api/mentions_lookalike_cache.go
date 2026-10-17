package api

import (
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/mentions"
)

// The look-alike check calls a news service for each new word, so an answer
// is kept for a day (per site and word, in any case) and a site may ask for
// at most lookAlikeFresh new words an hour; more is refused until the hour passes.
const (
	lookAlikeKeep  = 24 * time.Hour
	lookAlikeFresh = 6
	lookAlikeHour  = time.Hour
	lookAlikeMax   = 2000 // answers held at once
)

type lookAlikeEntry struct {
	res mentions.LookAlike
	at  time.Time
}

type lookAlikeGate struct {
	mu    sync.Mutex
	kept  map[string]lookAlikeEntry
	fresh map[string][]time.Time // when each site asked for a word not held
}

// cached returns a held answer for a word.
func (g *lookAlikeGate) cached(site, word string, now time.Time) (mentions.LookAlike, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	e, ok := g.kept[site+"|"+strings.ToLower(word)]
	if !ok || now.Sub(e.at) >= lookAlikeKeep {
		return mentions.LookAlike{}, false
	}
	return e.res, true
}

// allow says whether the site may ask for another word now, and counts it.
func (g *lookAlikeGate) allow(site string, now time.Time) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.fresh == nil {
		g.fresh = map[string][]time.Time{}
	}
	var recent []time.Time
	for _, at := range g.fresh[site] {
		if now.Sub(at) < lookAlikeHour {
			recent = append(recent, at)
		}
	}
	if len(recent) >= lookAlikeFresh {
		g.fresh[site] = recent
		return false
	}
	g.fresh[site] = append(recent, now)
	return true
}

// keep holds an answer (only one that checked the news).
func (g *lookAlikeGate) keep(site, word string, res mentions.LookAlike, now time.Time) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.kept == nil || len(g.kept) >= lookAlikeMax {
		g.kept = map[string]lookAlikeEntry{}
	}
	g.kept[site+"|"+strings.ToLower(word)] = lookAlikeEntry{res, now}
}
