package ingest

import "strings"

// Crawlers are the robots worth counting separately: the ones that answer a
// question for someone right now, the ones that index the web, and the ones
// that collect training data. Everything else is still dropped as a bot.
//
// They do not run JavaScript, so the browser script never sees them: these
// hits arrive from the customer's own server (POST /api/crawl), which is the
// only honest way to count them.
//
// Names and categories follow each company's published crawler documentation
// (September 2026). When a crawler changes purpose, the category moves with
// it — the point is what the visit was for, not who sent it.
type Crawler struct {
	Name string // the company or product, as people say it
	Kind string // answer | index | train
}

// crawlerUA matches a lowercase user agent to a crawler. Order matters: the
// more specific token wins, so ChatGPT-User is not mistaken for GPTBot.
var crawlerUA = []struct {
	token string
	c     Crawler
}{
	// Answering a question for a person, right now.
	{"chatgpt-user", Crawler{"OpenAI", "answer"}},
	{"oai-searchbot", Crawler{"OpenAI", "answer"}},
	{"claude-user", Crawler{"Anthropic", "answer"}},
	{"claude-searchbot", Crawler{"Anthropic", "answer"}},
	{"perplexity-user", Crawler{"Perplexity", "answer"}},
	{"perplexitybot", Crawler{"Perplexity", "answer"}},
	{"google-cloudvertexbot", Crawler{"Google", "answer"}},
	{"bingbot-chat", Crawler{"Microsoft", "answer"}},
	{"duckassistbot", Crawler{"DuckDuckGo", "answer"}},
	{"mistralai-user", Crawler{"Mistral", "answer"}},

	// Collecting pages to train on.
	{"gptbot", Crawler{"OpenAI", "train"}},
	{"claudebot", Crawler{"Anthropic", "train"}},
	{"anthropic-ai", Crawler{"Anthropic", "train"}},
	{"google-extended", Crawler{"Google", "train"}},
	{"meta-externalagent", Crawler{"Meta", "train"}},
	{"facebookbot", Crawler{"Meta", "train"}},
	{"bytespider", Crawler{"ByteDance", "train"}},
	{"ccbot", Crawler{"Common Crawl", "train"}},
	{"diffbot", Crawler{"Diffbot", "train"}},
	{"omgili", Crawler{"Webz.io", "train"}},
	{"timpibot", Crawler{"Timpi", "train"}},
	{"cohere-ai", Crawler{"Cohere", "train"}},
	{"cohere-training-data-crawler", Crawler{"Cohere", "train"}},
	{"mistralai-crawler", Crawler{"Mistral", "train"}},
	{"applebot-extended", Crawler{"Apple", "train"}},

	// Indexing the web for search.
	{"googlebot", Crawler{"Google", "index"}},
	{"bingbot", Crawler{"Microsoft", "index"}},
	{"slurp", Crawler{"Yahoo", "index"}},
	{"duckduckbot", Crawler{"DuckDuckGo", "index"}},
	{"baiduspider", Crawler{"Baidu", "index"}},
	{"yandexbot", Crawler{"Yandex", "index"}},
	{"applebot", Crawler{"Apple", "index"}},
	{"amazonbot", Crawler{"Amazon", "index"}},
	{"petalbot", Crawler{"Huawei", "index"}},
	{"seznambot", Crawler{"Seznam", "index"}},
	{"naver", Crawler{"Naver", "index"}},
	{"qwantbot", Crawler{"Qwant", "index"}},
	{"kagibot", Crawler{"Kagi", "index"}},
	{"ahrefsbot", Crawler{"Ahrefs", "index"}},
	{"semrushbot", Crawler{"Semrush", "index"}},
}

// ClassifyCrawler names the crawler behind a user agent, if it is one worth
// counting. ok is false for everything else, including ordinary bots.
func ClassifyCrawler(ua string) (Crawler, bool) {
	s := strings.ToLower(ua)
	for _, m := range crawlerUA {
		if strings.Contains(s, m.token) {
			return m.c, true
		}
	}
	return Crawler{}, false
}

// CrawlerKinds are the three categories, in the order the dashboard shows them.
var CrawlerKinds = []struct{ ID, Label, What string }{
	{"answer", "AI answers", "Fetched to answer someone's question right now"},
	{"index", "Indexing", "Crawled so your pages can be found"},
	{"train", "Training", "Collected as training data"},
}
