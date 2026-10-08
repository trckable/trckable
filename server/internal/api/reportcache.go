package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/query"
)

// How long a report is kept.
//
// A range that includes today changes with every visit and sale: it is kept
// for seconds, and dropped the moment the site commits anything new (the hub's
// version). A range that ended before today cannot change unless something
// writes to the days it covers, and everything that does says so: the writer
// reports the span of time each commit touched (Touched), and whatever else
// rewrites numbers (a refund, a currency, a zone, a setting, a delete, a new
// exchange rate) purges. So a closed range is kept for hours, and only what a
// change can reach is dropped.
//
// A read that overlaps a change made while it ran is not kept: it may have
// seen the data before or after.
//
// Why whole ranges and not closed days merged with a live today: a range's
// visitors are distinct people across its days, and its breakdowns are the
// top rows of people counted the same way; neither can be added up from
// days, so a merge would not be the same numbers.
const (
	liveTTL = 10 * time.Second
	// A live entry whose site has committed since is still served this long:
	// a busy site commits about once a second, and dropping the entry each
	// time would make every request a miss, the opposite of a cache.
	liveFloor = 2 * time.Second
	// A report that runs longer is cancelled, so it ends before the server
	// stops waiting to write the answer (WriteTimeout, 30s).
	reportTimeout = 25 * time.Second
	closedTTL     = 6 * time.Hour
	// A sale looks back this far for the visit that earned it (query.AttributionWindow),
	// and a visit counts up to a minute after the sale it is credited with.
	// A renewal is credited to the visit that started its subscription, which
	// can be older than this; that holds because every event that reaches the
	// store live is at most 25 hours old (event.MaxAge, a retry queue's limit), and an
	// import of history runs offline, with no reports cached. An import that
	// ran online would have to purge the site when it finished.
	lookBack  = query.AttributionWindow
	lookAhead = time.Minute
	// How many recent changes a site remembers for reads still running.
	changeLog = 128
)

type reportCache struct {
	mu    sync.Mutex
	max   int
	m     map[string]cacheEntry
	sites map[string]*siteChanges
	epoch uint64 // moves when every site's reports are dropped at once
}

type cacheEntry struct {
	res  *query.Result
	exp  time.Time
	site string
	// ver is the site's commit count when the report was read. A live entry
	// (a range that includes today) is dropped as soon as a newer visit or
	// sale is committed, so the dashboard never waits out the TTL for it.
	ver  uint64
	live bool
	made time.Time
	// The span of time the report covers, unix ms: [from, to).
	from, to int64
}

// siteChanges is what one site has had written to it, for reads in flight.
type siteChanges struct {
	seq    uint64
	purges uint64   // how many times everything the site had was dropped
	log    []change // the latest changes, oldest first
}

// change is a span of time something was written to (unix ms); all = anything.
type change struct {
	seq    uint64
	lo, hi int64
	all    bool
}

func newReportCache(max int) *reportCache {
	return &reportCache{max: max, m: map[string]cacheEntry{}, sites: map[string]*siteChanges{}}
}

// reaches reports whether a change can alter what the report covers: its own
// days, and the payments those days' visits could earn credit for.
func (c change) reaches(from, to int64) bool {
	if c.all {
		return true
	}
	return to+lookAhead.Milliseconds() > c.lo && from <= c.hi+lookBack.Milliseconds()
}

func (c *reportCache) site(site string) *siteChanges {
	s := c.sites[site]
	if s == nil {
		s = &siteChanges{}
		c.sites[site] = s
	}
	return s
}

// record notes a change for reads in flight. Holds mu.
func (c *reportCache) record(site string, ch change) {
	s := c.site(site)
	s.seq++
	ch.seq = s.seq
	s.log = append(s.log, ch)
	if len(s.log) > changeLog {
		s.log = s.log[len(s.log)-changeLog:]
	}
}

// changedSince reports whether anything since the read began (when the site
// was at seq) can have altered a range. A log that no longer goes back that
// far answers yes. Holds mu.
func (c *reportCache) changedSince(site string, seq uint64, from, to int64) bool {
	s := c.sites[site]
	if s == nil || s.seq == seq {
		return false
	}
	if len(s.log) == 0 || s.log[0].seq > seq+1 {
		return true
	}
	for _, ch := range s.log {
		if ch.seq > seq && ch.reaches(from, to) {
			return true
		}
	}
	return false
}

// touched is what the writer calls after each commit: [lo, hi] (unix ms) is
// the span of the visits and events it stored. Only the closed ranges that
// span can reach are dropped. A site's live ranges have the hub's version.
func (c *reportCache) touched(site string, lo, hi int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	ch := change{lo: lo, hi: hi}
	c.record(site, ch)
	for k, e := range c.m {
		if e.site == site && !e.live && ch.reaches(e.from, e.to) {
			delete(c.m, k)
		}
	}
}

func (c *reportCache) purgeSite(site string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.record(site, change{all: true})
	c.site(site).purges++
	for k, e := range c.m {
		if e.site == site {
			delete(c.m, k)
		}
	}
}

// purgeAll drops every site's reports: what all of them share has changed
// (the exchange rates).
func (c *reportCache) purgeAll() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.epoch++
	clear(c.m)
}

// Touched drops the cached reports the writer's last commit can have changed:
// lo and hi are the earliest and latest time (unix ms) of the visits and
// events it stored.
func (a *API) Touched(site string, lo, hi int64) {
	a.init()
	a.cache.touched(site, lo, hi)
}

// PurgeAll drops every cached report (the exchange rates changed).
func (a *API) PurgeAll() {
	a.init()
	a.cache.purgeAll()
}

// reportFail answers a failed report read: a read that ran out of time is the
// server being busy (504: the dashboard says it is busy and offers a retry;
// a 503 would read as the store warming up), anything else goes to failReport (out of memory, or a bad question).
func reportFail(w http.ResponseWriter, err error) {
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		w.Header().Set("Retry-After", "5")
		fail(w, http.StatusGatewayTimeout, "the report took too long to load: try again, or pick a shorter range")
		return
	}
	failReport(w, err)
}

// cachedReport reads a report, from the cache when one that is still good is
// there. A range that ends after now includes the day still going: that is
// the live kind. Requests for the same report that arrive while it is being
// read wait for that one read instead of starting their own.
func (a *API) cachedReport(r *http.Request, q *query.Q, p query.Params) (*query.Result, error) {
	key := cacheKey(p)
	now := a.Now()
	live := p.To.After(now)
	var ver uint64
	if a.Hub != nil {
		ver = a.Hub.Version(p.Site) // read before the query: a commit during it makes this entry stale
	}
	a.cache.mu.Lock()
	if e, ok := a.cache.m[key]; ok && now.Before(e.exp) && (!e.live || e.ver == ver || now.Sub(e.made) < liveFloor) {
		a.cache.mu.Unlock()
		return e.res, nil
	}
	a.cache.mu.Unlock()
	// The read belongs to everyone waiting on it, so it outlives the request
	// that started it (but not the timeout).
	base := context.WithoutCancel(r.Context())
	ch := a.flights.DoChan(key+"|"+strconv.FormatUint(ver, 10), func() (any, error) {
		ctx, cancel := context.WithTimeout(base, reportTimeout)
		defer cancel()
		return a.readReport(ctx, q, p, key, now, live, ver)
	})
	select {
	case res := <-ch:
		if res.Err != nil {
			return nil, res.Err
		}
		return res.Val.(*query.Result), nil
	case <-r.Context().Done():
		return nil, r.Context().Err()
	}
}

func (a *API) readReport(ctx context.Context, q *query.Q, p query.Params, key string, now time.Time, live bool, ver uint64) (*query.Result, error) {
	from, to := p.From.UnixMilli(), p.To.UnixMilli()
	a.cache.mu.Lock()
	sc := a.cache.site(p.Site)
	seq, purges, epoch := sc.seq, sc.purges, a.cache.epoch
	a.cache.mu.Unlock()
	res, err := q.Report(ctx, p)
	if err != nil {
		return nil, err
	}
	ttl := closedTTL
	if live {
		ttl = liveTTL
	}
	a.cache.mu.Lock()
	defer a.cache.mu.Unlock()
	if a.cache.epoch != epoch || a.cache.site(p.Site).purges != purges || (!live && a.cache.changedSince(p.Site, seq, from, to)) {
		return res, nil // answered, not kept
	}
	if len(a.cache.m) >= a.cache.max {
		for k, e := range a.cache.m { // evict expired, then arbitrary
			if now.After(e.exp) || len(a.cache.m) >= a.cache.max {
				delete(a.cache.m, k)
			}
			if len(a.cache.m) < a.cache.max*3/4 {
				break
			}
		}
	}
	a.cache.m[key] = cacheEntry{res: res, exp: now.Add(ttl), site: p.Site, ver: ver, live: live, made: now, from: from, to: to}
	return res, nil
}
