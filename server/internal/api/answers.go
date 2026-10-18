package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/answers"
	"github.com/trckable/trckable/server/internal/gsc"
	"github.com/trckable/trckable/server/internal/mentions"
	"github.com/trckable/trckable/server/internal/moments"
	"github.com/trckable/trckable/server/internal/permissions"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Answers: what AI assistants say about a site (internal/server/answers.go asks
// them every week).
//
//	GET  /api/v1/sites/{site}/answers/setup            engines, questions, rivals, words, budget (owners)
//	PUT  /api/v1/sites/{site}/answers/questions        {"questions":[{id?,text,active}]}
//	PUT  /api/v1/sites/{site}/answers/competitors      {"competitors":[{name,domain}]}
//	PUT  /api/v1/sites/{site}/answers/country          {"country":"DE"}
//	POST /api/v1/sites/{site}/answers/run              ask now (once in 6 hours)
//	GET  /api/v1/sites/{site}/answers/suggestions      questions and rivals to start from
//	GET  /api/v1/sites/{site}/answers/questions/{id}   the last 6 rounds of one question
//	GET  /api/v1/sites/{site}/report/answers           the report, joined to AI reads, visitors and revenue
//
// With no engine key the setup and the report answer 200 {"engines": []}.
// Reading is open to anyone of the account (and to API keys); changing needs
// permissions.ActChange, which the request guard asks for every non-GET.

const (
	answerAskGap     = 6 * time.Hour
	answerMinText    = 8
	answerMaxText    = 200
	answerMaxRivals  = 5
	answerMaxPages   = 50
	answerMaxChanges = 20
	answerHistory    = 6
)

var answerNames = map[string]string{"openai": "ChatGPT", "perplexity": "Perplexity", "anthropic": "Claude"}

// AnswersOn says Answers exists on this server: an engine has a key.
func (a *API) AnswersOn() bool { return len(a.AnswerEngines) > 0 }

func (a *API) answerEngineList() []map[string]string {
	out := []map[string]string{}
	for _, e := range a.AnswerEngines {
		out = append(out, map[string]string{"id": e, "name": answerNames[e]})
	}
	return out
}

type answerRoundOut struct {
	Done  int `json:"done"`
	Total int `json:"total"`
}

func (a *API) answersSetup(w http.ResponseWriter, r *http.Request) {
	if !a.AnswersOn() {
		writeJSON(w, http.StatusOK, map[string]any{"engines": []any{}})
		return
	}
	site := r.PathValue("site")
	si, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	as, err := a.Ctl.AnswerSiteOf(r.Context(), site)
	qs, err2 := a.Ctl.AnswerQuestionsOf(r.Context(), site)
	comps, err3 := a.Ctl.AnswerCompetitorsOf(r.Context(), site)
	words, err4 := a.Ctl.SearchWords(r.Context(), sqlite.SiteRow{ID: si.ID, Domain: si.Domain, Name: si.Name})
	if err != nil || err2 != nil || err3 != nil || err4 != nil {
		fail(w, http.StatusInternalServerError, "could not read the set-up")
		return
	}
	out := map[string]any{
		"engines": a.answerEngineList(), "questions": qs, "competitors": comps, "words": words,
		"max": a.AnswerMax, "max_competitors": answerMaxRivals, "country": as.Country, "next_at": as.NextAt, "asked_at": as.AskedAt, "budget": nil,
	}
	if as.Round != 0 {
		active := 0
		for _, q := range qs {
			if q.Active {
				active++
			}
		}
		done, _ := a.Ctl.AnswerDone(r.Context(), site, as.Round)
		out["round"] = answerRoundOut{Done: len(done), Total: active * len(a.AnswerEngines) * max(a.AnswerRuns, 1)}
	}
	if p := principalOf(r); canUser(p.user, permissions.ActChange) {
		spent, _ := a.Ctl.AnswerSpend(r.Context(), a.Now().UTC().Format("2006-01"))
		out["budget"] = map[string]any{"used": float64(spent) / 1e6, "cap": a.AnswerBudget, "paused": a.answersPaused(r)}
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *API) answersPaused(r *http.Request) bool {
	v, ok, _ := a.Ctl.Meta(r.Context(), sqlite.AnswerPausedKey)
	n, _ := strconv.ParseInt(v, 10, 64)
	return ok && n > a.Now().Unix()
}

// answersReady answers the write routes while Answers does not exist.
func (a *API) answersReady(w http.ResponseWriter) bool {
	if !a.AnswersOn() {
		fail(w, http.StatusBadRequest, "Answers is not set up on this server.")
		return false
	}
	return true
}

func tidy(s string) string { return strings.Join(strings.Fields(s), " ") }

func (a *API) setAnswerQuestions(w http.ResponseWriter, r *http.Request) {
	if !a.answersReady(w) {
		return
	}
	site := r.PathValue("site")
	si, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	var in struct {
		Questions []sqlite.AnswerQuestion `json:"questions"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if len(in.Questions) > a.AnswerMax {
		fail(w, http.StatusBadRequest, fmt.Sprintf("Too many questions (max %d).", a.AnswerMax))
		return
	}
	words, err := a.Ctl.SearchWords(r.Context(), sqlite.SiteRow{ID: si.ID, Domain: si.Domain, Name: si.Name})
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the words")
		return
	}
	seen := map[string]bool{}
	for i := range in.Questions {
		q := &in.Questions[i]
		q.Text = tidy(q.Text)
		n := len([]rune(q.Text))
		switch {
		case n < answerMinText || n > answerMaxText:
			fail(w, http.StatusBadRequest, "A question needs 8 to 200 characters.")
			return
		case seen[strings.ToLower(q.Text)]:
			fail(w, http.StatusBadRequest, "That question is listed twice.")
			return
		case mentions.HasAny(q.Text, words) || mentions.HasDomain(q.Text, si.Domain):
			fail(w, http.StatusBadRequest, "A question can't name your site. Ask the way a buyer would, without your name.")
			return
		}
		seen[strings.ToLower(q.Text)] = true
	}
	if err := a.Ctl.SetAnswerQuestions(r.Context(), site, in.Questions, a.Now().Unix()); err != nil {
		fail(w, http.StatusInternalServerError, "could not save the questions")
		return
	}
	qs, _ := a.Ctl.AnswerQuestionsOf(r.Context(), site)
	for _, q := range qs {
		if q.Active && a.AnswersWake != nil {
			a.AnswersWake(site)
			break
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"questions": qs})
}

// bareHost is a domain as it is kept: lower case, no scheme, path or "www.".
func bareHost(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return ""
	}
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(u.Hostname(), "www.")
}

func (a *API) setAnswerCompetitors(w http.ResponseWriter, r *http.Request) {
	if !a.answersReady(w) {
		return
	}
	site := r.PathValue("site")
	if !a.siteExists(w, r) {
		return
	}
	var in struct {
		Competitors []sqlite.AnswerCompetitor `json:"competitors"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if len(in.Competitors) > answerMaxRivals {
		fail(w, http.StatusBadRequest, "Up to 5 other sites.")
		return
	}
	seen := map[string]bool{}
	for i := range in.Competitors {
		c := &in.Competitors[i]
		c.Name, c.Domain = tidy(c.Name), bareHost(c.Domain)
		if n := len([]rune(c.Name)); n < 2 || n > 60 {
			fail(w, http.StatusBadRequest, "A name needs 2 to 60 characters.")
			return
		}
		if seen[strings.ToLower(c.Name)] {
			fail(w, http.StatusBadRequest, "That site is listed twice.")
			return
		}
		seen[strings.ToLower(c.Name)] = true
	}
	if err := a.Ctl.SetAnswerCompetitors(r.Context(), site, in.Competitors, a.Now().Unix()); err != nil {
		fail(w, http.StatusInternalServerError, "could not save the sites")
		return
	}
	out, _ := a.Ctl.AnswerCompetitorsOf(r.Context(), site)
	writeJSON(w, http.StatusOK, map[string]any{"competitors": out})
}

var countryCode = regexp.MustCompile(`^[A-Za-z]{2}$`)

func (a *API) setAnswerCountry(w http.ResponseWriter, r *http.Request) {
	if !a.answersReady(w) {
		return
	}
	if !a.siteExists(w, r) {
		return
	}
	var in struct {
		Country string `json:"country"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	c := strings.TrimSpace(in.Country)
	if c != "" && !countryCode.MatchString(c) {
		fail(w, http.StatusBadRequest, "Use a two-letter country code.")
		return
	}
	c = strings.ToUpper(c)
	if err := a.Ctl.SetAnswerCountry(r.Context(), r.PathValue("site"), c, a.Now().Unix()); err != nil {
		fail(w, http.StatusInternalServerError, "could not save the country")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"country": c})
}

func (a *API) askAnswersNow(w http.ResponseWriter, r *http.Request) {
	if !a.answersReady(w) {
		return
	}
	site := r.PathValue("site")
	if !a.siteExists(w, r) {
		return
	}
	qs, err := a.Ctl.AnswerQuestionsOf(r.Context(), site)
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the questions")
		return
	}
	active := false
	for _, q := range qs {
		active = active || q.Active
	}
	if !active {
		fail(w, http.StatusBadRequest, "Add a question first.")
		return
	}
	as, err := a.Ctl.AnswerSiteOf(r.Context(), site)
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the schedule")
		return
	}
	now := a.Now()
	if left := time.Unix(as.AskedAt, 0).Add(answerAskGap).Sub(now); as.AskedAt > 0 && left > 0 {
		hours := int((left + time.Hour - 1) / time.Hour)
		unit := "hours"
		if hours == 1 {
			unit = "hour"
		}
		w.Header().Set("Retry-After", strconv.Itoa(int(left.Seconds())))
		fail(w, http.StatusTooManyRequests, fmt.Sprintf("You can ask again in %d %s.", hours, unit))
		return
	}
	if err := a.Ctl.AskAnswersNow(r.Context(), site, now.Unix()); err != nil {
		fail(w, http.StatusInternalServerError, "could not start a round")
		return
	}
	if a.AnswersWake != nil {
		a.AnswersWake(site)
	}
	writeJSON(w, http.StatusOK, map[string]int64{"asked_at": now.Unix(), "next_at": 0})
}

// The pieces of a homepage that say what the site is about.
var (
	titleTag = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	descTag  = regexp.MustCompile(`(?is)<meta[^>]+name=["']description["'][^>]*>`)
	contentA = regexp.MustCompile(`(?is)content=["']([^"']*)["']`)
)

func (a *API) answerSuggestions(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	si, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	if !a.AnswersOn() {
		writeJSON(w, http.StatusOK, map[string]any{"engines": []any{}})
		return
	}
	words, _ := a.Ctl.SearchWords(r.Context(), sqlite.SiteRow{ID: si.ID, Domain: si.Domain, Name: si.Name})
	setup, _ := a.Ctl.SetupOf(r.Context(), site)
	var title, desc string
	if page, _, status, err := fetchText(r.Context(), checkClient(), "https://"+si.Domain+"/"); err == nil && status == http.StatusOK {
		if m := titleTag.FindStringSubmatch(page); m != nil {
			title = tidy(mentions.Snippet(m[1]))
		}
		if m := descTag.FindString(page); m != "" {
			if c := contentA.FindStringSubmatch(m); c != nil {
				desc = tidy(mentions.Snippet(c[1]))
			}
		}
	}
	questions := answers.SuggestQuestions(setup.Kind, title, desc, a.searchQueries(r, site), words)
	cited := map[string]int{}
	if urls, err := a.Ctl.AnswerCitedURLs(r.Context(), site); err == nil {
		for u, n := range urls {
			if h := mentions.HostOf(u); h != "" {
				cited[h] += n
			}
		}
	}
	rivals := answers.SuggestRivals(cited, si.Domain)
	have, _ := a.Ctl.AnswerCompetitorsOf(r.Context(), site)
	skip := map[string]bool{}
	for _, c := range have {
		skip[c.Domain] = true
	}
	list := []map[string]string{}
	for _, v := range rivals {
		if !skip[v.Domain] {
			list = append(list, map[string]string{"name": v.Name, "domain": v.Domain})
		}
	}
	if questions == nil {
		questions = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"questions": questions, "competitors": list})
}

// searchQueries are what people searched on Google in the last 90 days, when
// Search Console is connected; none otherwise or when Google does not answer.
func (a *API) searchQueries(r *http.Request, site string) []string {
	if !a.moduleOn(r, site, "search") {
		return nil
	}
	c, err := a.Ctl.SearchConsoleOf(r.Context(), site)
	if err != nil || c.Property == "" {
		return nil
	}
	loc := time.UTC
	last := startOfDay(a.Now().In(loc), loc).AddDate(0, 0, -1)
	from := last.AddDate(0, 0, -89)
	body, _, err := a.searchBody(r.Context(), site, c, loc, gsc.Query{From: from, To: last, Dimension: "query", Limit: 100}, from, last)
	if err != nil {
		return nil
	}
	rows, _ := body["rows"].([]gsc.Row)
	var out []string
	for _, row := range rows {
		out = append(out, row.Key)
	}
	return out
}

type answerEngineOut struct {
	Seen     int `json:"seen"`
	Runs     int `json:"runs"`
	Named    int `json:"named"`
	Cited    int `json:"cited"`
	Position int `json:"position"`
}

type answerQuestionOut struct {
	ID      int64                      `json:"id"`
	Text    string                     `json:"text"`
	Active  bool                       `json:"active"`
	Engines map[string]answerEngineOut `json:"engines"`
	State   string                     `json:"state"`
	Instead []string                   `json:"instead"`
	Pages   []string                   `json:"pages"`
}

type answerPageOut struct {
	Path    string `json:"path"`
	Answers int    `json:"answers"`
	Read    *int64 `json:"read,omitempty"`
	Sent    *int64 `json:"sent,omitempty"`
	Revenue *int64 `json:"revenue,omitempty"`
}

type answerTotal struct {
	Round int64 `json:"round"`
	Seen  int64 `json:"seen"`
	Total int64 `json:"total"`
}

type answerLatest struct {
	answerTotal
	Complete bool `json:"complete"`
}

// runState is how one run treated the site.
func runState(r sqlite.AnswerRun) string {
	switch {
	case r.Named && r.Cited:
		return "both"
	case r.Named:
		return "named"
	case r.Cited:
		return "cited"
	}
	return "none"
}

var stateRank = map[string]int{"both": 3, "named": 2, "cited": 1, "none": 0}

func (a *API) answersReport(w http.ResponseWriter, r *http.Request) {
	if !a.AnswersOn() {
		writeJSON(w, http.StatusOK, map[string]any{"engines": []any{}})
		return
	}
	site := r.PathValue("site")
	ask := a.parse(w, r, site, true)
	if ask == nil {
		return
	}
	ctx := r.Context()
	as, err := a.Ctl.AnswerSiteOf(ctx, site)
	rounds, err2 := a.Ctl.AnswerRounds(ctx, site)
	qs, err3 := a.Ctl.AnswerQuestionsOf(ctx, site)
	comps, err4 := a.Ctl.AnswerCompetitorsOf(ctx, site)
	if err != nil || err2 != nil || err3 != nil || err4 != nil {
		fail(w, http.StatusInternalServerError, "could not read the answers")
		return
	}
	from, to := ask.Params.From.Unix(), ask.Params.To.Unix()
	inPeriod := []answerTotal{}
	latestAt := -1
	for i, rd := range rounds {
		if rd.Round >= from && rd.Round < to {
			inPeriod = append(inPeriod, answerTotal{rd.Round, rd.Seen, rd.Total})
			latestAt = i
		}
	}
	out := map[string]any{
		"engines": a.AnswerEngines, "latest": nil, "was": nil, "rivals": []any{}, "questions": []answerQuestionOut{}, "pages": []answerPageOut{},
		"money": map[string]any{"currency": "", "exponent": 2}, "rounds": inPeriod, "changes": []any{},
		"paused": a.answersPaused(r), "next_at": as.NextAt, "country": as.Country,
	}
	changes, _ := a.Ctl.AnswerChangesIn(ctx, site, from, answerMaxChanges*2)
	changeOut := []map[string]any{}
	for _, c := range changes {
		if c.Round >= to || len(changeOut) == answerMaxChanges {
			continue
		}
		changeOut = append(changeOut, map[string]any{"at": c.At, "engine": c.Engine, "question_id": c.QuestionID, "question": c.Question, "kind": c.Kind, "first_ever": c.FirstEver})
	}
	out["changes"] = changeOut

	if latestAt >= 0 {
		rd := rounds[latestAt]
		out["latest"] = answerLatest{answerTotal{rd.Round, rd.Seen, rd.Total}, rd.Round != as.Round}
		if latestAt > 0 {
			p := rounds[latestAt-1]
			out["was"] = answerTotal{p.Round, p.Seen, p.Total}
		}
		runs, err := a.Ctl.AnswerRunsOf(ctx, site, rd.Round)
		if err != nil {
			fail(w, http.StatusInternalServerError, "could not read the answers")
			return
		}
		qOut, rivals := answerQuestions(qs, comps, runs, a.AnswerEngines)
		out["questions"], out["rivals"] = qOut, rivals
	} else {
		qOut := make([]answerQuestionOut, 0, len(qs))
		for _, q := range qs {
			qOut = append(qOut, answerQuestionOut{ID: q.ID, Text: q.Text, Active: q.Active, Engines: map[string]answerEngineOut{}, Instead: []string{}, Pages: []string{}})
		}
		out["questions"] = qOut
	}
	pages, money := a.answerPages(r, ask, site)
	out["pages"] = pages
	if money != nil {
		out["money"] = money
	}
	w.Header().Set("Cache-Control", "private, max-age=30")
	writeJSON(w, http.StatusOK, out)
}

// answerQuestions folds a round's runs into one row per question, and the
// rivals' totals. Only runs that answered count.
func answerQuestions(qs []sqlite.AnswerQuestion, comps []sqlite.AnswerCompetitor, runs []sqlite.AnswerRun, engines []string) ([]answerQuestionOut, []answerTotal2) {
	byQ := map[int64][]sqlite.AnswerRun{}
	var total int64
	seenBy := map[string]int64{}
	for _, run := range runs {
		if !run.OK {
			continue
		}
		total++
		byQ[run.QuestionID] = append(byQ[run.QuestionID], run)
		for _, v := range run.Rivals {
			if v.Named || v.Cited {
				seenBy[v.Name]++
			}
		}
	}
	rivals := []answerTotal2{}
	for _, c := range comps {
		rivals = append(rivals, answerTotal2{Name: c.Name, Seen: seenBy[c.Name], Total: total})
	}
	sort.SliceStable(rivals, func(i, j int) bool { return rivals[i].Seen > rivals[j].Seen })
	out := make([]answerQuestionOut, 0, len(qs))
	for _, q := range qs {
		o := answerQuestionOut{ID: q.ID, Text: q.Text, Active: q.Active, Engines: map[string]answerEngineOut{}, Instead: []string{}, Pages: []string{}}
		states := map[string]int{}
		instead := map[string]int{}
		pages := map[string]bool{}
		for _, run := range byQ[q.ID] {
			e := o.Engines[run.Engine]
			e.Runs++
			if run.Named {
				e.Named++
			}
			if run.Cited {
				e.Cited++
			}
			if run.Named || run.Cited {
				e.Seen++
			}
			if run.Position > 0 && (e.Position == 0 || run.Position < e.Position) {
				e.Position = run.Position
			}
			o.Engines[run.Engine] = e
			states[runState(run)]++
			for _, v := range run.Rivals {
				if v.Named || v.Cited {
					instead[v.Name]++
				}
			}
			var paths []string
			_ = json.Unmarshal([]byte(run.CitedPaths), &paths)
			for _, p := range paths {
				pages[p] = true
			}
		}
		best, bestN := "", 0
		for _, s := range []string{"both", "named", "cited", "none"} {
			if states[s] > bestN || states[s] == bestN && bestN > 0 && stateRank[s] > stateRank[best] {
				best, bestN = s, states[s]
			}
		}
		o.State = best
		o.Instead = topNames(instead, 5)
		for p := range pages {
			o.Pages = append(o.Pages, p)
		}
		sort.Strings(o.Pages)
		out = append(out, o)
	}
	return out, rivals
}

type answerTotal2 struct {
	Name  string `json:"name"`
	Seen  int64  `json:"seen"`
	Total int64  `json:"total"`
}

func topNames(m map[string]int, n int) []string {
	names := make([]string, 0, len(m))
	for k := range m {
		names = append(names, k)
	}
	sort.Slice(names, func(i, j int) bool {
		if m[names[i]] != m[names[j]] {
			return m[names[i]] > m[names[j]]
		}
		return names[i] < names[j]
	})
	if len(names) > n {
		names = names[:n]
	}
	return names
}

// answerPages lists the same-host pages the answers linked in the period and
// joins them to AI reads, AI visitors and the revenue those visitors made.
// Each part is left out when its source is not ready: never a 503 for a join.
func (a *API) answerPages(r *http.Request, ask *asked, site string) ([]answerPageOut, map[string]any) {
	counts, err := a.Ctl.AnswerCitedPaths(r.Context(), site, ask.Params.From.Unix(), ask.Params.To.Unix()-1)
	if err != nil || len(counts) == 0 {
		return []answerPageOut{}, nil
	}
	paths := make([]string, 0, len(counts))
	for p := range counts {
		paths = append(paths, p)
	}
	sort.Slice(paths, func(i, j int) bool {
		if counts[paths[i]] != counts[paths[j]] {
			return counts[paths[i]] > counts[paths[j]]
		}
		return paths[i] < paths[j]
	})
	if len(paths) > answerMaxPages {
		paths = paths[:answerMaxPages]
	}
	rows := make([]answerPageOut, len(paths))
	idx := map[string]int{}
	for i, p := range paths {
		rows[i] = answerPageOut{Path: p, Answers: counts[p]}
		idx[p] = i
	}
	q := a.Query()
	if q == nil {
		return rows, nil
	}
	p := ask.Params
	p.Filters, p.Daily, p.Deep, p.Sales, p.SalePages, p.Buyers = nil, false, false, false, false, 0
	if list, err := q.AIPagesFor(r.Context(), p, paths); err == nil {
		for _, pg := range list {
			read, sent := pg.Read, pg.Sent
			rows[idx[pg.Path]].Read, rows[idx[pg.Path]].Sent = &read, &sent
		}
	}
	var money map[string]any
	if p.Revenue {
		rp := p
		rp.Filters = []query.Filter{{Dim: "channel", Value: "AI"}}
		rp.Limit = 100
		if res, err := a.cachedReport(r, q, rp); err == nil {
			got := map[string]int64{}
			for _, row := range res.RevenueDims["entry_page"] {
				if row.Revenue != nil {
					got[row.Value] = *row.Revenue
				}
			}
			for i := range rows {
				v := got[rows[i].Path] // a page no AI visit paid for earned nothing
				rows[i].Revenue = &v
			}
			if res.Money != nil {
				money = map[string]any{"currency": res.Money.Currency, "exponent": res.Money.Exponent}
			}
		}
	}
	return rows, money
}

type answerRunOut struct {
	Run       int                  `json:"run"`
	OK        bool                 `json:"ok"`
	Error     string               `json:"error"`
	AskedAt   int64                `json:"asked_at"`
	Model     string               `json:"model"`
	Text      string               `json:"text"`
	Citations []answers.Citation   `json:"citations"`
	Sources   []answers.Citation   `json:"sources"`
	Named     bool                 `json:"named"`
	Cited     bool                 `json:"cited"`
	Position  int                  `json:"position"`
	Sentence  string               `json:"sentence"`
	Rivals    []answerRivalOutJSON `json:"rivals"`
}

type answerRivalOutJSON struct {
	Name     string `json:"name"`
	Named    bool   `json:"named"`
	Cited    bool   `json:"cited"`
	Position int    `json:"position"`
}

func (a *API) answerQuestion(w http.ResponseWriter, r *http.Request) {
	if !a.AnswersOn() {
		writeJSON(w, http.StatusOK, map[string]any{"engines": []any{}})
		return
	}
	site := r.PathValue("site")
	si, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	qs, err2 := a.Ctl.AnswerQuestionsOf(r.Context(), site)
	if err != nil || err2 != nil {
		fail(w, http.StatusNotFound, "question not found")
		return
	}
	var q *sqlite.AnswerQuestion
	for i := range qs {
		if qs[i].ID == id {
			q = &qs[i]
		}
	}
	if q == nil {
		fail(w, http.StatusNotFound, "question not found")
		return
	}
	words, _ := a.Ctl.SearchWords(r.Context(), sqlite.SiteRow{ID: si.ID, Domain: si.Domain, Name: si.Name})
	runs, err := a.Ctl.AnswerQuestionRuns(r.Context(), site, id, answerHistory)
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the answers")
		return
	}
	type roundOut struct {
		Round   int64                     `json:"round"`
		Engines map[string][]answerRunOut `json:"engines"`
	}
	rounds := []roundOut{}
	for _, run := range runs { // newest round first
		if len(rounds) == 0 || rounds[len(rounds)-1].Round != run.Round {
			rounds = append(rounds, roundOut{Round: run.Round, Engines: map[string][]answerRunOut{}})
		}
		o := answerRunOut{Run: run.Run, OK: run.OK, Error: run.Error, AskedAt: run.AskedAt, Model: run.Model, Text: run.Text,
			Citations: []answers.Citation{}, Sources: []answers.Citation{}, Named: run.Named, Cited: run.Cited, Position: run.Position, Rivals: []answerRivalOutJSON{}}
		_ = json.Unmarshal([]byte(run.Citations), &o.Citations)
		_ = json.Unmarshal([]byte(run.Sources), &o.Sources)
		if o.Text != "" && run.Named {
			o.Sentence = mentions.Sentence(o.Text, append(append([]string{}, words...), si.Domain))
		}
		for _, v := range run.Rivals {
			o.Rivals = append(o.Rivals, answerRivalOutJSON{v.Name, v.Named, v.Cited, v.Position})
		}
		cur := rounds[len(rounds)-1]
		cur.Engines[run.Engine] = append(cur.Engines[run.Engine], o)
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": q.ID, "text": q.Text, "active": q.Active, "rounds": rounds})
}

// answerMoments are the changes a finished round made in the period: an
// engine that began naming the site, or stopped.
func (a *API) answerMoments(r *http.Request, site string, p query.Params, loc *time.Location) []moments.Moment {
	if !a.AnswersOn() {
		return nil
	}
	list, err := a.Ctl.AnswerChangesIn(r.Context(), site, p.From.Unix(), maxMoments)
	if err != nil {
		return nil
	}
	var out []moments.Moment
	for _, c := range list {
		if c.Round >= p.To.Unix() {
			continue
		}
		at := time.Unix(c.At, 0).In(loc)
		hour := time.Date(at.Year(), at.Month(), at.Day(), at.Hour(), 0, 0, 0, time.UTC).Format("2006-01-02T15:04")
		out = append(out, moments.Moment{T: bucketKey(hour, p.Bucket), Kind: "answer", Bot: c.Engine, Question: c.QuestionID, Text: c.Question, What: c.Kind})
	}
	return out
}
