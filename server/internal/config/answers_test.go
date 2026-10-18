package config

import (
	"testing"
	"time"
)

func TestAnswersConfig(t *testing.T) {
	t.Setenv("TRCKABLE_ANSWERS_BUDGET", "0")
	t.Setenv("TRCKABLE_ANSWERS_RUNS", "9")
	t.Setenv("TRCKABLE_ANSWERS_QUESTIONS", "500")
	t.Setenv("TRCKABLE_ANSWERS_EVERY", "2h")
	c := Load()
	if c.AnswersBudget != 0 || c.AnswersRuns != 3 || c.AnswersQuestions != 100 || c.AnswersEvery != 24*time.Hour {
		t.Errorf("%+v", c)
	}
	t.Setenv("TRCKABLE_ANSWERS_BUDGET", "")
	t.Setenv("TRCKABLE_ANSWERS_RUNS", "")
	t.Setenv("TRCKABLE_ANSWERS_QUESTIONS", "")
	t.Setenv("TRCKABLE_ANSWERS_EVERY", "0")
	c = Load()
	if c.AnswersBudget != 20 || c.AnswersRuns != 2 || c.AnswersQuestions != 10 || c.AnswersEvery != 0 {
		t.Errorf("%+v", c)
	}
	t.Setenv("TRCKABLE_ANSWERS_EVERY", "")
	if Load().AnswersEvery != 7*24*time.Hour {
		t.Error("default is a week")
	}
}
