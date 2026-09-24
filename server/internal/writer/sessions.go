package writer

import (
	"hash/fnv"
	"strconv"
	"sync"

	"github.com/trckable/trckable/server/internal/event"
)

const (
	// SessionTimeout is the inactivity gap that starts a new session.
	SessionTimeout int64 = 30 * 60 * 1000 // ms
	// DefaultCloseAfter is how long a session stays open in memory after its
	// last event before it is written to the sessions table. It is longer than
	// the timeout so late retries (the tracker queues for up to 30 min) still
	// land in the right session.
	DefaultCloseAfter int64 = 60 * 60 * 1000 // ms
)

type visitorKey struct {
	site    string
	visitor uint64
}

// Session is one visit's rollup: one row in the sessions table. Session-level
// dimensions come from the ENTRY pageview (so SPA navigations never turn a
// Search visit into a Direct one).
type Session struct {
	Site      string
	ID        uint64
	Visitor   uint64
	Start     int64 // ms
	Last      int64 // ms
	FirstSeen int64 // ms, 0 = unknown

	Channel, Referrer, EntryPage, ExitPage string
	Campaign, Source, Medium               string
	Country, Region, City                  string
	Device, Browser, OS, Language          string

	Pageviews uint32
	Goals     uint32
	lastPV    int64             // ts of the latest pageview (for the exit page)
	eng       map[uint64]uint32 // pageview → max engaged ms (running totals)
}

// EngagedMs sums the per-pageview maximums.
func (s *Session) EngagedMs() uint64 {
	var t uint64
	for _, v := range s.eng {
		t += uint64(v)
	}
	return t
}

// DurationS is max(last−start, engaged time).
func (s *Session) DurationS() float64 {
	span := float64(s.Last-s.Start) / 1000
	if e := float64(s.EngagedMs()) / 1000; e > span {
		return e
	}
	return span
}

func (s *Session) add(e *event.Event) {
	if e.TS > s.Last {
		s.Last = e.TS
	}
	if e.TS < s.Start { // a late retry from earlier in the visit
		s.Start = e.TS
	}
	if e.FirstSeen > 0 && (s.FirstSeen == 0 || e.FirstSeen < s.FirstSeen) {
		s.FirstSeen = e.FirstSeen
	}
	fill := func(dst *string, v string) {
		if *dst == "" {
			*dst = v
		}
	}
	fill(&s.Country, e.Country)
	fill(&s.Region, e.Region)
	fill(&s.City, e.City)
	fill(&s.Device, e.Device)
	fill(&s.Browser, e.Browser)
	fill(&s.OS, e.OS)
	fill(&s.Language, e.Language)
	switch e.Kind {
	case event.KindPageview:
		if s.Pageviews == 0 { // entry pageview decides the source
			s.Channel, s.Referrer, s.EntryPage = e.Channel, e.RefHost, e.Path
			s.Campaign, s.Source, s.Medium = e.UTMCampaign, e.UTMSource, e.UTMMedium
		}
		s.Pageviews++
		if e.TS >= s.lastPV {
			s.lastPV, s.ExitPage = e.TS, e.Path
		}
	case event.KindGoal:
		s.Goals++
	case event.KindEngagement:
		if s.eng == nil {
			s.eng = map[uint64]uint32{}
		}
		if e.EngagedMs > s.eng[e.Pageview] {
			s.eng[e.Pageview] = e.EngagedMs
		}
	}
}

func (s *Session) clone() Session {
	c := *s
	c.eng = make(map[uint64]uint32, len(s.eng))
	for k, v := range s.eng {
		c.eng[k] = v
	}
	return c
}

// sessionizer assigns server-authoritative session ids and keeps each open
// session's rollup. Ids are a pure function of (site, visitor, session start),
// so replaying the same events in the same order produces the same ids.
type sessionizer struct {
	mu         sync.RWMutex
	open       map[visitorKey]*Session
	closeAfter int64 // ms
}

func newSessionizer(closeAfter int64) *sessionizer {
	if closeAfter <= 0 {
		closeAfter = DefaultCloseAfter
	}
	return &sessionizer{open: make(map[visitorKey]*Session), closeAfter: closeAfter}
}

func sessionID(site string, visitor uint64, start int64) uint64 {
	h := fnv.New64a()
	h.Write([]byte(site))
	h.Write([]byte{0})
	h.Write(strconv.AppendUint(nil, visitor, 10))
	h.Write([]byte{0})
	h.Write(strconv.AppendInt(nil, start, 10))
	return h.Sum64()
}

// assign returns the session id for e and folds e into that session. When a
// visitor starts a new session while an old one is still open, the old one is
// returned in closed so the caller can write it.
func (z *sessionizer) assign(e *event.Event) (id uint64, closed *Session) {
	z.mu.Lock()
	defer z.mu.Unlock()
	k := visitorKey{e.Site, e.Visitor}
	if s, ok := z.open[k]; ok {
		if e.TS-s.Last < SessionTimeout {
			s.add(e)
			return s.ID, nil
		}
		closed = s
	}
	s := &Session{Site: e.Site, ID: sessionID(e.Site, e.Visitor, e.TS), Visitor: e.Visitor, Start: e.TS, Last: e.TS}
	s.add(e)
	z.open[k] = s
	return s.ID, closed
}

// restore seeds an open session recovered from the database at boot.
func (z *sessionizer) restore(s *Session) {
	z.mu.Lock()
	defer z.mu.Unlock()
	k := visitorKey{s.Site, s.Visitor}
	if cur, ok := z.open[k]; ok && cur.Last >= s.Last {
		return
	}
	z.open[k] = s
}

// closeIdle removes and returns sessions whose last event is older than
// closeAfter relative to now (ms), plus the new sessions watermark: every
// session with any event before it has been (or is now being) written.
func (z *sessionizer) closeIdle(now int64) (closed []*Session, watermark int64) {
	z.mu.Lock()
	defer z.mu.Unlock()
	watermark = now - z.closeAfter
	for k, s := range z.open {
		if now-s.Last >= z.closeAfter {
			closed = append(closed, s)
			delete(z.open, k)
		} else if s.Start < watermark {
			watermark = s.Start
		}
	}
	return closed, watermark
}

// Snapshot copies the open sessions of one site (for live reports).
func (z *sessionizer) snapshot(site string) []Session {
	z.mu.RLock()
	defer z.mu.RUnlock()
	var out []Session
	for k, s := range z.open {
		if k.site == site && s.Pageviews > 0 {
			out = append(out, s.clone())
		}
	}
	return out
}

func (z *sessionizer) size() int {
	z.mu.RLock()
	defer z.mu.RUnlock()
	return len(z.open)
}

// forgetVisitor drops one visitor's open session, so an erased person cannot
// be written back the moment their session closes. It reports how many it
// dropped: an open visit is a visit, and the count shown has to say so.
func (z *sessionizer) forgetVisitor(site string, visitor uint64) int64 {
	z.mu.Lock()
	defer z.mu.Unlock()
	var n int64
	for k := range z.open {
		if k.site == site && k.visitor == visitor {
			delete(z.open, k)
			n++
		}
	}
	return n
}

// forget drops a site's open sessions, so a deleted site cannot write one back.
func (z *sessionizer) forget(site string) {
	z.mu.Lock()
	defer z.mu.Unlock()
	for k := range z.open {
		if k.site == site {
			delete(z.open, k)
		}
	}
}
