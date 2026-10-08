package ingest

import "testing"

func TestBrowserVersionIsTheMajorOnly(t *testing.T) {
	cases := []struct{ ua, browser, version string }{
		{chromeUA, "Chrome", "Chrome 140"},
		{"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0.1 Safari/605.1.15", "Safari", "Safari 18"},
		{"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox", "Firefox 131"},
		{"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.46", "Edge", "Edge 130"},
		{"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", "Safari", "Safari 17"},
	}
	for _, c := range cases {
		got := parseUA(c.ua, 0)
		if got.Bot || got.Browser != c.browser || got.Version != c.version {
			t.Errorf("%.60s…: %q %q (bot %v), want %q %q", c.ua, got.Browser, got.Version, got.Bot, c.browser, c.version)
		}
	}
}

// A user agent that names no version leaves the version empty: it is never
// "Chrome 0".
func TestBrowserVersionIsEmptyWhenTheAgentNamesNone(t *testing.T) {
	if v := browserVersion("Chrome", 0); v != "" {
		t.Errorf("no version: %q", v)
	}
	if v := browserVersion("", 12); v != "" {
		t.Errorf("no browser: %q", v)
	}
	if v := browserVersion("Opera", 115); v != "Opera 115" {
		t.Errorf("Opera 115: %q", v)
	}
}

// The version and the window width reach the event the writer stores.
func TestPageviewCarriesVersionAndWidth(t *testing.T) {
	h, l := newHandler(t)
	if w := post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","w":1366}`, chromeUA); w.Code != 202 {
		t.Fatalf("status %d", w.Code)
	}
	e, _ := lastEvent(t, l)
	if e.Browser != "Chrome" || e.BrowserVersion != "Chrome 140" || e.Screen != 1366 {
		t.Fatalf("event: browser %q version %q screen %d", e.Browser, e.BrowserVersion, e.Screen)
	}
}

func TestParseUABotFalsePositives(t *testing.T) {
	cases := []struct {
		name, ua string
		bot      bool
	}{
		{"cubot phone", "Mozilla/5.0 (Linux; Android 12; CUBOT_X70) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36", false},
		{"cubot with space", "Mozilla/5.0 (Linux; Android 11; CUBOT KingKong 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36", false},
		{"baidu app", "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 T7/13.52 baiduboxapp/13.52.0.10 (Baidu; P1 13)", false},
		{"baiduspider", "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)", true},
		{"baidu without spider", "Baidu-Transcoder/1.0", true},
		{"googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", true},
		{"bingbot", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", true},
		{"ahrefsbot", "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", true},
		{"cubot named bot", "Mozilla/5.0 (compatible; CUBOT_X70; MyBot/1.0)", true},
		{"chrome desktop", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := parseUA(c.ua, 0).Bot; got != c.bot {
				t.Fatalf("parseUA(%q).Bot = %v, want %v", c.ua, got, c.bot)
			}
		})
	}
}
