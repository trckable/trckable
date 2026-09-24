package ingest

import "testing"

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
