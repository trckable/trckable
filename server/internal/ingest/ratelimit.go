package ingest

import (
	"hash/maphash"
	"sync"
	"time"
)

// limiter is a sharded token bucket keyed by (IP, visitor). Keying on both
// means many real visitors behind one office/carrier NAT are not throttled
// together, while a single abusive client is. Over the limit, ingest answers
// 429 and the tracker keeps the event queued for a later retry.
// One address may send this much to one site. Generous on purpose: an office,
// a university or a phone carrier puts thousands of real visitors behind one
// address, and so does a proxy without its key. It stops one machine from
// flooding a site, not a crowd of them.
const (
	perIPRate  = 200 // events a second
	perIPBurst = 2000
)

// A bucket nobody has touched for this long is forgotten. The limiter holds
// an address only as a keyed hash, in memory, and only for as long as that
// address is active.
const (
	idleAfter  = 10 * time.Minute
	sweepEvery = time.Minute
)

type limiter struct {
	rate  float64 // tokens per second
	burst float64
	// seed keys the hash of every address. It is random per process and never
	// leaves it, so the keys in the maps cannot be turned back into addresses
	// by hashing a list of them.
	seed maphash.Seed
	// swept is when every shard was last swept. One sweep goes through all of
	// them, so a quiet shard is cleaned by traffic on any other.
	sweepMu sync.Mutex
	swept   time.Time
	shards  [64]struct {
		sync.Mutex
		m map[uint64]*bucket
	}
}

type bucket struct {
	tokens float64
	last   time.Time
}

func newLimiter(rate, burst float64) *limiter {
	l := &limiter{rate: rate, burst: burst, seed: maphash.MakeSeed()}
	for i := range l.shards {
		l.shards[i].m = make(map[uint64]*bucket)
	}
	return l
}

// sweep forgets every bucket idle for longer than idleAfter, at most once a
// sweepEvery, whichever request happens to come first.
func (l *limiter) sweep(now time.Time) {
	l.sweepMu.Lock()
	if now.Sub(l.swept) < sweepEvery {
		l.sweepMu.Unlock()
		return
	}
	l.swept = now
	l.sweepMu.Unlock()
	for i := range l.shards {
		s := &l.shards[i]
		s.Lock()
		for k, b := range s.m {
			if now.Sub(b.last) > idleAfter {
				delete(s.m, k)
			}
		}
		s.Unlock()
	}
}

func (l *limiter) allow(key string, now time.Time) bool {
	l.sweep(now)
	k := maphash.String(l.seed, key)
	s := &l.shards[k%uint64(len(l.shards))]
	s.Lock()
	defer s.Unlock()
	b, ok := s.m[k]
	if !ok {
		if len(s.m) > 50_000 { // bound memory in a flood: drop whatever is merely quiet
			for kk, bb := range s.m {
				if now.Sub(bb.last) > time.Minute {
					delete(s.m, kk)
				}
			}
		}
		b = &bucket{tokens: l.burst, last: now}
		s.m[k] = b
	}
	b.tokens += now.Sub(b.last).Seconds() * l.rate
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}
