package server

import (
	"strings"
	"testing"
)

// Every email trckable sends is in the samples, drawn by the code that sends
// it: each shows only the pictures it carries, has a plain-text twin with its
// footer, and every kind keeps its own look.
func TestEmailSamplesCoverEveryKind(t *testing.T) {
	pages := EmailSamples("https://stats.example.com/")
	want := map[string][]string{
		"milestone":     {"cid:cheer@alert", `class="lg"`, "&#9650;", "Next up: 25,000", "It took 47 days from the first visit"},
		"surge":         {"People online, the last 30 minutes", `class="hot"`, "2.7×", "From Facebook"},
		"site-down":     {`class="bd"`, "What we checked", "Failed checks in a row"},
		"site-up":       {`class="ok"`, "It was down for", "Answering again"},
		"site-stopped":  {`class="bd"`, "No visits for 6 hours", "was not found"},
		"mention":       {"#ff6600", "1,240", "On the front page", "&ldquo;"},
		"weekly":        {"Visitors per day", "&#9650; up 13%", "Top pages", "Stop receiving this report", "Busiest moment"},
		"report-client": {"Wochenbericht", "#336699", "Diesen Bericht abbestellen", "Besucher pro Tag"},
		"sign-in-code":  {"331983", "Pixel 8 (Android)", "Berlin, DE"},
		"plain-alert":   {"The disk is 91% full", "Settings → Data"},
	}
	if len(pages) != len(want) {
		t.Fatalf("%d samples, want %d", len(pages), len(want))
	}
	for _, p := range pages {
		for _, w := range want[p.Name] {
			if !strings.Contains(p.HTML, w) {
				t.Errorf("%s: html misses %q", p.Name, w)
			}
		}
		for _, img := range p.Images {
			if !strings.Contains(p.HTML, "cid:"+img.CID) {
				t.Errorf("%s: carries %s without showing it", p.Name, img.CID)
			}
		}
		if n := strings.Count(p.HTML, "cid:"); n != len(p.Images) {
			t.Errorf("%s: %d pictures shown, %d carried", p.Name, n, len(p.Images))
		}
		if !strings.Contains(p.Text, "\n-- \n") || strings.Contains(p.Text, "&#") || p.Subject == "" {
			t.Errorf("%s: text twin:\n%s", p.Name, p.Text)
		}
		if strings.Contains(p.HTML, "\u200b") || len(p.HTML) > 90<<10 {
			t.Errorf("%s: a bare zero-width space, or %d bytes (Gmail clips at 102 KB)", p.Name, len(p.HTML))
		}
	}
}
