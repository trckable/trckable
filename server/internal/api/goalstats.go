package api

import (
	"context"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/standsout"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The goals list and one goal's page: how often each goal was reached in the period, what a usual day is for it, and
// whether it stands out (the one rule of the standsout package, which the bell's goals card uses too).

const (
	goalEventsMax  = 200
	goalSparkDays  = 30
	goalSourcesTop = 5
)

// goalRow is one goal over the period.
type goalRow struct {
	Goal  string `json:"goal"`
	Name  string `json:"name"`
	Page  bool   `json:"page,omitempty"` // reached by seeing a page, not by an event the site sends
	Count int64  `json:"count"`
	standsout.Verdict
	// First is when it was first reached ever (unix seconds), 0 when it never was.
	First int64 `json:"first,omitempty"`
	// Spark is the count of each day of the period, the last goalSparkDays of them.
	Spark []int64 `json:"spark"`
}

// goalDay is a calendar date of the site as text and as an instant.
func goalDates(from, to time.Time, loc *time.Location) (start, end time.Time, days int) {
	f, t := from.In(loc), to.In(loc)
	start = time.Date(f.Year(), f.Month(), f.Day(), 0, 0, 0, 0, time.UTC)
	end = time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	days = int(math.Round(end.Sub(start).Hours() / 24))
	return start, end, max(days, 1)
}

// goalStanding reads every goal's days and firsts for the period p and the window before it, and judges each.
func (a *API) goalStanding(ctx context.Context, q *query.Q, p query.Params, pages []query.Group, names query.GoalNames) ([]goalRow, error) {
	loc, err := time.LoadLocation(p.TZ)
	if err != nil {
		loc = time.UTC
	}
	start, end, days := goalDates(p.From, p.To, loc)
	histFrom := start.AddDate(0, 0, -standsout.Window)
	rows, err := q.GoalDays(ctx, p, time.Date(histFrom.Year(), histFrom.Month(), histFrom.Day(), 0, 0, 0, 0, loc).UTC(), pages)
	if err != nil {
		return nil, err
	}
	first, siteFirst, err := q.GoalFirsts(ctx, p.Site, pages)
	if err != nil {
		return nil, err
	}
	byGoal := map[string]map[string]int64{}
	for _, d := range rows {
		if byGoal[d.Goal] == nil {
			byGoal[d.Goal] = map[string]int64{}
		}
		byGoal[d.Goal][d.Day] += d.Count
	}
	for _, g := range pages {
		if n := strings.TrimSpace(g.Name); n != "" && byGoal[n] == nil {
			byGoal[n] = map[string]int64{}
		}
	}
	isPage := map[string]bool{}
	for _, g := range pages {
		isPage[strings.TrimSpace(g.Name)] = true
	}
	known := siteFirst > 0 && siteFirst < p.From.Unix()
	out := make([]goalRow, 0, len(byGoal))
	for goal, counts := range byGoal {
		var total int64
		var spark []int64
		for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
			n := counts[d.Format(time.DateOnly)]
			total += n
			spark = append(spark, n)
		}
		if total == 0 && !isPage[goal] {
			continue
		}
		if len(spark) > goalSparkDays {
			spark = spark[len(spark)-goalSparkDays:]
		}
		v := standsout.Judge(standsout.In{Count: total, Days: days, History: standsout.History(counts, start), Seen: first[goal] > 0 && first[goal] < p.From.Unix(), Known: known})
		name := goal
		if !isPage[goal] {
			name = names.Name(goal)
		}
		out = append(out, goalRow{Goal: goal, Name: name, Page: isPage[goal], Count: total, Verdict: v, First: first[goal], Spark: spark})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Out != out[j].Out {
			return out[i].Out
		}
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

// goalList is GET /report/goals: every goal of the period with its count, a usual day and whether it stands out.
func (a *API) goalList(w http.ResponseWriter, r *http.Request) {
	if !a.needs(w, r, "goals") {
		return
	}
	q, p, ok := a.params(w, r)
	if !ok {
		return
	}
	pages := pageGoals(r.Context(), a, p.Site)
	rows, err := a.goalStanding(r.Context(), q, p, pages, a.goalNames(r.Context(), p.Site))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	var reached int64
	var out []string
	for _, g := range rows {
		reached += g.Count
		if g.Out {
			out = append(out, g.Goal)
		}
	}
	if rows == nil {
		rows = []goalRow{}
	}
	best := ""
	var share float64
	if src, err := q.GoalSources(r.Context(), p, "", nil, 1); err == nil && len(src) > 0 {
		best = src[0].Source
		if reached > 0 {
			share = float64(src[0].Count) / float64(reached)
		}
	}
	_, _, days := goalDates(p.From, p.To, locOf(p.TZ))
	writeJSON(w, http.StatusOK, map[string]any{"goals": rows, "reached": reached, "out": len(out), "days": days, "source": best, "source_share": share})
}

func locOf(tz string) *time.Location {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return time.UTC
	}
	return loc
}

// goalWho is one time a goal was reached, as the goal's page tells it.
type goalWho struct {
	At      int64  `json:"at"`
	Path    string `json:"path,omitempty"`
	Source  string `json:"source,omitempty"`
	Country string `json:"country,omitempty"`
	Device  string `json:"device,omitempty"`
	OS      string `json:"os,omitempty"`
}

// goalOne is GET /report/goal?goal=: one goal over the period, with each time it was reached and who sent them.
func (a *API) goalOne(w http.ResponseWriter, r *http.Request) {
	if !a.needs(w, r, "goals") {
		return
	}
	goal := r.URL.Query().Get("goal")
	if goal == "" {
		fail(w, http.StatusBadRequest, "goal is required")
		return
	}
	q, p, ok := a.params(w, r)
	if !ok {
		return
	}
	pages := pageGoals(r.Context(), a, p.Site)
	if _, isPage := pageGoalNamed(pages, goal); !isPage {
		if n := event.NormGoal(goal); n != "" {
			goal = n
		}
	}
	rows, err := a.goalStanding(r.Context(), q, p, pages, a.goalNames(r.Context(), p.Site))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	var row *goalRow
	for i := range rows {
		if rows[i].Goal == goal {
			row = &rows[i]
		}
	}
	if row == nil {
		fail(w, http.StatusNotFound, "no such goal")
		return
	}
	events, err := q.GoalEvents(r.Context(), p, goal, pages, goalEventsMax)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	who := make([]goalWho, len(events))
	for i, e := range events {
		who[i] = goalWho{At: e.At, Path: e.Path, Source: e.Source, Country: e.Country, Device: e.Device, OS: e.OS}
	}
	sources, _ := q.GoalSources(r.Context(), p, goal, pages, goalSourcesTop)
	paths, _ := q.GoalPaths(r.Context(), p, goal, pages, goalSourcesTop)
	type src struct {
		Source string `json:"source"`
		Count  int64  `json:"count"`
	}
	top := make([]src, len(sources))
	for i, s := range sources {
		top[i] = src{Source: s.Source, Count: s.Count}
	}
	onPage := make([]src, len(paths))
	for i, s := range paths {
		onPage[i] = src{Source: s.Source, Count: s.Count}
	}
	_, _, days := goalDates(p.From, p.To, locOf(p.TZ))
	out := map[string]any{"goal": row, "events": who, "sources": top, "paths": onPage, "days": days}
	if pr := principalOf(r); pr.user != nil {
		if quiet, err := a.Ctl.GoalQuiet(r.Context(), pr.user.ID); err == nil {
			out["quiet"] = quiet[sqlite.QuietKey(p.Site, goal)]
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// pageGoalNamed finds the page goal with this name.
func pageGoalNamed(pages []query.Group, name string) (query.Group, bool) {
	for _, g := range pages {
		if strings.TrimSpace(g.Name) == name {
			return g, true
		}
	}
	return query.Group{}, false
}
