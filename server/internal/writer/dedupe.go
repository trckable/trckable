package writer

import (
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// dedupe remembers recently seen client event ids so that events retried by
// the tracker's queue (or double-sent via beacon + retry) count once.
//
// The ids are kept in a ring of generations, newest first, and the oldest one
// is dropped at each rotation. An id stays for at least (generations-1)
// periods and for less than generations periods. The tracker keeps an unsent
// event for 24 hours and ingest refuses an age above event.MaxAge (25 hours),
// so a resend can come up to 25 hours after the first copy: six generations of
// six hours remember every id for 30 to 36 hours.
//
// Memory is what that costs: about 25 bytes an id (measured, see
// TestDedupeMemoryPerID), held for up to 36 hours. A site with 100,000 events
// a day holds about 150,000 ids, under 4 MB. The total is capped at
// dedupeMaxIDs, about 200 MB, which is the most the old 30-minute window could
// hold too; it is reached by around 65 events a second all day long. Past the
// cap the ring rotates early: the window shrinks, memory does not grow, and a
// resend after the shorter window is stored twice.
const (
	dedupeGens   = 6
	dedupePeriod = 6 * time.Hour
	dedupeMaxIDs = 8_000_000 // across all generations
)

// dedupeLookBack is how far back a restart reads the stored events for ids. A
// resend can come up to event.MaxAge after the first copy was received, and a
// stored event carries the time it was made, which can be event.MaxAge before
// it was received: so events made up to twice that long ago may be the ones a
// resend is still to come for.
const dedupeLookBack = 2 * event.MaxAge

type dedupe struct {
	gens      []map[uint64]struct{} // newest first
	rotatedAt int64                 // ms, when gens[0] began
	periodMs  int64
	perGen    int // rotate early when the newest holds this many
}

func newDedupe(periodMs int64, generations, maxIDs int) *dedupe {
	d := &dedupe{
		gens:     make([]map[uint64]struct{}, generations),
		periodMs: periodMs,
		perGen:   max(1, maxIDs/generations),
	}
	for i := range d.gens {
		d.gens[i] = make(map[uint64]struct{})
	}
	return d
}

// rotate drops the oldest generation and starts a new one.
func (d *dedupe) rotate(now int64) {
	copy(d.gens[1:], d.gens[:len(d.gens)-1])
	d.gens[0] = make(map[uint64]struct{})
	d.rotatedAt = now
}

// seen reports whether id was already recorded, recording it if not.
// id 0 means "no id" (server-side events) and is never deduplicated.
func (d *dedupe) seen(id uint64, now int64) bool {
	if id == 0 {
		return false
	}
	if d.rotatedAt == 0 {
		d.rotatedAt = now
	}
	// A server that was idle for several periods rotates that many times, and
	// never more than the ring holds.
	for n := 0; n < len(d.gens) && now-d.rotatedAt >= d.periodMs; n++ {
		d.rotate(d.rotatedAt + d.periodMs)
	}
	if now-d.rotatedAt >= d.periodMs {
		d.rotatedAt = now
	}
	if len(d.gens[0]) >= d.perGen {
		d.rotate(now)
	}
	for _, g := range d.gens {
		if _, ok := g[id]; ok {
			return true
		}
	}
	d.gens[0][id] = struct{}{}
	return false
}

// size is how many ids are held.
func (d *dedupe) size() int {
	n := 0
	for _, g := range d.gens {
		n += len(g)
	}
	return n
}
