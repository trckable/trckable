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
