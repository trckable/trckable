package server

import (
	"context"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/answers"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// fakeAsker answers from a script; every dependency of the scheduler is a field.
type fakeAsker struct {
	engine answers.Engine
	mu     sync.Mutex
	calls  int
	fail   []error // errors for the next calls, in order; nil entries answer
	names  bool    // whether the answer names the site
	cites  string
	hook   func() // called at the start of every ask
}

func (f *fakeAsker) Engine() answers.Engine { return f.engine }
func (f *fakeAsker) Model() string          { return "m" }
func (f *fakeAsker) Ask(_ context.Context, r answers.Request) (answers.Answer, error) {
	if f.hook != nil {
		f.hook()
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if len(f.fail) > 0 {
		err := f.fail[0]
		f.fail = f.fail[1:]
		if err != nil {
			return answers.Answer{}, err
		}
	}
	a := answers.Answer{Engine: f.engine, Model: "m", Text: "Plausible is popular.", Usage: answers.Usage{InputTokens: 8000, OutputTokens: 700, Searches: 3}}
	if f.names {
		a.Text = "Try acme.example for shops. Plausible too."
	}
	if f.cites != "" {
		a.Citations = []answers.Citation{{URL: f.cites}}
	}
	return a, nil
}

type answerRig struct {
	st    *sqlite.Store
	site  string
	f     *answerAsker
	now   time.Time
	fakes map[answers.Engine]*fakeAsker
	told  []string
}

func newAnswerRig(t *testing.T, budgetUSD int) *answerRig {
	t.Helper()
	ctx := context.Background()
	st, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	r := &answerRig{st: st, now: time.Date(2026, 10, 5, 9, 0, 0, 0, time.UTC), fakes: map[answers.Engine]*fakeAsker{}}
	r.site = r.addSite(t, "acme.example", 2)
	var askers []answers.Asker
	for _, e := range []answers.Engine{answers.OpenAI, answers.Perplexity, answers.Anthropic} {
		fk := &fakeAsker{engine: e, cites: "https://www.acme.example/compare/"}
		r.fakes[e] = fk
		askers = append(askers, fk)
	}
	r.f = &answerAsker{st: st, askers: askers, every: 7 * 24 * time.Hour, runs: 2, budget: int64(budgetUSD) * 1_000_000,
		now: func() time.Time { return r.now }, sleep: func(context.Context, time.Duration) {}, wake: make(chan string, 16),
		told: func(_ context.Context, site, title, _ string) bool {
			r.told = append(r.told, site+": "+title)
			return true
		}}
	return r
}

func (r *answerRig) addSite(t *testing.T, domain string, questions int) string {
	t.Helper()
	ctx := context.Background()
	site, err := r.st.CreateSite(ctx, sqlite.DefaultAccount, domain, "Acme")
	if err != nil {
		t.Fatal(err)
	}
	var qs []sqlite.AnswerQuestion
	for _, text := range []string{"best open analytics for shops", "which tool shows sales by source", "analytics that respects privacy"}[:questions] {
		qs = append(qs, sqlite.AnswerQuestion{Text: text, Active: true})
	}
	if err := r.st.SetAnswerQuestions(ctx, site, qs, r.now.Unix()); err != nil {
		t.Fatal(err)
	}
	return site
}

func (r *answerRig) runs(t *testing.T, site string) int {
	t.Helper()
	var n int
	if err := r.st.DB.QueryRow(`SELECT count(*) FROM answer_runs WHERE site_id = ?`, site).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func (r *answerRig) calls() int {
	n := 0
	for _, f := range r.fakes {
		n += f.calls
	}
	return n
}

func TestAnswersRoundAsksEverythingOnce(t *testing.T) {
	r := newAnswerRig(t, 0)
	ctx := context.Background()
	r.f.tick(ctx)
	if r.calls() != 12 || r.runs(t, r.site) != 12 {
		t.Fatalf("calls %d runs %d, want 12 and 12", r.calls(), r.runs(t, r.site))
	}
	as, _ := r.st.AnswerSiteOf(ctx, r.site)
	week := r.now.Add(7 * 24 * time.Hour).Unix()
	if as.Round != 0 || as.NextAt < week-6*3600-1 || as.NextAt > week+6*3600+1 {
		t.Fatalf("next round %d, want about %d (round %d)", as.NextAt, week, as.Round)
	}
	r.f.tick(ctx)
	if r.calls() != 12 {
		t.Fatalf("asked again before it was due: %d", r.calls())
	}
	r.now = time.Unix(as.NextAt+1, 0).UTC()
	r.f.tick(ctx)
	if r.calls() != 24 {
		t.Fatalf("the next week: %d", r.calls())
	}
	if rounds, _ := r.st.AnswerRounds(ctx, r.site); len(rounds) != 2 || rounds[0].Total != 12 || rounds[0].Seen != 12 {
		t.Fatalf("%v", rounds) // every answer links the site, so every one is seen
	}
}

func TestAnswersAnEngineRestsAndTheRoundResumes(t *testing.T) {
	r := newAnswerRig(t, 0)
	ctx := context.Background()
	r.fakes[answers.OpenAI].fail = []error{nil, answers.ErrLimited}
	r.f.tick(ctx)
	as, _ := r.st.AnswerSiteOf(ctx, r.site)
	if as.Round == 0 || r.runs(t, r.site) != 9 { // openai stored one of four, the others all
		t.Fatalf("round %d runs %d", as.Round, r.runs(t, r.site))
	}
	r.f.tick(ctx) // still resting: nothing new
	if r.runs(t, r.site) != 9 {
		t.Fatalf("asked a resting engine: %d", r.runs(t, r.site))
	}
	r.now = r.now.Add(2 * time.Minute)
	r.f.tick(ctx)
	after, _ := r.st.AnswerSiteOf(ctx, r.site)
	if r.runs(t, r.site) != 12 || after.Round != 0 {
		t.Fatalf("runs %d round %d", r.runs(t, r.site), after.Round)
	}
	var rounds int
	_ = r.st.DB.QueryRow(`SELECT count(DISTINCT round) FROM answer_runs`).Scan(&rounds)
	if rounds != 1 || r.fakes[answers.Perplexity].calls != 4 {
		t.Fatalf("one round, resumed (%d), perplexity asked %d times", rounds, r.fakes[answers.Perplexity].calls)
	}
}

func TestAnswersARefusedKeyIsKeptAsAFailedRun(t *testing.T) {
	r := newAnswerRig(t, 0)
	ctx := context.Background()
	r.fakes[answers.Anthropic].fail = []error{answers.ErrKey}
	r.f.tick(ctx)
	if r.runs(t, r.site) != 12 {
		t.Fatalf("a round with a refused engine still ends: %d", r.runs(t, r.site))
	}
	var bad int
	var msg string
	_ = r.st.DB.QueryRow(`SELECT count(*), min(error) FROM answer_runs WHERE ok = 0`).Scan(&bad, &msg)
	if bad != 4 || msg != answerKeyMsg {
		t.Fatalf("%d failed runs, message %q", bad, msg)
	}
	r.now = r.now.Add(8 * 24 * time.Hour)
	r.f.tick(ctx)
	if r.fakes[answers.Anthropic].calls != 1 {
		t.Fatalf("a refused engine was asked again: %d", r.fakes[answers.Anthropic].calls)
	}
}

func TestAnswersBudgetRefusesAWholeRound(t *testing.T) {
	r := newAnswerRig(t, 0)
	r.f.budget = 100_000 // a tenth of a dollar: a round costs about three times that
	ctx := context.Background()
	r.f.tick(ctx)
	r.f.tick(ctx)
	if r.calls() != 0 {
		t.Fatalf("asked with no budget: %d", r.calls())
	}
	v, ok, _ := r.st.Meta(ctx, sqlite.AnswerPausedKey)
	if !ok || v != "1793491200" { // 1 Nov 2026 00:00 UTC
		t.Fatalf("paused until %q", v)
	}
	if len(r.told) != 1 {
		t.Fatalf("told %v: once, not every tick", r.told)
	}
}

func TestAnswersSitesShareTheCap(t *testing.T) {
	ctx := context.Background()
	r := newAnswerRig(t, 0)
	est := int64(0)
	for _, a := range r.f.askers {
		est += answers.Typical(a.Engine(), "m")
	}
	est *= 2 * 2 // two questions, two runs
	r.f.budget = 4 * est
	other := r.addSite(t, "other.example", 2)
	r.f.tick(ctx) // both start
	if r.runs(t, r.site) != 12 || r.runs(t, other) != 12 {
		t.Fatalf("first rounds: %d %d", r.runs(t, r.site), r.runs(t, other))
	}
	for i, want := range []int{24, 24} { // the second round fits a fair share; a third does not
		r.now = r.now.Add(time.Hour)
		_ = r.st.AskAnswersNow(ctx, r.site, r.now.Unix())
		r.f.tick(ctx)
		if got := r.runs(t, r.site); got != want {
			t.Fatalf("round %d of the first site: %d runs, want %d", i+2, got, want)
		}
	}
	r.now = r.now.Add(time.Hour)
	_ = r.st.AskAnswersNow(ctx, other, r.now.Unix())
	r.f.tick(ctx)
	if r.runs(t, other) != 24 {
		t.Fatalf("the other site was starved: %d", r.runs(t, other))
	}
}

func TestAnswersWakeStartsWithoutWaiting(t *testing.T) {
	r := newAnswerRig(t, 0)
	r.f.Wake(r.site)
	done := make(chan struct{})
	go func() { r.f.waitTick(context.Background()); close(done) }()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("a wake did not end the wait")
	}
}

func TestAnswersDropIsToldOnce(t *testing.T) {
	r := newAnswerRig(t, 0)
	ctx := context.Background()
	for _, f := range r.fakes {
		f.names, f.cites = true, ""
	}
	for i := 0; i < 2; i++ {
		r.f.tick(ctx)
		r.now = r.now.Add(8 * 24 * time.Hour)
	}
	if len(r.told) != 0 {
		t.Fatalf("told while still seen: %v", r.told)
	}
	for _, f := range r.fakes {
		f.names = false
	}
	r.f.tick(ctx)
	if len(r.told) != 6 { // two questions on three engines
		t.Fatalf("told %d: %v", len(r.told), r.told)
	}
	if !strings.Contains(r.told[0], r.site) {
		t.Fatal(r.told[0])
	}
	r.now = r.now.Add(8 * 24 * time.Hour)
	r.f.tick(ctx)
	if len(r.told) != 6 {
		t.Fatalf("told again: %d", len(r.told))
	}
}

func TestAnswersNothingToDoWithoutAnEngine(t *testing.T) {
	r := newAnswerRig(t, 0)
	r.f.askers = nil
	r.f.tick(context.Background())
	if r.calls() != 0 || r.runs(t, r.site) != 0 {
		t.Fatal("asked with no engine")
	}
}

func TestAnswersRetentionBlanksOldText(t *testing.T) {
	ctx := context.Background()
	r := newAnswerRig(t, 0)
	for i := 0; i < 8; i++ {
		r.f.tick(ctx)
		r.now = r.now.Add(8 * 24 * time.Hour)
	}
	var all, blank, kept int
	count := func() {
		_ = r.st.DB.QueryRow(`SELECT count(*) FROM answer_runs`).Scan(&all)
		_ = r.st.DB.QueryRow(`SELECT count(DISTINCT round) FROM answer_runs WHERE text = ''`).Scan(&blank)
		_ = r.st.DB.QueryRow(`SELECT count(DISTINCT round) FROM answer_runs`).Scan(&kept)
	}
	r.f.prune(ctx, nil, r.now) // no plan: nothing is deleted, the text beyond six rounds is blanked
	if count(); all != 96 || blank != 2 {
		t.Fatalf("%d runs, %d blank rounds", all, blank)
	}
	r.f.prune(ctx, map[string]int{r.site: 30}, r.now) // 30 days keep the last three weekly rounds
	if count(); kept != 3 || blank != 0 {
		t.Fatalf("kept %d rounds, %d blank", kept, blank)
	}
}

func TestAnswersWeeklyLine(t *testing.T) {
	ctx := context.Background()
	r := newAnswerRig(t, 0)
	s := &Server{ctl: r.st}
	from := r.now.Add(-time.Hour)
	if got := s.answersWeekLine(ctx, r.site, from, from.AddDate(0, 0, 7)); got != "" {
		t.Fatalf("a line before any round: %q", got)
	}
	r.f.tick(ctx)
	if got := s.answersWeekLine(ctx, r.site, from, from.AddDate(0, 0, 7)); got != "AI assistants named you in 12 of 12 answers." {
		t.Fatalf("%q", got)
	}
	if got := s.answersWeekLine(ctx, r.site, from.AddDate(0, 0, 7), from.AddDate(0, 0, 14)); got != "" {
		t.Fatalf("a line for a week with no round: %q", got)
	}
}

// (2) A save made while a round runs applies from the next round.
func TestAnswersARoundKeepsItsQuestionsFrozen(t *testing.T) {
	r := newAnswerRig(t, 0)
	ctx := context.Background()
	added := false
	r.fakes[answers.OpenAI].hook = func() {
		if added {
			return
		}
		added = true
		qs, _ := r.st.AnswerQuestionsOf(ctx, r.site)
		qs = append(qs, sqlite.AnswerQuestion{Text: "a question added mid round", Active: true})
		if err := r.st.SetAnswerQuestions(ctx, r.site, qs, r.now.Unix()); err != nil {
			t.Error(err)
		}
	}
	r.f.tick(ctx)
	if r.calls() != 12 || r.runs(t, r.site) != 12 {
		t.Fatalf("the new question joined the round: %d calls, %d runs", r.calls(), r.runs(t, r.site))
	}
	r.now = r.now.Add(8 * 24 * time.Hour)
	r.f.tick(ctx)
	if r.calls() != 12+18 {
		t.Fatalf("the next round asks all three: %d calls", r.calls())
	}
}

// (3) The month's pause is told once, however many sites the budget refuses.
func TestAnswersThePauseIsToldOncePerMonth(t *testing.T) {
	r := newAnswerRig(t, 0)
	ctx := context.Background()
	est := int64(0)
	for _, a := range r.f.askers {
		est += answers.Typical(a.Engine(), "m")
	}
	small := r.addSite(t, "small.example", 1)
	r.f.budget = est * 8
	// Other spend of the month leaves 3 est: the two-question site needs 4 est
	// and is refused; the one-question site needs 2, fits its share, and runs.
	if _, err := r.st.DB.Exec(`INSERT INTO answer_spend (month, cost_micros) VALUES ('2026-10', ?)`, est*5); err != nil {
		t.Fatal(err)
	}
	r.f.tick(ctx)
	if r.runs(t, small) != 6 || r.runs(t, r.site) != 0 {
		t.Fatalf("small %d, big %d", r.runs(t, small), r.runs(t, r.site))
	}
	if len(r.told) == 0 {
		t.Fatal("nobody was told")
	}
	n := len(r.told)
	third := r.addSite(t, "third.example", 2) // refused too
	r.now = r.now.Add(time.Hour)
	r.f.tick(ctx)
	if r.runs(t, third) != 0 || len(r.told) != n {
		t.Fatalf("told again: %d then %d", n, len(r.told))
	}
}

// (4) A site the budget refuses waits for next month and frees its place.
func TestAnswersARefusedSiteDoesNotBlockTheOthers(t *testing.T) {
	r := newAnswerRig(t, 0)
	ctx := context.Background()
	r.f.budget = 100_000
	r.f.tick(ctx)
	as, _ := r.st.AnswerSiteOf(ctx, r.site)
	if as.NextAt != time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC).Unix() {
		t.Fatalf("next round %d", as.NextAt)
	}
	if due, _ := r.st.AnswerSitesDue(ctx, r.now.Unix(), 3); len(due) != 0 {
		t.Fatalf("the refused site still takes a place: %v", due)
	}
	r.now = time.Date(2026, 11, 1, 0, 1, 0, 0, time.UTC)
	r.f.budget = 0
	r.f.tick(ctx)
	if r.runs(t, r.site) != 12 {
		t.Fatalf("not asked when the month began: %d", r.runs(t, r.site))
	}
}

// (5) What a running round holds survives a restart.
func TestAnswersAReservationSurvivesARestart(t *testing.T) {
	r := newAnswerRig(t, 0)
	ctx := context.Background()
	est := int64(0)
	for _, a := range r.f.askers {
		est += answers.Typical(a.Engine(), "m")
	}
	est *= 4
	other := r.addSite(t, "other.example", 2)
	r.f.budget = est * 2 // each site's share holds a round; the month holds one more only if nothing is reserved
	if _, err := r.st.DB.Exec(`INSERT INTO answer_spend (month, cost_micros) VALUES ('2026-10', ?)`, est/2); err != nil {
		t.Fatal(err)
	}
	as, _ := r.st.AnswerSiteOf(ctx, r.site)
	if _, ok := r.f.start(ctx, as); !ok { // started, then the process "dies" before asking anything
		t.Fatal("first round refused")
	}
	again := &answerAsker{st: r.st, askers: r.f.askers, every: r.f.every, runs: r.f.runs, budget: r.f.budget, now: r.f.now, sleep: r.f.sleep}
	oas, _ := r.st.AnswerSiteOf(ctx, other)
	if _, ok := again.start(ctx, oas); ok {
		t.Fatal("a restarted server forgot what the running round holds")
	}
}

// (6) Dated model names have a price, and a timed-out call is not free.
func TestAnswersAFailedCallStillCosts(t *testing.T) {
	r := newAnswerRig(t, 0)
	ctx := context.Background()
	r.fakes[answers.OpenAI].fail = []error{context.DeadlineExceeded}
	r.f.tick(ctx)
	var cost int64
	var msg string
	_ = r.st.DB.QueryRow(`SELECT cost_micros, error FROM answer_runs WHERE ok = 0`).Scan(&cost, &msg)
	if cost != answers.Typical(answers.OpenAI, "m") || msg != answerFailMsg {
		t.Fatalf("cost %d message %q", cost, msg)
	}
	if spend, _ := r.st.AnswerSpend(ctx, "2026-10"); spend < cost {
		t.Fatalf("spend %d", spend)
	}
}

// (7) A run that cannot be kept still counts, and is not asked again.
func TestAnswersAnUnsavableRunIsNotAPaidLoop(t *testing.T) {
	r := newAnswerRig(t, 0)
	ctx := context.Background()
	if err := r.st.SetAnswerCompetitors(ctx, r.site, []sqlite.AnswerCompetitor{{Name: "Plausible"}}, 1); err != nil {
		t.Fatal(err)
	}
	if _, err := r.st.DB.Exec(`DROP TABLE answer_rivals`); err != nil { // every save now fails
		t.Fatal(err)
	}
	r.f.tick(ctx)
	first := r.calls()
	if first == 0 || first > 3*2 {
		t.Fatalf("one ask per question and engine may be lost, not more: %d calls", first)
	}
	spend, _ := r.st.AnswerSpend(ctx, "2026-10")
	if spend == 0 {
		t.Fatal("paid asks that could not be kept are not counted")
	}
	r.f.tick(ctx)
	r.f.tick(ctx)
	if r.calls() != first {
		t.Fatalf("asked again: %d then %d", first, r.calls())
	}
}

// roundCost is what one round of the rig's site is reserved at: two questions,
// two runs, three engines.
func roundCost(r *answerRig) int64 {
	est := int64(0)
	for _, a := range r.f.askers {
		est += answers.Typical(a.Engine(), "m")
	}
	return est * 2 * 2
}

// Editing a question deletes its runs; the site's spend, and so its fair
// share, stays.
func TestAnswersEditingAQuestionDoesNotResetTheShare(t *testing.T) {
	ctx := context.Background()
	r := newAnswerRig(t, 0)
	est := roundCost(r)
	r.f.budget = 4 * est
	other := r.addSite(t, "other.example", 2)
	r.f.tick(ctx)
	for range 2 { // the second round still fits a share of 2*est
		r.now = r.now.Add(time.Hour)
		_ = r.st.AskAnswersNow(ctx, r.site, r.now.Unix())
		r.f.tick(ctx)
	}
	if r.runs(t, r.site) != 24 || r.runs(t, other) != 12 {
		t.Fatalf("runs %d and %d", r.runs(t, r.site), r.runs(t, other))
	}
	edited := []sqlite.AnswerQuestion{{Text: "something else to ask", Active: true}, {Text: "yet another question", Active: true}}
	if err := r.st.SetAnswerQuestions(ctx, r.site, edited, r.now.Unix()); err != nil {
		t.Fatal(err)
	}
	if r.runs(t, r.site) != 0 {
		t.Fatal("the runs should be gone with their questions")
	}
	r.now = r.now.Add(time.Hour)
	_ = r.st.AskAnswersNow(ctx, r.site, r.now.Unix())
	before := r.calls()
	r.f.tick(ctx)
	if r.calls() != before || r.runs(t, r.site) != 0 {
		t.Fatalf("a site that used its share asked again after editing its questions: %d calls", r.calls()-before)
	}
}

// The first round is held to the share too.
func TestAnswersAFirstRoundBiggerThanTheShareWaits(t *testing.T) {
	ctx := context.Background()
	r := newAnswerRig(t, 0)
	r.f.budget = roundCost(r) // the whole budget fits one round, half of it is each site's share
	r.addSite(t, "other.example", 2)
	r.f.tick(ctx)
	if r.calls() != 0 {
		t.Fatalf("asked %d times past a fair share", r.calls())
	}
}

// A site whose account the gate refuses starts nothing, and does not take the
// place of one that may.
func TestAnswersASuspendedAccountDoesNotRun(t *testing.T) {
	ctx := context.Background()
	r := newAnswerRig(t, 0)
	gone, err := r.st.CreateAccount(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var stopped []string
	for _, d := range []string{"a.example", "b.example", "c.example", "d.example"} {
		site, err := r.st.CreateSite(ctx, gone, d, d)
		if err != nil {
			t.Fatal(err)
		}
		stopped = append(stopped, site)
		if err := r.st.SetAnswerQuestions(ctx, site, []sqlite.AnswerQuestion{{Text: "best open analytics for shops", Active: true}}, 1); err != nil {
			t.Fatal(err)
		}
	}
	r.f.allowed = func(_ context.Context, account string) bool { return account != gone }
	r.f.tick(ctx)
	if r.runs(t, r.site) != 12 {
		t.Fatalf("the allowed site asked %d times, want 12", r.runs(t, r.site))
	}
	for _, s := range stopped {
		if r.runs(t, s) != 0 {
			t.Fatalf("a suspended account's site asked: %s", s)
		}
	}
	// A round already running stops too, and goes on when the gate opens.
	if err := r.st.StartAnswerRound(ctx, stopped[0], r.now.Unix(), nil, 0, r.now.Unix()); err != nil {
		t.Fatal(err)
	}
	r.f.tick(ctx)
	if r.runs(t, stopped[0]) != 0 {
		t.Fatal("a running round of a suspended account went on")
	}
	r.f.allowed = nil
	r.f.tick(ctx)
	if r.runs(t, stopped[1]) == 0 {
		t.Fatal("nothing ran once the gate allowed it")
	}
}

// A round stops at the call that takes the month past its budget.
func TestAnswersARoundStopsWhenTheBudgetIsPassed(t *testing.T) {
	ctx := context.Background()
	r := newAnswerRig(t, 0)
	est := roundCost(r)
	r.f.budget = est
	for _, fk := range r.fakes {
		var once sync.Once
		fk.hook = func() { // another site's spend lands while this round runs
			once.Do(func() { _ = r.st.AddAnswerSpend(ctx, r.site, "2026-10", est) })
		}
	}
	r.f.tick(ctx)
	if r.calls() == 0 || r.calls() > 3 {
		t.Fatalf("%d calls, want at most one per engine", r.calls())
	}
	as, _ := r.st.AnswerSiteOf(ctx, r.site)
	if as.Round != 0 {
		t.Fatal("the round should have ended")
	}
	var skipped int
	_ = r.st.DB.QueryRow(`SELECT count(*) FROM answer_runs WHERE error = ?`, answerCapMsg).Scan(&skipped)
	if skipped != 12-r.calls() || r.runs(t, r.site) != 12 {
		t.Fatalf("%d asks marked as skipped after %d calls, runs %d", skipped, r.calls(), r.runs(t, r.site))
	}
}
