package api

import (
	"context"
	"net/http"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/busier"
	"github.com/trckable/trckable/server/internal/moments"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/surge"
)

// A site far busier than usual right now (internal/surge, judged by internal/busier): the dashboard asks
// about it every minute while it is open, and the server's alert loop asks
// for the sites nobody has open. Whoever sees one begin records it (as a
// moment on the chart) and tells OnSurge, once: the book of surges is shared.

// surgeAnswer is what GET /api/v1/sites/{site}/surge sends: the surge that is
// on now, or none.
type surgeAnswer struct {
	Surge *surgeOut `json:"surge"`
}

type surgeOut struct {
	surge.Surge
	Times float64 `json:"times"` // the peak against the usual, as the dashboard says it (2.6)
	// Story is how it went (the shape of the last hour, when it began, who is
	// there), worked out when asked and kept half a minute.
	Story *surge.Story `json:"story,omitempty"`
}

type storyEntry struct {
	id    string
	at    time.Time
	story *surge.Story
}

func (a *API) surgeNow(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	if a.Query() == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	out := surgeAnswer{}
	if s := a.CheckSurge(r.Context(), site); s != nil && s.ID != "" {
		out.Surge = &surgeOut{Surge: *s, Times: moments.Round(s.Factor()), Story: a.surgeStory(r.Context(), site, *s)}
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, out)
}

// CheckSurge looks at a site now (a look in the last half minute is reused)
// and returns the surge that is on, or nil.
func (a *API) CheckSurge(ctx context.Context, site string) *surge.Surge {
	a.init()
	q := a.Query()
	if q == nil {
		return nil
	}
	now := a.Now()
	if !a.surges.Known(site) {
		latest, _ := a.Ctl.LatestSurge(ctx, site)
		a.surges.Seed(site, latest)
	}
	if cur, ok := a.surges.Recent(site, now); ok {
		return cur
	}
	online, err := q.Online(ctx, site, now)
	if err != nil {
		return nil
	}
	read := surge.Reading{Online: online}
	loc, _ := time.LoadLocation(a.Ctl.SiteZone(ctx, site))
	if loc == nil {
		loc = time.UTC
	}
	// Under Plus people nothing can be busier than usual, unless a surge is on
	// and may be ending: the usual is only worked out when it could matter.
	if online >= busier.Plus || a.surges.Active(site) {
		if read.Usual, read.Busy, err = a.busierUsual(ctx, q, site, now, loc, online); err != nil {
			return nil
		}
	}
	act, s := a.surges.Step(site, now, read)
	switch act {
	case surge.Start:
		s = a.nameSurge(ctx, q, site, now, loc, s)
		if s == nil {
			return nil
		}
		if a.OnSurge != nil {
			go a.OnSurge(*s)
		}
	case surge.Keep:
		if s.Online == online && s.ID != "" {
			_ = a.Ctl.SaveSurge(ctx, *s) // a new peak
		}
	case surge.End:
		_ = a.Ctl.SaveSurge(ctx, *s)
		return nil
	}
	return s
}

// nameSurge asks who the people online are, gives the surge its reasons and
// keeps it. Without an answer it is still a surge, with no reasons.
func (a *API) nameSurge(ctx context.Context, q *query.Q, site string, now time.Time, loc *time.Location, s *surge.Surge) *surge.Surge {
	var why surge.Why
	var hosts []string
	if w, err := q.SurgeWho(ctx, site, now); err == nil {
		why, hosts = surge.Build(seenOf(w), int(query.SurgeAhead/time.Minute))
		if why.Source != "" {
			why.SourceUsual, _ = q.SurgeUsualFrom(ctx, site, now, loc, hosts)
		}
	}
	named := a.surges.Name(site, auth.Token("surge_", 8), why)
	if named == nil {
		return nil
	}
	_ = a.Ctl.SaveSurge(ctx, *named) // kept for the chart and the report; the surge is told either way
	return named
}

func seenOf(w *query.SurgeWho) surge.Seen {
	list := func(in []query.SurgeCount) []surge.Count {
		out := make([]surge.Count, len(in))
		for i, c := range in {
			out[i] = surge.Count{Value: c.Value, N: c.N}
		}
		return out
	}
	return surge.Seen{Online: w.Online, Before: w.Before, Hosts: list(w.Hosts), Channels: list(w.Channels),
		Pages: list(w.Pages), Countries: list(w.Countries), Campaigns: list(w.Campaigns), Devices: list(w.Devices)}
}

// surgeMoments are the surges that began in the period, as moments: the chart
// shows each where it happened, "Surge from Facebook".
func (a *API) surgeMoments(r *http.Request, site string, p query.Params, loc *time.Location) []moments.Moment {
	list, err := a.Ctl.SurgesBetween(r.Context(), site, p.From.Unix(), p.To.Unix())
	if err != nil {
		return nil
	}
	var out []moments.Moment
	for _, s := range list {
		at := time.Unix(s.Started, 0).In(loc)
		hour := time.Date(at.Year(), at.Month(), at.Day(), at.Hour(), 0, 0, 0, time.UTC).Format("2006-01-02T15:04")
		m := moments.Moment{T: bucketKey(hour, p.Bucket), Kind: "surge", Visitors: s.Online, Factor: moments.Round(s.Factor()), Text: s.Why.Source}
		switch s.Why.SourceDim {
		case "referrer":
			m.Referrer = s.Why.SourceValue
		case "channel":
			m.Channel = s.Why.SourceValue
		}
		out = append(out, m)
	}
	return out
}

// surgeStory tells how the surge went, from the last hour's counts. A look in
// the last half minute is reused; with no answer there is no story, and the
// card tells the rest without it.
func (a *API) surgeStory(ctx context.Context, site string, s surge.Surge) *surge.Story {
	now := a.Now()
	a.storyMu.Lock()
	e, ok := a.stories[site]
	a.storyMu.Unlock()
	if ok && e.id == s.ID && now.Sub(e.at) < surge.Fresh && !now.Before(e.at) {
		return e.story
	}
	q := a.Query()
	if q == nil {
		return nil
	}
	series, err := q.SurgeSeries(ctx, site, now)
	if err != nil {
		return nil
	}
	who, err := q.SurgeWho(ctx, site, now)
	if err != nil {
		return nil
	}
	seen := seenOf(who)
	story := surge.BuildStory(series, now, func(n int64) bool { return busier.Judge(n, s.Usual, s.Usual > 0) == busier.Busier }, seen)
	a.storyMu.Lock()
	if a.stories == nil {
		a.stories = map[string]storyEntry{}
	}
	a.stories[site] = storyEntry{id: s.ID, at: now, story: &story}
	a.storyMu.Unlock()
	return &story
}
