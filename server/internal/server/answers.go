package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"log/slog"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/answers"
	"github.com/trckable/trckable/server/internal/mailkit"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Answers: every week (TRCKABLE_ANSWERS_EVERY) each site with a question asks
// ChatGPT, Perplexity and Claude, twice each, and keeps who was named and
// linked. A round is reserved against the monthly budget before it starts, so
// there are no half rounds, and it can be picked up again after a restart or
// an engine's pause: the same round number, only the missing asks.

const (
	answerTick      = 5 * time.Minute
	answerStartMax  = 3 // sites started per tick
	answerKeep      = 6 // rounds that keep their text
	answerStallMax  = 3 // ticks an engine may make no progress before its rest is let go
	answerPauseMax  = 30 * time.Minute
	answerCallLimit = 90 * time.Second
)

// Fixed messages kept with a failed ask: never a provider's own words.
const (
	answerKeyMsg   = "The engine refused the key."
	answerSetupMsg = "Web search is not turned on for this key's account."
	answerBusyMsg  = "The engine was busy. This ask was skipped."
	answerFailMsg  = "No answer this time."
)

type answerAsker struct {
	st     *sqlite.Store
	askers []answers.Asker
	every  time.Duration
	runs   int
	budget int64 // micro-USD a month; 0 = no cap
	now    func() time.Time
	sleep  func(ctx context.Context, d time.Duration)
	gap    time.Duration
	pause  pauses
	wake   chan string
	// told sends an alert of kind "answer" to one site's people; it says whether anyone was told.
	told func(ctx context.Context, site, title, msg string) bool

	mu      sync.Mutex
	broken  map[answers.Engine]bool
	stalls  map[string]int
	blocked map[string]bool  // "site/round/question": an ask was paid for and could not be kept, so it is not asked again this round
	unsaved map[string]int64 // month -> micro-USD paid for asks that could not be kept (counted when even the spend could not be written)
}

// newAnswerAsker builds the scheduler from the keys this server has.
func (s *Server) newAnswerAsker() *answerAsker {
	return &answerAsker{
		st: s.ctl, askers: answers.FromConfig(alerts.SafeClient(answerCallLimit), s.cfg), every: s.cfg.AnswersEvery, runs: s.cfg.AnswersRuns,
		budget: int64(s.cfg.AnswersBudget) * 1_000_000, now: time.Now, gap: 2 * time.Second,
		sleep: func(ctx context.Context, d time.Duration) {
			select {
			case <-ctx.Done():
			case <-time.After(d):
			}
		},
		wake: make(chan string, 16), told: s.tellAnswer,
	}
}

// runAnswers waits a minute after boot, then looks every 5 minutes or when woken.
func (s *Server) runAnswers(ctx context.Context) {
	f := s.answers
	if f == nil {
		return
	}
	f.sleep(ctx, time.Minute)
	for ctx.Err() == nil {
		f.tick(ctx)
		f.waitTick(ctx)
	}
}

// waitTick returns after 5 minutes, or when a site is woken.
func (f *answerAsker) waitTick(ctx context.Context) {
	t := time.NewTimer(answerTick)
	defer t.Stop()
	select {
	case <-ctx.Done():
	case <-f.wake:
	case <-t.C:
	}
}

// Wake asks for a look now (the owner pressed "Ask now" or saved the first questions).
func (f *answerAsker) Wake(site string) {
	select {
	case f.wake <- site:
	default:
	}
}

func month(t time.Time) string { return t.UTC().Format("2006-01") }

func monthStart(t time.Time) time.Time {
	t = t.UTC()
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
}

func (f *answerAsker) model(a answers.Asker) string {
	if m, ok := a.(answers.Modeler); ok {
		return m.Model()
	}
	return ""
}

func (f *answerAsker) usable() []answers.Asker {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []answers.Asker
	for _, a := range f.askers {
		if !f.broken[a.Engine()] {
			out = append(out, a)
		}
	}
	return out
}

// tick resumes the rounds in progress, then starts the sites that are due.
func (f *answerAsker) tick(ctx context.Context) {
	if f.every <= 0 || len(f.askers) == 0 {
		return
	}
	running, err := f.st.AnswerSitesInProgress(ctx)
	if err != nil {
		slog.Warn("answers: rounds not read", "err", err)
		return
	}
	for _, site := range running {
		if ctx.Err() != nil {
			return
		}
		f.runRound(ctx, site)
	}
	due, err := f.st.AnswerSitesDue(ctx, f.now().Unix(), answerStartMax)
	if err != nil {
		slog.Warn("answers: due sites not read", "err", err)
		return
	}
	for _, site := range due {
		if ctx.Err() != nil {
			return
		}
		started, ok := f.start(ctx, site)
		if ok {
			f.runRound(ctx, started)
		}
	}
}

// start reserves a whole round against the budget and marks it running. The
// round asks the questions active now, and only those: a save made while it
// runs applies from the next round. A site the budget refuses waits for next month.
func (f *answerAsker) start(ctx context.Context, site sqlite.AnswerSite) (sqlite.AnswerSite, bool) {
	qs, err := f.st.AnswerQuestionsOf(ctx, site.SiteID)
	if err != nil {
		return site, false
	}
	var ids []int64
	for _, q := range qs {
		if q.Active {
			ids = append(ids, q.ID)
		}
	}
	var perCall int64
	engines := f.usable()
	for _, a := range engines {
		perCall += answers.Typical(a.Engine(), f.model(a))
	}
	est := int64(len(ids)*f.runs) * perCall
	now := f.now()
	if len(ids) == 0 || len(engines) == 0 {
		return site, false
	}
	if f.budget > 0 {
		f.mu.Lock()
		defer f.mu.Unlock()
		spent, err := f.st.AnswerSpend(ctx, month(now))
		held, err2 := f.st.AnswerReserved(ctx)
		if err != nil || err2 != nil {
			return site, false
		}
		spent += f.unsaved[month(now)]
		share := f.budget
		if n, err := f.st.AnswerSitesWithQuestions(ctx); err == nil && n > 1 {
			share = f.budget / int64(n)
		}
		mine, _ := f.st.AnswerSiteSpend(ctx, site.SiteID, monthStart(now).Unix())
		nextMonth := monthStart(now).AddDate(0, 1, 0).Unix()
		switch {
		case spent+held+est > f.budget:
			f.holdBack(ctx, now)
			_ = f.st.DelayAnswers(ctx, site.SiteID, nextMonth, now.Unix())
			return site, false
		case mine > 0 && mine+est > share:
			// A fair share is spent: this site waits for next month, so it
			// does not keep a place that other sites could have.
			_ = f.st.DelayAnswers(ctx, site.SiteID, nextMonth, now.Unix())
			return site, false
		}
	}
	round := now.Unix()
	if err := f.st.StartAnswerRound(ctx, site.SiteID, round, ids, est, round); err != nil {
		return site, false
	}
	site.Round, site.Frozen = round, ids
	return site, true
}

// holdBack records that the budget is spent and tells each site's people, once a month.
func (f *answerAsker) holdBack(ctx context.Context, now time.Time) {
	until := monthStart(now).AddDate(0, 1, 0).Unix()
	if v, ok, _ := f.st.Meta(ctx, sqlite.AnswerPausedKey); ok {
		if n, _ := strconv.ParseInt(v, 10, 64); n > now.Unix() {
			return
		}
	}
	_ = f.st.SetMeta(ctx, sqlite.AnswerPausedKey, strconv.FormatInt(until, 10))
	slog.Info("answers: the monthly budget is spent; rounds wait for next month")
	sites, err := f.st.AnswerSitesDue(ctx, now.Unix()+1<<40, 1000)
	if err != nil || f.told == nil {
		return
	}
	for _, s := range sites {
		f.told(ctx, s.SiteID, "Answers is resting this month", "The monthly budget for asking AI assistants is used up, so the next round waits until the first of next month. The budget is TRCKABLE_ANSWERS_BUDGET.")
	}
}

type askSlot struct {
	q   sqlite.AnswerQuestion
	run int
}

// runRound asks what is missing from a site's round, then finishes it when nothing is.
func (f *answerAsker) runRound(ctx context.Context, site sqlite.AnswerSite) {
	row, err := f.st.SiteInfo(ctx, site.SiteID)
	if err != nil {
		return
	}
	active, err := f.roundQuestions(ctx, site)
	if err != nil {
		return
	}
	words, err := f.st.SearchWords(ctx, sqlite.SiteRow{ID: row.ID, Domain: row.Domain, Name: row.Name})
	if err != nil {
		return
	}
	comps, _ := f.st.AnswerCompetitorsOf(ctx, site.SiteID)
	rivals := make([]answers.Rival, 0, len(comps))
	for _, c := range comps {
		rivals = append(rivals, answers.Rival{Name: c.Name, Domain: c.Domain})
	}
	done, err := f.st.AnswerDone(ctx, site.SiteID, site.Round)
	if err != nil {
		return
	}
	var wg sync.WaitGroup
	progress := map[answers.Engine]int{}
	limited := map[answers.Engine]bool{}
	var pmu sync.Mutex
	for _, a := range f.usable() {
		var todo []askSlot
		for _, q := range active {
			for r := 1; r <= f.runs; r++ {
				if !done[sqlite.DoneKey(q.ID, string(a.Engine()), r)] && !f.isBlocked(site, q.ID) {
					todo = append(todo, askSlot{q, r})
				}
			}
		}
		if len(todo) == 0 {
			continue
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			n, lim := f.askEngine(ctx, a, site, row.Domain, words, rivals, todo)
			pmu.Lock()
			progress[a.Engine()], limited[a.Engine()] = n, lim
			pmu.Unlock()
		}()
	}
	wg.Wait()
	if ctx.Err() != nil {
		return
	}
	// An engine that keeps being refused for three ticks is let go for this round.
	f.mu.Lock()
	var giveUp []answers.Asker
	for _, a := range f.askers {
		k := site.SiteID + "/" + string(a.Engine())
		switch {
		case limited[a.Engine()] && progress[a.Engine()] == 0:
			if f.stalls == nil {
				f.stalls = map[string]int{}
			}
			if f.stalls[k]++; f.stalls[k] >= answerStallMax {
				giveUp = append(giveUp, a)
				delete(f.stalls, k)
			}
		case progress[a.Engine()] > 0:
			delete(f.stalls, k)
		}
	}
	f.mu.Unlock()
	for _, a := range giveUp {
		f.failRest(ctx, a, site, active, answerBusyMsg)
	}
	f.finish(ctx, site, active)
}

// askEngine asks one engine's missing slots one after another. It returns how
// many it stored and whether the engine asked for a pause.
func (f *answerAsker) askEngine(ctx context.Context, a answers.Asker, site sqlite.AnswerSite, domain string, words []string, rivals []answers.Rival, todo []askSlot) (int, bool) {
	engine := a.Engine()
	stored := 0
	for i, slot := range todo {
		if ctx.Err() != nil {
			return stored, false
		}
		if f.isBlocked(site, slot.q.ID) {
			continue
		}
		if f.pause.blocked(string(engine), f.now()) {
			return stored, true
		}
		if i > 0 && f.gap > 0 {
			f.sleep(ctx, f.gap)
		}
		cctx, cancel := context.WithTimeout(ctx, answerCallLimit)
		ans, err := a.Ask(cctx, answers.Request{Question: slot.q.Text, Country: site.Country})
		cancel()
		run := sqlite.AnswerRun{SiteID: site.SiteID, QuestionID: slot.q.ID, Round: site.Round, Engine: string(engine), Model: f.model(a), Run: slot.run, AskedAt: f.now().Unix()}
		switch {
		case err == nil:
			f.pause.ok(string(engine))
			sc := answers.ScoreAnswer(ans, words, domain, rivals)
			run.OK, run.Model = true, ans.Model
			run.Text = ans.Text
			run.Citations, run.Sources = jsonList(ans.Citations), jsonList(ans.Sources)
			run.Named, run.Cited, run.Position = sc.Named, sc.Cited, sc.Position
			run.CitedPaths = jsonStrings(sc.CitedPaths)
			run.CostMicros = answers.Cost(engine, ans.Model, ans.Usage)
			for _, r := range sc.Rivals {
				run.Rivals = append(run.Rivals, sqlite.AnswerRival{Name: r.Name, Named: r.Named, Cited: r.Cited, Position: r.Position})
			}
		case errors.Is(err, answers.ErrLimited):
			d := f.pause.failed(string(engine), f.now())
			slog.Info("answers: an engine asked for a pause", "engine", engine, "for", d.String())
			return stored, true
		case errors.Is(err, answers.ErrKey), errors.Is(err, answers.ErrSetup):
			msg := answerKeyMsg
			if errors.Is(err, answers.ErrSetup) {
				msg = answerSetupMsg
			}
			f.mu.Lock()
			if f.broken == nil {
				f.broken = map[answers.Engine]bool{}
			}
			first := !f.broken[engine]
			f.broken[engine] = true
			f.mu.Unlock()
			if first {
				slog.Error("answers: an engine is switched off until restart", "engine", engine, "why", msg) // never the key or the provider's words
			}
			f.failRest(ctx, a, site, nil, msg)
			return stored, false
		case ctx.Err() != nil:
			return stored, false
		default:
			// A call that timed out or came back unreadable may still be billed.
			run.Error, run.CostMicros = answerFailMsg, answers.Typical(engine, f.model(a))
		}
		if err := f.st.SaveAnswerRun(ctx, run, month(f.now())); err != nil {
			slog.Warn("answers: a run was not kept", "err", err)
			f.lose(ctx, site, slot.q.ID, run.CostMicros)
			continue
		}
		stored++
		f.release(ctx, site.SiteID, answers.Typical(engine, f.model(a)))
	}
	return stored, false
}

func (f *answerAsker) release(ctx context.Context, site string, n int64) {
	_ = f.st.ReleaseAnswerReserve(ctx, site, n)
}

// failRest stores a failed run, with a fixed message, for every ask of the
// engine still missing in the round, so the round can end.
func (f *answerAsker) failRest(ctx context.Context, a answers.Asker, site sqlite.AnswerSite, active []sqlite.AnswerQuestion, msg string) {
	if active == nil {
		active, _ = f.roundQuestions(ctx, site)
	}
	done, err := f.st.AnswerDone(ctx, site.SiteID, site.Round)
	if err != nil {
		return
	}
	for _, q := range active {
		for r := 1; r <= f.runs; r++ {
			if done[sqlite.DoneKey(q.ID, string(a.Engine()), r)] || f.isBlocked(site, q.ID) {
				continue
			}
			_ = f.st.SaveAnswerRun(ctx, sqlite.AnswerRun{SiteID: site.SiteID, QuestionID: q.ID, Round: site.Round, Engine: string(a.Engine()),
				Model: f.model(a), Run: r, AskedAt: f.now().Unix(), Error: msg}, month(f.now()))
		}
	}
}

// finish ends the round when no ask is missing.
func (f *answerAsker) finish(ctx context.Context, site sqlite.AnswerSite, active []sqlite.AnswerQuestion) {
	done, err := f.st.AnswerDone(ctx, site.SiteID, site.Round)
	if err != nil {
		return
	}
	for _, a := range f.askers {
		if f.isBroken(a.Engine()) {
			f.failRest(ctx, a, site, active, answerKeyMsg)
			done, _ = f.st.AnswerDone(ctx, site.SiteID, site.Round)
		}
	}
	for _, q := range active {
		for _, a := range f.askers {
			for r := 1; r <= f.runs; r++ {
				if !done[sqlite.DoneKey(q.ID, string(a.Engine()), r)] && !f.isBlocked(site, q.ID) {
					return
				}
			}
		}
	}
	now := f.now()
	next := site.Round + int64(f.every/time.Second) + jitter(site.SiteID)
	changes, err := f.st.FinishAnswerRound(ctx, site.SiteID, site.Round, max(next, now.Unix()+3600), now.Unix())
	if err != nil {
		slog.Warn("answers: a round was not closed", "err", err)
		return
	}
	for _, c := range changes {
		if c.Kind != "dropped" || f.told == nil {
			continue
		}
		who := answers.Engine(c.Engine).Name()
		if f.told(ctx, site.SiteID, who+" stopped naming you", fmt.Sprintf("For the question %q, %s named or linked your site in the last two rounds and did not this time.", c.Question, who)) {
			_ = f.st.MarkAnswerAlerted(ctx, c)
		}
	}
}

// roundQuestions are the questions a running round asks: the ones it froze at
// its start that still exist.
func (f *answerAsker) roundQuestions(ctx context.Context, site sqlite.AnswerSite) ([]sqlite.AnswerQuestion, error) {
	qs, err := f.st.AnswerQuestionsOf(ctx, site.SiteID)
	if err != nil {
		return nil, err
	}
	var out []sqlite.AnswerQuestion
	for _, q := range qs {
		if slices.Contains(site.Frozen, q.ID) {
			out = append(out, q)
		}
	}
	return out, nil
}

func blockKey(site sqlite.AnswerSite, q int64) string {
	return site.SiteID + "/" + strconv.FormatInt(site.Round, 10) + "/" + strconv.FormatInt(q, 10)
}

func (f *answerAsker) isBlocked(site sqlite.AnswerSite, q int64) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.blocked[blockKey(site, q)]
}

// lose is an ask that was paid for and could not be kept: its cost still counts
// against the budget, and the question is not asked again in this round, so a
// failing store is not a paid loop.
func (f *answerAsker) lose(ctx context.Context, site sqlite.AnswerSite, q, cost int64) {
	f.mu.Lock()
	if f.blocked == nil {
		f.blocked = map[string]bool{}
	}
	f.blocked[blockKey(site, q)] = true
	f.mu.Unlock()
	m := month(f.now())
	if cost > 0 && f.st.AddAnswerSpend(ctx, m, cost) != nil {
		f.mu.Lock()
		if f.unsaved == nil {
			f.unsaved = map[string]int64{}
		}
		f.unsaved[m] += cost
		f.mu.Unlock()
	}
}

func (f *answerAsker) isBroken(e answers.Engine) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.broken[e]
}

// jitter is a stable offset of up to six hours either way, from the site's id,
// so a thousand sites do not all ask in the same minute.
func jitter(site string) int64 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(site))
	return int64(h.Sum32()%uint32(12*3600)) - 6*3600
}

// tellAnswer sends an "answer" alert to the people who asked to hear about this site's Answers.
func (s *Server) tellAnswer(ctx context.Context, site, title, msg string) bool {
	row, err := s.ctl.SiteInfo(ctx, site)
	if err != nil {
		return false
	}
	list, err := s.ctl.LiveAlerts(ctx)
	if err != nil {
		return false
	}
	told := false
	for _, a := range list {
		if a.SiteID != site || a.Kind != "answer" {
			continue
		}
		ev := answerEvent(row.Domain, title, msg, s.mentionLink(row.Domain))
		ev.Site = site
		ev.Unsubscribe = s.stopLink(a.ID)
		ev.Settings = s.settingsLink(site)
		if err := alerts.Send(ctx, a.Target, ev); err != nil {
			slog.Warn("alert not delivered", "kind", a.Kind, "err", err)
			continue
		}
		if err := s.ctl.MarkFired(ctx, a.ID, time.Now().Unix()); err != nil {
			slog.Warn("alert sent but not marked", "kind", a.Kind, "site", site, "err", err)
		}
		slog.Info("alert sent", "kind", a.Kind, "site", site)
		told = true
	}
	return told
}

// answerEvent words one Answers alert for a webhook or an email.
func answerEvent(domain, title, msg, link string) alerts.Event {
	ev := alerts.Event{Kind: "answer", Domain: domain, At: time.Now(), Title: title, Message: msg, Subject: title + ": " + domain}
	if link != "" {
		ev.Message += "\n\n" + link + "/answers"
	}
	e := &mailkit.Email{Preheader: mailkit.Cut(msg, 120), Foot: mailkit.Foot{Note: "You get this when an AI assistant stops naming your site, or Answers pauses."}}
	e.Blocks = []mailkit.Block{mailkit.Heading{Eyebrow: title, Title: domain}, mailkit.Paragraph{Text: msg}}
	if link != "" {
		e.Blocks = append(e.Blocks, mailkit.Button{Label: "See it on your dashboard", URL: link})
	}
	ev.Email = e
	return ev
}

// answersWeekLine is the weekly email's line, empty when no round ended in the week.
func (s *Server) answersWeekLine(ctx context.Context, site string, from, to time.Time) string {
	rounds, err := s.ctl.AnswerRounds(ctx, site)
	if err != nil || len(rounds) == 0 {
		return ""
	}
	last := rounds[len(rounds)-1]
	if last.Round < from.Unix() || last.Round >= to.Unix() || last.Total == 0 {
		return ""
	}
	line := fmt.Sprintf("AI assistants named you in %d of %d answers", last.Seen, last.Total)
	if len(rounds) > 1 {
		if d := last.Seen - rounds[len(rounds)-2].Seen; d != 0 {
			line += fmt.Sprintf(" (%+d)", d)
		}
	}
	return strings.TrimSpace(line) + "."
}

func jsonList(c []answers.Citation) string {
	if len(c) == 0 {
		return "[]"
	}
	b, _ := json.Marshal(c)
	return string(b)
}

func jsonStrings(s []string) string {
	if len(s) == 0 {
		return "[]"
	}
	b, _ := json.Marshal(s)
	return string(b)
}

// pruneAnswers removes the Answers runs older than each site's own "keep for
// N days" and blanks the text of every round but the last six.
func (s *Server) pruneAnswers(ctx context.Context) {
	if plan, err := s.ctl.RetentionPlan(ctx); err == nil {
		(&answerAsker{st: s.ctl}).prune(ctx, plan, time.Now())
	}
}

func (f *answerAsker) prune(ctx context.Context, plan map[string]int, now time.Time) {
	sites, err := f.st.AnswerSiteIDs(ctx)
	if err != nil {
		return
	}
	for _, site := range sites {
		var cutoff int64
		if days := plan[site]; days > 0 {
			cutoff = now.AddDate(0, 0, -days).Unix()
		}
		if _, err := f.st.PruneAnswers(ctx, site, cutoff, answerKeep); err != nil {
			slog.Warn("answers: retention failed", "site", site, "err", err)
		}
	}
}
