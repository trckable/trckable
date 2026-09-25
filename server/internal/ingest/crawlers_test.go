package ingest

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestClassifyCrawler(t *testing.T) {
	cases := []struct {
		ua       string
		name     string
		kind     string
		isawlher bool
	}{
		{"Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)", "OpenAI", "train", true},
		{"Mozilla/5.0 ChatGPT-User/1.0; +https://openai.com/bot", "OpenAI", "answer", true},
		{"Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "Anthropic", "train", true},
		{"Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)", "Anthropic", "answer", true},
		{"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Google", "index", true},
		{"Mozilla/5.0 (compatible; Google-Extended)", "Google", "train", true},
		{"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140 Safari/537.36", "", "", false},
		{"curl/8.4.0", "", "", false},
	}
	for _, c := range cases {
		got, ok := ClassifyCrawler(c.ua)
		if ok != c.isawlher {
			t.Fatalf("%q: recognised = %v, want %v", c.ua, ok, c.isawlher)
		}
		if ok && (got.Name != c.name || got.Kind != c.kind) {
			t.Fatalf("%q: got %s/%s, want %s/%s", c.ua, got.Name, got.Kind, c.name, c.kind)
		}
	}
}

// The specific token must win over the general one: GPTBot trains, while
// ChatGPT-User is a person waiting for an answer.
func TestCrawlerSpecificityWins(t *testing.T) {
	if c, _ := ClassifyCrawler("ChatGPT-User/1.0 (+https://openai.com/bot)"); c.Kind != "answer" {
		t.Fatalf("ChatGPT-User classified as %q", c.Kind)
	}
	if c, _ := ClassifyCrawler("Applebot-Extended/1.0"); c.Kind != "train" {
		t.Fatalf("Applebot-Extended classified as %q", c.Kind)
	}
}

// With the Crawlers module off a report is answered 202 and nothing is
// written; with it on, the hit is recorded.
func TestCrawlRespectsTheModule(t *testing.T) {
	for _, on := range []bool{false, true} {
		h, l := newHandler(t)
		h.Module = func(site, id string) bool { return on }
		before, _ := l.Committed()
		req := httptest.NewRequest(http.MethodPost, "/api/crawl", strings.NewReader(`{"s":"tkb_test","u":"https://site.com/pricing","ua":"GPTBot/1.2","st":200}`))
		req.Header.Set("X-Trckable-Proxy-Key", "tkb_px_secret")
		w := httptest.NewRecorder()
		h.Crawl(w, req)
		if w.Code != http.StatusAccepted {
			t.Fatalf("module on=%v: status %d %s", on, w.Code, w.Body)
		}
		after, _ := l.Committed()
		if wrote := after > before; wrote != on {
			t.Fatalf("module on=%v: wrote=%v", on, wrote)
		}
	}
}
