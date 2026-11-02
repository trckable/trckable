package api

import (
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/moments"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The bell's list for the signed-in person: what happened on every site they
// may read in the last week, newest first, built here from the stores that
// already hold it, so the dashboard asks once and every row keeps its id and
// its true time from one read to the next. A share link or an API key gets none.

const (
	bellDays  = 7
	bellMax   = 60
	bellKeep  = 30 * time.Second
	bellAlert = "stopped spike threshold customer disk"
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

// bellCache keeps each person's list for bellKeep.
type bellCache struct {
	mu sync.Mutex
	m  map[string]bellEntry
}

type bellEntry struct {
	at   time.Time
	rows []bellRow
}

func (c *bellCache) get(key string, now time.Time) ([]bellRow, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	if !ok || now.Sub(e.at) >= bellKeep || now.Before(e.at) {
		return nil, false
	}
	return e.rows, true
}

func (c *bellCache) put(key string, now time.Time, rows []bellRow) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil {
		c.m = map[string]bellEntry{}
	}
	for k, e := range c.m {
		if now.Sub(e.at) >= bellKeep {
			delete(c.m, k)
		}
	}
	c.m[key] = bellEntry{at: now, rows: rows}
}

// bellFeed is GET /api/v1/me/notifications.
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
	key := p.account + "|" + strings.Join(ids, ",")
	rows, ok := a.bell.get(key, now)
	if !ok {
		rows = a.bellRows(r, p.account, sites, now)
		a.bell.put(key, now, rows)
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, map[string]any{"notifications": rows})
}

// bellRows puts the sites' week together: one list, in the one order (at, then id).
func (a *API) bellRows(r *http.Request, account string, sites []sqlite.SiteRow, now time.Time) []bellRow {
	ctx := r.Context()
	from := now.Unix() - bellDays*86400
	rows := []bellRow{}
	byID := map[string]sqlite.SiteRow{}
	ids := make([]string, 0, len(sites))
	for _, s := range sites {
		byID[s.ID] = s
		ids = append(ids, s.ID)
	}
	if list, err := a.Ctl.AccountIncidents(ctx, account, from, incidentsPeriod); err == nil {
		for _, x := range list {
			if _, mine := byID[x.Site]; !mine || x.Kind != "down" || (x.StartedAt < from && x.EndedAt != nil) {
				continue
			}
			rows = append(rows, bellRow{ID: "down:" + x.ID, Kind: "down", Site: x.Site, At: x.StartedAt, Ended: x.EndedAt})
		}
	}
	if fires, err := a.Ctl.AlertFiresSince(ctx, ids, from); err == nil {
		for _, f := range fires {
			if strings.Contains(" "+bellAlert+" ", " "+f.Kind+" ") {
				rows = append(rows, bellRow{ID: "alert:" + strconv.FormatInt(f.ID, 10), Kind: "alert", Site: f.Site, At: f.At, What: f.Kind})
			}
		}
	}
	for _, s := range sites {
		rows = append(rows, a.bellSite(r, s, now, from)...)
	}
	if paused, ok, _ := a.Ctl.Meta(ctx, sqlite.AnswerPausedAtKey); ok && a.answersPaused(r) {
		if at, _ := strconv.ParseInt(paused, 10, 64); at >= from && at <= now.Unix() {
			rows = append(rows, bellRow{ID: "answer:paused:" + time.Unix(at, 0).UTC().Format("2006-01"), Kind: "answer", What: "paused", At: at})
		}
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].At != rows[j].At {
			return rows[i].At > rows[j].At
		}
		return rows[i].ID < rows[j].ID
	})
	if len(rows) > bellMax {
		rows = rows[:bellMax]
	}
	return rows
}

// bellSite is what one site's stores say of the week.
func (a *API) bellSite(r *http.Request, s sqlite.SiteRow, now time.Time, from int64) []bellRow {
	ctx := r.Context()
	loc, err := time.LoadLocation(s.Timezone)
	if err != nil {
		loc = time.UTC
	}
	var out []bellRow
	hour := func(t string) (int64, bool) {
		at, err := time.ParseInLocation("2006-01-02T15:04", t, loc)
		return at.Unix(), err == nil && at.Unix() >= from-3600 && at.Unix() <= now.Unix()
	}
	surgeHours := map[int64]bool{}
	if list, err := a.Ctl.SurgesBetween(ctx, s.ID, from, now.Unix()+1); err == nil {
		for _, x := range list {
			surgeHours[x.Started/3600] = true
			out = append(out, bellRow{ID: "busy:surge:" + x.ID, Kind: "busy", What: "surge", Site: s.ID, At: x.Started, Visitors: x.Online, Factor: moments.Round(x.Factor()), Source: x.Why.SourceValue})
		}
	}
	if a.MentionsOn {
		if list, err := a.Ctl.Mentions(ctx, s.ID, from, now.Unix()+1, 50); err == nil {
			for _, m := range list {
				out = append(out, bellRow{ID: "mention:" + strconv.FormatInt(m.ID, 10), Kind: "mention", Site: s.ID, At: m.PostedAt, Source: m.Source, Host: m.Host, Text: m.Title})
			}
		}
	}
	if a.AnswersOn() {
		if list, err := a.Ctl.AnswerChangesIn(ctx, s.ID, from, 50); err == nil {
			for _, c := range list {
				out = append(out, bellRow{ID: "answer:" + c.Engine + ":" + strconv.FormatInt(c.QuestionID, 10) + ":" + strconv.FormatInt(c.At, 10), Kind: "answer", What: c.Kind, Site: s.ID, At: c.At, Engine: c.Engine, Text: c.Question, First: c.FirstEver})
			}
		}
	}
	if on, err := a.Ctl.MilestonesOn(ctx, s.ID); err == nil && on {
		if list, _, err := a.visibleMilestones(r, s.ID); err == nil {
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
		return out
	}
	v := r.URL.Query()
	v.Set("from", now.In(loc).AddDate(0, 0, -bellDays).Format("2006-01-02"))
	v.Set("to", now.In(loc).Format("2006-01-02"))
	v.Set("bucket", "hour")
	req := r.Clone(ctx)
	req.URL.RawQuery = v.Encode()
	ask := a.parse(httptest.NewRecorder(), req, s.ID, true)
	if ask == nil {
		return out
	}
	p := ask.Params
	p.Daily, p.Deep, p.Sales = false, false, p.Revenue
	for _, m := range a.spikesOf(req, q, p, loc, ask.Live) {
		if at, ok := hour(m.T); ok && !surgeHours[at/3600] {
			out = append(out, bellRow{ID: "busy:spike:" + s.ID + ":" + m.T, Kind: "busy", What: "spike", Site: s.ID, At: at, Visitors: m.Visitors, Factor: m.Factor, Source: m.Referrer})
		}
	}
	if res, err := a.cachedReport(req, q, p); err == nil && res.Money != nil {
		for _, m := range salesOf(res) {
			if at, ok := hour(m.T); ok {
				out = append(out, bellRow{ID: "sale:" + s.ID + ":" + m.T, Kind: "sale", Site: s.ID, At: at, Count: m.Count, Amount: m.Amount, Currency: res.Money.Currency, Exponent: res.Money.Exponent, What: m.What})
			}
		}
	}
	if p.Goals {
		names := a.goalNames(ctx, s.ID)
		if list, err := q.GoalHours(ctx, s.ID, p.TZ, time.Unix(from, 0).UTC(), now.UTC(), 100); err == nil {
			for _, g := range list {
				at, ok := hour(g.Hour)
				if !ok {
					continue
				}
				row := bellRow{ID: "goal:" + s.ID + ":" + g.Goal + ":" + g.Hour, Kind: "goal", Site: s.ID, At: at, Count: g.Count, Text: g.Goal}
				if n := names[g.Goal]; n != "" {
					row.Text = n
				}
				if p.SignupGoal != "" && g.Goal == p.SignupGoal {
					row.ID, row.Kind = "signup:"+s.ID+":"+g.Hour, "signup"
				}
				out = append(out, row)
			}
		}
	}
	return out
}
