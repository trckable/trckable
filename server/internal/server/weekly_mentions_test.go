package server

import (
	"context"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/config"
)

func TestWeeklyHasNoMentionsWhileTheyAreOff(t *testing.T) {
	s := &Server{cfg: config.Config{}} // no store: off must answer before it is asked
	x := s.weekMentions(context.Background(), "site", "acme.example", time.Now().Add(-7*24*time.Hour), time.Now())
	if len(x.Mentions) != 0 || x.MentionsMore != 0 || x.MentionsLink != "" {
		t.Fatalf("%+v", x)
	}
}
