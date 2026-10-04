package ingest

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The setups the docs and the dashboard's "Connect crawler data" sheet give
// (a Cloudflare Worker, Vercel middleware, nginx's mirror, the nginx and Caddy
// log forwarder) each post the same four fields to /api/crawl. These are the
// bodies they send, one by one: each must be recorded as the robot it names, on
// the page it names, and nothing else.
func TestCrawlPayloadsOfTheSetups(t *testing.T) {
	cases := []struct {
		name  string
		body  string
		crawl string // name/kind, or "" when nothing is recorded
		path  string
		err   bool // the hit is flagged as an error page
	}{
		{
			name:  "cloudflare worker: the bot's own user agent, the request URL with its query, the origin's status",
			body:  `{"s":"tkb_test","u":"https://site.com/pricing?utm_source=x","ua":"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)","st":200}`,
			crawl: "OpenAI/train", path: "/pricing",
		},
		{
			name:  "cloudflare worker: a robot that finds a missing page",
			body:  `{"s":"tkb_test","u":"https://site.com/gone","ua":"Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)","st":404}`,
			crawl: "Anthropic/train", path: "/gone", err: true,
		},
		{
			name:  "vercel middleware: no status, it runs before the answer",
			body:  `{"s":"tkb_test","u":"https://site.com/blog/post-1","ua":"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot"}`,
			crawl: "OpenAI/answer", path: "/blog/post-1",
		},
		{
			name:  "nginx mirror: the user agent is the matched token alone",
			body:  `{"s":"tkb_test","u":"https://site.com/docs?page=2","ua":"PerplexityBot"}`,
			crawl: "Perplexity/answer", path: "/docs",
		},
		{
			name:  "nginx mirror: the token as the map hands it over, in whatever case the bot wrote it",
			body:  `{"s":"tkb_test","u":"https://site.com/","ua":"Claude-SearchBot"}`,
			crawl: "Anthropic/answer", path: "/",
		},
		{
			name:  "log forwarder (nginx, Caddy): status is a number from the log line",
			body:  `{"s":"tkb_test","u":"https://site.com/old-page","ua":"Mozilla/5.0 (compatible; Google-Extended)","st":410}`,
			crawl: "Google/train", path: "/old-page", err: true,
		},
		{
			name:  "log forwarder: a redirect is not an error",
			body:  `{"s":"tkb_test","u":"https://site.com/a","ua":"Bytespider","st":301}`,
			crawl: "ByteDance/train", path: "/a",
		},
		{
			name:  "a person's browser that slipped past a forwarder is dropped, not counted",
			body:  `{"s":"tkb_test","u":"https://site.com/","ua":"` + chromeUA + `","st":200}`,
			crawl: "",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h, l := newHandler(t)
			h.Module = func(string, string) bool { return true }
			before, _ := l.Committed()
			w := crawlPost(h, c.body, "tkb_px_secret")
			if w.Code != http.StatusAccepted {
				t.Fatalf("status %d: %s", w.Code, w.Body)
			}
			after, _ := l.Committed()
			if c.crawl == "" {
				if after != before {
					t.Fatal("recorded something for a visitor")
				}
				return
			}
			if after != before+1 {
				t.Fatalf("recorded %d events, want 1", after-before)
			}
			e, raw := lastEvent(t, l)
			if got := e.Browser + "/" + e.OS; got != c.crawl || e.Path != c.path || (e.Goal == "error") != c.err {
				t.Fatalf("recorded %s on %s (error %v), want %s on %s (error %v)", got, e.Path, e.Goal == "error", c.crawl, c.path, c.err)
			}
			// Nothing about a person: the record is the crawler, the page and the time.
			for _, leak := range []string{"203.0.113", "Mozilla", "utm_source", "page=2"} {
				if strings.Contains(raw, leak) {
					t.Fatalf("the record carries %q: %s", leak, raw)
				}
			}
		})
	}
}

// What a setup can get wrong must fail loudly enough to fix, and harmlessly:
// the key is the only way in, the site and its host are checked, the body is
// small, and a forwarder's retry of the same hit is one hit.
func TestCrawlPayloadsAreChecked(t *testing.T) {
	const ok = `{"s":"tkb_test","u":"https://site.com/p","ua":"GPTBot/1.2","st":200}`
	cases := []struct {
		name string
		body string
		key  string
		want int
	}{
		{"the wrong key", ok, "tkb_px_wrong", http.StatusForbidden},
		{"no key", ok, "", http.StatusForbidden},
		{"another site's id", strings.Replace(ok, "tkb_test", "tkb_other", 1), "tkb_px_secret", http.StatusNotFound},
		{"a host that is not the site's", strings.Replace(ok, "site.com", "elsewhere.example", 1), "tkb_px_secret", http.StatusBadRequest},
		{"a body that is not JSON (an unescaped quote in a user agent)", `{"s":"tkb_test","u":"https://site.com/p","ua":"Bot"x"}`, "tkb_px_secret", http.StatusBadRequest},
		{"a body over 4 KB", `{"s":"tkb_test","u":"https://site.com/p","ua":"` + strings.Repeat("A", 5<<10) + `"}`, "tkb_px_secret", http.StatusBadRequest},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h, l := newHandler(t)
			before, _ := l.Committed()
			if w := crawlPost(h, c.body, c.key); w.Code != c.want {
				t.Fatalf("status %d, want %d", w.Code, c.want)
			}
			if after, _ := l.Committed(); after != before {
				t.Fatal("something was recorded")
			}
		})
	}

	// A forwarder that retries, or a Worker and a log forwarder both running:
	// the same robot asking for the same page in the same second is one hit.
	h, l := newHandler(t)
	for range 3 {
		if w := crawlPost(h, ok, "tkb_px_secret"); w.Code != http.StatusAccepted {
			t.Fatalf("status %d", w.Code)
		}
	}
	n, _ := l.Committed()
	e, _ := lastEvent(t, l)
	if want := crawlID(h.Now(), "tkb_test", "OpenAI/train", "/p"); n != 3 || e.EventID != want {
		t.Fatalf("three reports are written with one dedupe id, so the writer counts one: %d events, id %d, want %d", n, e.EventID, want)
	}
}

func crawlPost(h *Handler, body, key string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/crawl", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("X-Trckable-Proxy-Key", key)
	}
	w := httptest.NewRecorder()
	h.Crawl(w, req)
	return w
}
