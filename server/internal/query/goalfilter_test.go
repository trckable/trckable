package query

import (
	"fmt"
	"testing"
	"time"
)

func TestGoalFilterMatchesNormalisedName(t *testing.T) {
	g := group{dim: "goal", values: []string{"Sign up", "signup.done"}}
	_, args, err := g.goalWhere(Params{}, time.Time{}, time.Time{})
	if err != nil {
		t.Fatal(err)
	}
	got := fmt.Sprint(args[len(args)-2:])
	if want := "[sign-up signup-done]"; got != want {
		t.Fatalf("args = %s, want %s", got, want)
	}
}
