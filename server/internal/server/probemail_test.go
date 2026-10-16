package server

import (
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func TestProbeWordsPlainAndPreview(t *testing.T) {
	s := &Server{}
	s.cfg.BaseURL = "https://stats.example.com"
	site := sqlite.SiteRow{ID: "s", Domain: "tash.albindudija.workers.dev", Timezone: "Europe/Berlin"}
	down := sqlite.SiteProbe{At: 1792000000, Error: "No answer within 10 seconds", Failures: 3, DownSince: 1791998600}
	before := down
	up := sqlite.SiteProbe{At: 1791998600 + 23*60}
	for kind, want := range map[string]string{"down": "tash.albindudija.workers.dev isn't answering", "up": "tash.albindudija.workers.dev is back up after 23 minutes"} {
		ev := alerts.Event{Kind: kind}
		after := down
		if kind == "up" {
			after = up
		}
		s.probeWords(&ev, site, before, after)
		if ev.Subject != want || ev.Email == nil {
			t.Fatalf("%s: %q %+v", kind, ev.Subject, ev.Email)
		}
		r := alerts.Compose(ev)
		wants := map[string][]string{
			"down": {"Not answering", `class="bd"`, "What we checked", "3 checks in a row got no answer", "Failed checks in a row", "No answer within 10 seconds"},
			"up":   {"Back up", `class="ok"`, "Answering again", "23 minutes", "Down since"},
		}[kind]
		for _, w := range append(wants, "Open site status →", `href="https://stats.example.com/tash.albindudija.workers.dev"`) {
			if !strings.Contains(r.HTML, w) {
				t.Errorf("%s: html misses %q", kind, w)
			}
		}
		if !strings.Contains(r.Text, "Open site status: https://stats.example.com/tash.albindudija.workers.dev") {
			t.Errorf("%s: text:\n%s", kind, r.Text)
		}
	}
}
