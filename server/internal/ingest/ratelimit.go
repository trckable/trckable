package ingest

import (
	"hash/fnv"
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

type limiter struct {
	rate   float64 // tokens per second
	burst  float64
	shards [64]struct {
		sync.Mutex
		m map[uint64]*bucket
	}
}

type bucket struct {
	tokens float64
	last   time.Time
}

func newLimiter(rate, burst float64) *limiter {
	l := &limiter{rate: rate, burst: burst}
	for i := range l.shards {
		l.shards[i].m = make(map[uint64]*bucket)
	}
	return l
}

func (l *limiter) allow(key string, now time.Time) bool {
	h := fnv.New64a()
	h.Write([]byte(key))
	k := h.Sum64()
	s := &l.shards[k%uint64(len(l.shards))]
	s.Lock()
	defer s.Unlock()
	b, ok := s.m[k]
	if !ok {
		if len(s.m) > 50_000 { // bound memory: drop idle buckets
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
