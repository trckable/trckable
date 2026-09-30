package api

import (
	"net/http"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/query"
)

// Live mode reads this once, then again whenever the stream says something
// arrived and each minute, so the chart and the list stay exact rather than
// guessed from the stream alone. Read-only, for anyone who may read the
// site's reports; share links have no live stream and no Live mode, so there
// is no share route for it.

// nowTTL is how long an answer is reused. A commit to the site ends it at
// once (the hub's version), so a new visit is never hidden by the cache.
const nowTTL = 2 * time.Second

// nowAnswer is what GET /api/v1/sites/{site}/now sends.
type nowAnswer struct {
	*query.Now
	// Revenue is today's revenue in the site's currency, exactly the Data
	// view's Revenue tile for Today. Absent while the revenue module is off
	// or no payment provider is connected.
	Revenue *nowMoney `json:"revenue,omitempty"`
}

type nowMoney struct {
	Amount   int64  `json:"amount"`
	Currency string `json:"currency"`
	Exponent int    `json:"exponent"`
}

type nowEntry struct {
	res *nowAnswer
	at  time.Time
	ver uint64
}

type nowCache struct {
	mu sync.Mutex
	m  map[string]nowEntry
}

// nowCacheMax bounds the cache: entries are per site and module switches,
// and anything past its two seconds is dropped first.
const nowCacheMax = 512

func (c *nowCache) get(key string, now time.Time, ver uint64) *nowAnswer {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	if !ok || e.ver != ver || now.Sub(e.at) >= nowTTL || now.Before(e.at) {
		return nil
	}
	return e.res
}

func (c *nowCache) put(key string, now time.Time, ver uint64, res *nowAnswer) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil {
		c.m = map[string]nowEntry{}
	}
	if len(c.m) >= nowCacheMax {
		for k, e := range c.m {
			if now.Sub(e.at) >= nowTTL || len(c.m) >= nowCacheMax {
				delete(c.m, k)
			}
		}
	}
	c.m[key] = nowEntry{res: res, at: now, ver: ver}
}

func (a *API) liveNow(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	// The visitor id travels only while journeys is on, as on the stream.
	withVisitor := a.moduleOn(r, site, "journeys")
	withMoney := a.moduleOn(r, site, "revenue")
	key := site + "|" + onOff(withVisitor) + onOff(withMoney)
	now := a.Now()
	var ver uint64
	if a.Hub != nil {
		ver = a.Hub.Version(site) // read before the query: a commit during it makes the entry stale
	}
	if res := a.nowCache.get(key, now, ver); res != nil {
		writeJSON(w, http.StatusOK, res)
		return
	}
	n, err := q.LiveNow(r.Context(), site, now, withVisitor)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	res := &nowAnswer{Now: n}
	if withMoney {
		res.Revenue = a.revenueToday(r, q, site)
	}
	a.nowCache.put(key, now, ver, res)
	writeJSON(w, http.StatusOK, res)
}

// revenueToday is the Data view's Revenue for Today: the same report, asked
// the same way, so the two can never disagree.
func (a *API) revenueToday(r *http.Request, q *query.Q, site string) *nowMoney {
	si, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		return nil
	}
	loc, err := time.LoadLocation(si.Timezone)
	if err != nil {
		return nil
	}
	day := a.Now().In(loc).Format("2006-01-02")
	ask := r.Clone(r.Context())
	ask.URL.RawQuery = "from=" + day + "&to=" + day
	parsed := a.parse(discard{}, ask, site, true)
	if parsed == nil {
		return nil
	}
	res, err := a.cachedReport(ask, q, parsed.Params)
	if err != nil || res.Money == nil {
		return nil
	}
	return &nowMoney{Amount: res.Money.Revenue, Currency: res.Money.Currency, Exponent: res.Money.Exponent}
}

func onOff(on bool) string {
	if on {
		return "1"
	}
	return "0"
}

// discard is a ResponseWriter for asking parse a question it can only fail
// on with bad input, which revenueToday never sends.
type discard struct{}

func (discard) Header() http.Header         { return http.Header{} }
func (discard) Write(b []byte) (int, error) { return len(b), nil }
func (discard) WriteHeader(int)             {}
