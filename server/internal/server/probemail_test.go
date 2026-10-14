package server

import (
	"encoding/base64"
	"os"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/reports"
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
		if ev.Subject != want || ev.Card == nil || ev.Card.CTA != "Open site status" || ev.Card.Link != "https://stats.example.com/tash.albindudija.workers.dev" {
			t.Errorf("%s: %q %+v", kind, ev.Subject, ev.Card)
		}
		if dir := os.Getenv("PREVIEW_DIR"); dir != "" {
			h := ev.Card.HTML("https://stats.example.com/u/x", "https://stats.example.com/settings")
			h = strings.ReplaceAll(h, "cid:"+alerts.LogoCID, "data:image/png;base64,"+base64.StdEncoding.EncodeToString(reports.Logo))
			name := map[string]string{"down": "alert-down", "up": "alert-back"}[kind]
			os.WriteFile(dir+"/"+name+".html", []byte(h), 0o644)
		}
	}
}
