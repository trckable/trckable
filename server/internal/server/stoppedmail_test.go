package server

import (
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func TestStoppedWordsReadTheChecks(t *testing.T) {
	now := time.Date(2026, 10, 14, 4, 20, 0, 0, time.UTC)
	last := now.Add(-6*time.Hour - 5*time.Minute - 46*time.Second).Unix()
	s := &Server{}
	s.cfg.BaseURL = "https://stats.example.com/"
	cases := []struct {
		name string
		c    sqlite.SiteCheck
		want string
	}{
		{"answers, script there", sqlite.SiteCheck{At: last + 60, Found: "site"}, "tracking script is still on it"},
		{"answers, script gone", sqlite.SiteCheck{At: last + 60, Found: "none"}, "was not found"},
		{"down", sqlite.SiteCheck{At: last + 60, Error: "timeout"}, "probably down"},
		{"never looked", sqlite.SiteCheck{}, "No check has looked"},
	}
	for _, c := range cases {
		var ev alerts.Event
		s.stoppedWords(&ev, sqlite.SiteInfo{Domain: "tash.example.dev", Timezone: "UTC"}, last, c.c, now)
		if ev.Subject != "tash.example.dev: no visits for 6 hours" {
			t.Errorf("%s: subject %q", c.name, ev.Subject)
		}
		if !strings.Contains(ev.Message, c.want) || strings.Contains(ev.Message, "5m46s") {
			t.Errorf("%s: message %q", c.name, ev.Message)
		}
		if ev.Email == nil {
			t.Fatalf("%s: no email", c.name)
		}
		r := alerts.Compose(ev)
		for _, want := range []string{"No visits for 6 hours", `class="bd"`, "What we checked", c.want, `href="https://stats.example.com/tash.example.dev"`, "Open site status →"} {
			if !strings.Contains(r.HTML, want) {
				t.Errorf("%s: html misses %q", c.name, want)
			}
		}
		if !strings.Contains(r.Text, "What we checked\n") || !strings.Contains(r.Text, c.want) {
			t.Errorf("%s: text:\n%s", c.name, r.Text)
		}
	}
}

func TestAgoIsInWords(t *testing.T) {
	for d, want := range map[time.Duration]string{
		20 * time.Second: "1 minute", 35 * time.Minute: "35 minutes", 6*time.Hour + 5*time.Minute: "6 hours",
		time.Hour: "1 hour", 72 * time.Hour: "3 days",
	} {
		if got := alerts.Ago(d); got != want {
			t.Errorf("Ago(%v) = %q, want %q", d, got, want)
		}
	}
}
