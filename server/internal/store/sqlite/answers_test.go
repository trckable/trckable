package sqlite

import (
	"context"
	"testing"
)

func answerRun(site string, q, round int64, engine string, run int, seen bool) AnswerRun {
	return AnswerRun{SiteID: site, QuestionID: q, Round: round, Engine: engine, Model: "m", Run: run, AskedAt: round + 1, OK: true,
		Named: seen, Position: map[bool]int{true: 1}[seen], CitedPaths: `["/compare"]`, Citations: `[{"url":"https://a.com/compare","title":"t"}]`,
		Text: "text", CostMicros: 1000, Rivals: []AnswerRival{{Name: "Plausible", Named: true, Position: 2}}}
}

func TestAnswerQuestionsKeepHistoryOnlyForSameText(t *testing.T) {
	ctx := context.Background()
	st, site := openIncidents(t)
	if err := st.SetAnswerQuestions(ctx, site, []AnswerQuestion{{Text: "best open analytics", Active: true}, {Text: "second question here", Active: true}}, 1); err != nil {
		t.Fatal(err)
	}
	qs, _ := st.AnswerQuestionsOf(ctx, site)
	if len(qs) != 2 {
		t.Fatal(qs)
	}
	keep, edit := qs[0], qs[1]
	if err := st.SetAnswerQuestions(ctx, site, []AnswerQuestion{{ID: keep.ID, Text: "BEST open analytics", Active: false}, {ID: edit.ID, Text: "a different text now", Active: true}}, 2); err != nil {
		t.Fatal(err)
	}
	got, _ := st.AnswerQuestionsOf(ctx, site)
	if len(got) != 2 || got[0].ID != keep.ID || got[0].Active || got[1].ID == edit.ID {
		t.Fatalf("%+v", got)
	}
}

func TestAnswerRoundChanges(t *testing.T) {
	ctx := context.Background()
	st, site := openIncidents(t)
	_ = st.SetAnswerQuestions(ctx, site, []AnswerQuestion{{Text: "best open analytics", Active: true}}, 1)
	qs, _ := st.AnswerQuestionsOf(ctx, site)
	q := qs[0].ID
	round := func(r int64, seen bool) []AnswerChange {
		t.Helper()
		if err := st.StartAnswerRound(ctx, site, r, []int64{q}, 0, r); err != nil {
			t.Fatal(err)
		}
		for run := 1; run <= 2; run++ {
			if err := st.SaveAnswerRun(ctx, answerRun(site, q, r, "openai", run, seen && run == 1), "2026-10"); err != nil {
				t.Fatal(err)
			}
		}
		ch, err := st.FinishAnswerRound(ctx, site, r, r+604800, r+10)
		if err != nil {
			t.Fatal(err)
		}
		return ch
	}
	if ch := round(1000, false); len(ch) != 0 {
		t.Fatalf("nothing seen yet: %v", ch)
	}
	ch := round(2000, true)
	if len(ch) != 1 || ch[0].Kind != "seen" || !ch[0].FirstEver {
		t.Fatalf("%v", ch)
	}
	if ch := round(3000, true); len(ch) != 0 {
		t.Fatalf("seen only once: %v", ch)
	}
	if ch := round(4000, false); len(ch) != 1 || ch[0].Kind != "dropped" {
		t.Fatalf("seen in the two rounds before, none now: %v", ch)
	}
	// The two before 5000 are 4000 (not seen) and 3000 (seen): not a drop.
	if ch := round(5000, false); len(ch) != 0 {
		t.Fatalf("%v", ch)
	}
	round(6000, true)
	round(7000, true)
	ch = round(8000, false)
	if len(ch) != 1 || ch[0].Kind != "dropped" {
		t.Fatalf("%v", ch)
	}
	drops, _ := st.AnswerDropsToTell(ctx, site)
	if len(drops) != 2 {
		t.Fatal(drops)
	}
	_ = st.MarkAnswerAlerted(ctx, drops[0])
	_ = st.MarkAnswerAlerted(ctx, drops[1])
	if drops, _ = st.AnswerDropsToTell(ctx, site); len(drops) != 0 {
		t.Fatal("told twice")
	}
	rounds, _ := st.AnswerRounds(ctx, site)
	if len(rounds) != 8 || rounds[1].Seen != 1 || rounds[1].Total != 2 {
		t.Fatalf("%v", rounds)
	}
	if spend, _ := st.AnswerSpend(ctx, "2026-10"); spend != 16000 {
		t.Fatalf("spend %d", spend)
	}
	runs, _ := st.AnswerRunsOf(ctx, site, 2000)
	if len(runs) != 2 || len(runs[0].Rivals) != 1 {
		t.Fatalf("%+v", runs)
	}
	paths, _ := st.AnswerCitedPaths(ctx, site, 0, 99999)
	if paths["/compare"] != 16 {
		t.Fatal(paths)
	}
	// The same slot twice stores once and costs once.
	_ = st.SaveAnswerRun(ctx, answerRun(site, q, 8000, "openai", 1, true), "2026-10")
	if spend, _ := st.AnswerSpend(ctx, "2026-10"); spend != 16000 {
		t.Fatalf("spend %d", spend)
	}
}

func TestAnswerDueAndPrune(t *testing.T) {
	ctx := context.Background()
	st, site := openIncidents(t)
	if due, _ := st.AnswerSitesDue(ctx, 100, 3); len(due) != 0 {
		t.Fatal("no question, nothing due")
	}
	_ = st.SetAnswerQuestions(ctx, site, []AnswerQuestion{{Text: "best open analytics", Active: true}}, 1)
	if due, _ := st.AnswerSitesDue(ctx, 100, 3); len(due) != 1 {
		t.Fatal("a site with a question and no schedule is due")
	}
	_ = st.StartAnswerRound(ctx, site, 100, []int64{1}, 500, 100)
	if due, _ := st.AnswerSitesDue(ctx, 200, 3); len(due) != 0 {
		t.Fatal("a running round is not due again")
	}
	if run, _ := st.AnswerSitesInProgress(ctx); len(run) != 1 {
		t.Fatal(run)
	}
	qs, _ := st.AnswerQuestionsOf(ctx, site)
	for i := int64(1); i <= 8; i++ {
		_ = st.SaveAnswerRun(ctx, answerRun(site, qs[0].ID, i*1000, "openai", 1, true), "2026-10")
	}
	if _, err := st.PruneAnswers(ctx, site, 2000, 6); err != nil {
		t.Fatal(err)
	}
	rounds, _ := st.AnswerRounds(ctx, site)
	if len(rounds) != 7 || rounds[0].Round != 2000 {
		t.Fatalf("%v", rounds)
	}
	runs, _ := st.AnswerQuestionRuns(ctx, site, qs[0].ID, 10)
	blank := 0
	for _, r := range runs {
		if r.Text == "" {
			blank++
		}
	}
	if len(runs) != 7 || blank != 1 {
		t.Fatalf("%d runs, %d blank", len(runs), blank)
	}
	_ = st.AskAnswersNow(ctx, site, 5)
	a, _ := st.AnswerSiteOf(ctx, site)
	if a.NextAt != 0 || a.AskedAt != 5 {
		t.Fatalf("%+v", a)
	}
}

func TestAnswerRoundKeepsItsQuestionsAndBudget(t *testing.T) {
	ctx := context.Background()
	st, site := openIncidents(t)
	_ = st.SetAnswerQuestions(ctx, site, []AnswerQuestion{{Text: "best open analytics", Active: true}}, 1)
	_ = st.StartAnswerRound(ctx, site, 100, []int64{7, 9}, 500, 100)
	as, _ := st.AnswerSiteOf(ctx, site)
	if len(as.Frozen) != 2 || as.Frozen[1] != 9 {
		t.Fatalf("%v", as.Frozen)
	}
	_ = st.ReleaseAnswerReserve(ctx, site, 200)
	if n, _ := st.AnswerReserved(ctx); n != 300 {
		t.Fatalf("held %d", n)
	}
	_ = st.ReleaseAnswerReserve(ctx, site, 900)
	if n, _ := st.AnswerReserved(ctx); n != 0 {
		t.Fatalf("held %d", n)
	}
	_ = st.DelayAnswers(ctx, site, 5000, 101)
	if due, _ := st.AnswerSitesDue(ctx, 200, 3); len(due) != 0 {
		t.Fatal("a delayed site is due")
	}
}
