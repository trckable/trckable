package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/trckable/trckable/server/internal/moments"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The bell's list for the signed-in person: what happened on every site they
// may read in the last week, newest first, built here from the stores that
// already hold it, so the dashboard asks once and every row keeps its id and
// its true time from one read to the next. A share link or an API key gets none.

const (
	bellDays = 7
	bellMax  = 60
	bellKeep = 30 * time.Second
	// bellTimeout bounds one build of a list, whatever the client that asked does; bellSites is how many sites are read at once.
	bellTimeout = 20 * time.Second
	bellSites   = 4
)

// bellRow is one thing that happened. `At` is the event's own time (unix
// seconds); a daily achievement has a Day instead of a time of day.
type bellRow struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"` // down | milestone | busy | mention | answer | signup | sale | goal | alert
	Site  string `json:"site"` // the site's id; empty for what belongs to the installation
	At    int64  `json:"at"`
	Day   string `json:"day,omitempty"` // YYYY-MM-DD, the site's time: set for what is kept by the day
	Count int64  `json:"count,omitempty"`
	// Down: Ended is when the site answered again (nil while it is down).
	Ended *int64 `json:"ended,omitempty"`
	// Sale: the net amount in minor units.
	Amount   int64   `json:"amount,omitempty"`
	Currency string  `json:"currency,omitempty"`
	Exponent int     `json:"exponent,omitempty"`
	What     string  `json:"what,omitempty"` // sale: new | upgrade | renewal | sale; busy: spike | surge; answer: seen | dropped | paused; alert: the alert's kind
	Visitors int64   `json:"visitors,omitempty"`
	Factor   float64 `json:"factor,omitempty"`
	Source   string  `json:"source,omitempty"` // busy: who sent them; mention: where it was posted (hn | ph | news)
	Host     string  `json:"host,omitempty"`   // mention: the host that can bring visits
	Text     string  `json:"text,omitempty"`   // mention: its title; answer: the question; goal: the goal's name
	Engine   string  `json:"engine,omitempty"`
	First    bool    `json:"first,omitempty"`
	// Milestone: the row as the milestone page tells it.
	Milestone *sqlite.Milestone `json:"milestone,omitempty"`
}

// bellCache keeps each person's complete list for bellKeep, and shares one build among the requests that ask for it at once.
type bellCache struct {
	mu     sync.Mutex
	m      map[string]bellEntry
	flight map[string]*bellFlight
}

type bellEntry struct {
	at   time.Time
	rows []bellRow
}

type bellFlight struct {
	done    chan struct{}
	rows    []bellRow
	partial bool
}

// build answers from the cache, else from the build already running for this key, else runs `make` itself. A partial list
// (some source could not be read) is never kept.
func (c *bellCache) build(ctx context.Context, key string, now time.Time, produce func() ([]bellRow, bool)) ([]bellRow, bool, error) {
	c.mu.Lock()
	if e, ok := c.m[key]; ok && now.Sub(e.at) < bellKeep && !now.Before(e.at) {
		c.mu.Unlock()
		return e.rows, false, nil
	}
	if f, ok := c.flight[key]; ok {
		c.mu.Unlock()
		select {
		case <-f.done:
			return f.rows, f.partial, nil
		case <-ctx.Done():
			return nil, false, ctx.Err()
		}
	}
	f := &bellFlight{done: make(chan struct{})}
	if c.flight == nil {
		c.flight = map[string]*bellFlight{}
	}
	c.flight[key] = f
	c.mu.Unlock()
	f.rows, f.partial = produce()
	c.mu.Lock()
	delete(c.flight, key)
	if !f.partial {
		if c.m == nil {
			c.m = map[string]bellEntry{}
		}
		for k, e := range c.m {
			if now.Sub(e.at) >= bellKeep {
				delete(c.m, k)
			}
		}
		c.m[key] = bellEntry{at: now, rows: f.rows}
	}
	c.mu.Unlock()
	close(f.done)
	return f.rows, f.partial, nil
}

// bellFeed is GET /api/v1/me/notifications. `partial` says a source could not be read: the list is what could be, and the
// dashboard keeps the list it has rather than replace it with a shorter one.
func (a *API) bellFeed(w http.ResponseWriter, r *http.Request) {
	p := principalOf(r)
	if p.user == nil {
		fail(w, http.StatusForbidden, "the bell belongs to a person, not an API key")
		return
	}
	all, err := a.Ctl.ListSites(r.Context(), p.account)
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the bell")
		return
	}
	sites := visible(p, all)
	ids := make([]string, len(sites))
	for i, s := range sites {
		ids[i] = s.ID
	}
	sort.Strings(ids)
	now := a.Now()
	key := p.account + "|" + p.user.ID + "|" + strings.Join(ids, ",")
	// Built apart from the request: a tab that goes away does not leave a half-read list behind, and the build is bounded.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), bellTimeout)
	defer cancel()
	req := r.Clone(ctx)
	rows, partial, err := a.bell.build(r.Context(), key, now, func() ([]bellRow, bool) { return a.bellRows(req, p.account, sites, now) })
	if err != nil {
		return
	}
	// The first list this person is given: they are told, once, so what is already behind them is not a burst of unread.
	seedKey := "bell_seeded:" + p.user.ID
	_, seeded, _ := a.Ctl.Meta(r.Context(), seedKey)
	first := !seeded && !partial
	if first {
		_ = a.Ctl.SetMeta(r.Context(), seedKey, "1")
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, map[string]any{"user": p.user.ID, "notifications": rows, "partial": partial, "first": first})
}

// bellRows puts the sites' week together: one list, in the one order (at, then id). The second value is true when a source could not be read.
func (a *API) bellRows(r *http.Request, account string, sites []sqlite.SiteRow, now time.Time) ([]bellRow, bool) {
	ctx := r.Context()
	from := now.Unix() - bellDays*86400
	var (
		mu      sync.Mutex
		rows    = []bellRow{}
		partial atomic.Bool
	)
	add := func(more []bellRow) {
		mu.Lock()
		rows = append(rows, more...)
		mu.Unlock()
	}
	byID := map[string]sqlite.SiteRow{}
	ids := make([]string, 0, len(sites))
	for _, s := range sites {
		byID[s.ID] = s
		ids = append(ids, s.ID)
	}
	if list, err := a.Ctl.AccountIncidents(ctx, account, from, incidentsPeriod); err != nil {
		partial.Store(true)
	} else {
		for _, x := range list {
			if _, mine := byID[x.Site]; !mine || x.Kind != "down" || (x.StartedAt < from && x.EndedAt != nil) {
				continue
			}
			add([]bellRow{{ID: "down:" + x.ID, Kind: "down", Site: x.Site, At: x.StartedAt, Ended: x.EndedAt}})
		}
	}
	if fires, err := a.Ctl.AlertFiresSince(ctx, ids, from); err != nil {
		partial.Store(true)
	} else {
		for _, f := range fires {
			// A stopped site is the down row, a spike the busy row and a customer the sale row: only what has no row of its own is told here.
			if f.Kind == "threshold" || f.Kind == "disk" {
				add([]bellRow{{ID: "alert:" + strconv.FormatInt(f.ID, 10), Kind: "alert", Site: f.Site, At: f.At, What: f.Kind}})
			}
		}
	}
	var g errgroup.Group
	g.SetLimit(bellSites)
	for _, s := range sites {
		g.Go(func() error {
			list, ok := a.bellSite(r, s, now, from)
			if !ok {
				partial.Store(true)
			}
			add(list)
			return nil
		})
	}
	_ = g.Wait()
	if a.AnswersOn() {
		if paused, ok, _ := a.Ctl.Meta(ctx, sqlite.AnswerPausedAtKey); ok && a.answersPaused(r) {
			if at, _ := strconv.ParseInt(paused, 10, 64); at >= from && at <= now.Unix() {
				add([]bellRow{{ID: "answer:paused:" + time.Unix(at, 0).UTC().Format("2006-01"), Kind: "answer", What: "paused", At: at}})
			}
		}
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].At != rows[j].At {
			return rows[i].At > rows[j].At
		}
		return rows[i].ID < rows[j].ID
	})
	// A site that is down stays in the list however much has happened since: only the rest is cut.
	out := make([]bellRow, 0, min(len(rows), bellMax))
	kept := 0
	for _, x := range rows {
		if x.Kind == "down" && x.Ended == nil {
			out = append(out, x)
		} else if kept < bellMax {
			out = append(out, x)
			kept++
		}
	}
	return out, partial.Load()
}

// nullWriter takes what parse would answer a client with: here it only matters that it failed.
type nullWriter struct{ h http.Header }

func (w *nullWriter) Header() http.Header         { return w.h }
func (w *nullWriter) Write(b []byte) (int, error) { return len(b), nil }
func (w *nullWriter) WriteHeader(int)             {}

// goalKey shortens a goal's name for an id (ids are kept as read marks and are short).
func goalKey(goal string) string {
	h := sha256.Sum256([]byte(goal))
	return hex.EncodeToString(h[:6])
}

// bellSite is what one site's stores say of the week.
func (a *API) bellSite(r *http.Request, s sqlite.SiteRow, now time.Time, from int64) ([]bellRow, bool) {
	ctx := r.Context()
	loc, err := time.LoadLocation(s.Timezone)
	if err != nil {
		loc = time.UTC
	}
	var out []bellRow
	ok := true
	hour := func(t string) (int64, bool) {
		at, err := time.ParseInLocation("2006-01-02T15:04", t, loc)
		return at.Unix(), err == nil && at.Unix() >= from-3600 && at.Unix() <= now.Unix()
	}
	surgeHours := map[int64]bool{}
	if list, err := a.Ctl.SurgesBetween(ctx, s.ID, from, now.Unix()+1); err != nil {
		ok = false
	} else {
		for _, x := range list {
			surgeHours[x.Started/3600] = true
			out = append(out, bellRow{ID: "busy:surge:" + x.ID, Kind: "busy", What: "surge", Site: s.ID, At: x.Started, Visitors: x.Online, Factor: moments.Round(x.Factor()), Source: x.Why.SourceValue})
		}
	}
	if a.MentionsOn {
		if list, err := a.Ctl.Mentions(ctx, s.ID, from, now.Unix()+1, 50); err != nil {
			ok = false
		} else {
			for _, m := range list {
				out = append(out, bellRow{ID: "mention:" + strconv.FormatInt(m.ID, 10), Kind: "mention", Site: s.ID, At: m.PostedAt, Source: m.Source, Host: m.Host, Text: m.Title})
			}
		}
	}
	if a.AnswersOn() {
		if list, err := a.Ctl.AnswerChangesIn(ctx, s.ID, from, 50); err != nil {
			ok = false
		} else {
			for _, c := range list {
				out = append(out, bellRow{ID: "answer:" + c.Engine + ":" + strconv.FormatInt(c.QuestionID, 10) + ":" + strconv.FormatInt(c.At, 10), Kind: "answer", What: c.Kind, Site: s.ID, At: c.At, Engine: c.Engine, Text: c.Question, First: c.FirstEver})
			}
		}
	}
	if on, err := a.Ctl.MilestonesOn(ctx, s.ID); err != nil {
		ok = false
	} else if on {
		if list, _, err := a.visibleMilestones(r, s.ID); err != nil {
			ok = false
		} else {
			since := now.In(loc).AddDate(0, 0, -bellDays).Format("2006-01-02")
			for _, m := range list {
				day, err := time.ParseInLocation("2006-01-02", m.Day, loc)
				if m.Quiet || m.Day < since || err != nil {
					continue
				}
				m := m
				out = append(out, bellRow{ID: "mile:" + s.ID + ":" + m.Kind + ":" + m.Step, Kind: "milestone", Site: s.ID, At: day.Unix(), Day: m.Day, Milestone: &m})
			}
		}
	}
	q := a.Query()
	if q == nil {
		return out, false
	}
	// The period is the bell's own: nothing the client sent reaches the report or its cache.
	v := url.Values{}
	v.Set("from", now.In(loc).AddDate(0, 0, -bellDays).Format("2006-01-02"))
	v.Set("to", now.In(loc).Format("2006-01-02"))
	v.Set("bucket", "hour")
	req := r.Clone(ctx)
	req.URL.RawQuery = v.Encode()
	ask := a.parse(&nullWriter{h: http.Header{}}, req, s.ID, true)
	if ask == nil {
		return out, false
	}
	p := ask.Params
	p.Daily, p.Deep, p.Sales = false, false, p.Revenue
	for _, m := range a.spikesOf(req, q, p, loc, ask.Live) {
		if at, ok := hour(m.T); ok && !surgeHours[at/3600] {
			out = append(out, bellRow{ID: "busy:spike:" + s.ID + ":" + m.T, Kind: "busy", What: "spike", Site: s.ID, At: at, Visitors: m.Visitors, Factor: m.Factor, Source: m.Referrer})
		}
	}
	if res, err := a.cachedReport(req, q, p); err != nil {
		ok = false
	} else if res.Money != nil {
		for _, m := range salesOf(res) {
			if at, ok := hour(m.T); ok {
				out = append(out, bellRow{ID: "sale:" + s.ID + ":" + m.T, Kind: "sale", Site: s.ID, At: at, Count: m.Count, Amount: m.Amount, Currency: res.Money.Currency, Exponent: res.Money.Exponent, What: m.What})
			}
		}
	}
	if p.Goals {
		names := a.goalNames(ctx, s.ID)
		if list, err := q.GoalHours(ctx, s.ID, p.TZ, time.Unix(from, 0).UTC(), now.UTC(), 2000); err != nil {
			ok = false
		} else {
			// One row per goal per day, at its latest hour: a few busy goals must not push everything else off the list.
			rows := map[string]*bellRow{}
			var order []string
			for _, g := range list {
				at, ok := hour(g.Hour)
				if !ok {
					continue
				}
				day := g.Hour[:min(len(g.Hour), 10)]
				id := "goal:" + s.ID + ":" + goalKey(g.Goal) + ":" + day
				kind := "goal"
				if p.SignupGoal != "" && g.Goal == p.SignupGoal {
					id, kind = "signup:"+s.ID+":"+day, "signup"
				}
				row := rows[id]
				if row == nil {
					row = &bellRow{ID: id, Kind: kind, Site: s.ID, At: at, Text: g.Goal}
					if n := names[g.Goal]; n != "" {
						row.Text = n
					}
					rows[id] = row
					order = append(order, id)
				}
				row.Count += g.Count
				row.At = max(row.At, at)
			}
			for _, id := range order {
				out = append(out, *rows[id])
			}
		}
	}
	return out, ok
}
